const { v4: uuidv4 } = require("uuid");
const {
  EphemeralAgentHandler,
  EphemeralEventListener,
} = require("./agents/ephemeral");
const { WorkspaceThread } = require("../models/workspaceThread");
const { WorkspaceChats } = require("../models/workspaceChats");
const { velaApiRequest, velaUserId, parsePrismaUserId } = require("./velaApi");
const { ensureVelaCodeMcpConfig } = require("./velaCodeMcp");
const {
  DEFAULT_STUDIO_MCP_ID,
  mcpIdsFromToolClasses,
  shouldUseCodeAgentLoop,
  toolOverridesFromBindings,
} = require("./velaCodeWorkspace");
const { buildAgentSystemRole } = require("./velaCodeAgentRole");
const { writeResponseChunk } = require("./helpers/chat/responses");
const CODE_AGENT_TIMEOUT_MS = parseInt(
  process.env.VELA_CODE_AGENT_TIMEOUT_MS || "300000",
  10
);
const SSE_HEARTBEAT_MS = parseInt(
  process.env.VELA_CODE_AGENT_SSE_HEARTBEAT_MS || "15000",
  10
);

/** Keep the HTTP SSE connection alive during long agent tool loops. */
function startSseHeartbeat(response) {
  const timer = setInterval(() => {
    if (response.writableEnded) return;
    try {
      response.write(": keepalive\n\n");
    } catch {
      clearInterval(timer);
    }
  }, SSE_HEARTBEAT_MS);
  return () => clearInterval(timer);
}

/**
 * @param {object} workspace
 * @param {string} roleId
 * @returns {Promise<object>}
 */
/**
 * Resolve the Hub dispatch route for a Studio Code role (orchestration + project overrides).
 * @param {object} workspace
 * @param {string} roleId
 * @returns {Promise<object|null>}
 */
async function fetchRoleDispatchRoute(workspace, roleId) {
  const result = await velaApiRequest("role-presets/resolve", {
    method: "POST",
    body: {
      role_id: roleId,
      project_id: workspace.velaProjectId,
      required_capabilities: ["tool_calling"],
    },
    timeoutMs: CODE_AGENT_TIMEOUT_MS,
  });
  if (result.ok && result.data) {
    return result.data;
  }
  console.warn(
    `[vela] role-presets/resolve failed for role=${roleId}: ${result.error}`
  );
  return null;
}

async function fetchRuntimeBindings(workspace, roleId) {
  const result = await velaApiRequest("orchestration/runtime-bindings", {
    query: {
      role_id: roleId,
      project_id: workspace.velaProjectId,
      workspace_id: workspace?.id ? String(workspace.id) : undefined,
    },
    timeoutMs: CODE_AGENT_TIMEOUT_MS,
  });
  if (result.ok && result.data) {
    return result.data;
  }

  console.warn(
    `[vela] runtime-bindings failed for role=${roleId}: ${result.error}`
  );

  const presetResult = await velaApiRequest(`role-presets/${roleId}`, {
    timeoutMs: CODE_AGENT_TIMEOUT_MS,
  });
  const toolClasses =
    presetResult.ok && presetResult.data
      ? presetResult.data.allowed_tool_classes
      : [];
  const fallbackMcps = mcpIdsFromToolClasses(toolClasses).map((id) => ({ id }));
  const fallback = {
    allowed_tool_classes: toolClasses,
    mcp_servers: fallbackMcps.length
      ? fallbackMcps
      : [{ id: DEFAULT_STUDIO_MCP_ID }],
    source: "role_preset_client_fallback",
  };
  return fallback;
}

/**
 * Resolve a Studio Code role against Hub's picker list (excludes legacy bundled roles).
 * @param {object} workspace
 * @param {string|null|undefined} roleId
 * @param {object|null} user
 * @returns {Promise<string|null>}
 */
async function resolveAgentRoleId(workspace, roleId, user) {
  const explicit =
    typeof roleId === "string" && roleId.trim() ? roleId.trim() : "";
  const candidate = explicit || workspace?.velaRolePresetId?.trim?.() || "";
  if (!candidate || !workspace?.velaProjectId) return candidate || null;

  const result = await velaApiRequest("studio/code-roles", {
    query: {
      user_id: velaUserId(user),
      project_id: workspace.velaProjectId,
    },
    timeoutMs: CODE_AGENT_TIMEOUT_MS,
  });
  if (!result.ok || !result.data) {
    return candidate;
  }

  const roles = result.data.roles || [];
  const ids = new Set(roles.map((r) => r.id));
  if (ids.has(candidate)) return candidate;

  const fallback = result.data.default_role_id || roles[0]?.id;
  if (fallback && ids.has(fallback)) {
    console.warn(
      `[vela] studio code role "${candidate}" is not available; using "${fallback}"`
    );
    return fallback;
  }
  return null;
}

/**
 * Stream Studio Code agent loop (AIbitat + Hub MCP + vela-dispatch) over HTTP SSE.
 * @param {object} params
 */
async function streamCodeAgent({
  response,
  workspace,
  message,
  user = null,
  thread = null,
  attachments = [],
  uuid = null,
  options = {},
}) {
  ensureVelaCodeMcpConfig();

  const streamUuid = uuid || uuidv4();
  const roleId = await resolveAgentRoleId(workspace, options.roleId, user);
  if (!roleId) {
    writeResponseChunk(response, {
      uuid: streamUuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: "No coding role selected for this agent.",
    });
    return;
  }

  const agentWorkspace = {
    ...workspace,
    velaRolePresetId: roleId,
    chatProvider: "vela-dispatch",
    agentProvider: "vela-dispatch",
    agentModel: null,
  };

  const [bindings, dispatchRoute] = await Promise.all([
    fetchRuntimeBindings(agentWorkspace, roleId),
    fetchRoleDispatchRoute(workspace, roleId),
  ]);
  const toolOverrides = toolOverridesFromBindings(bindings);

  // Never inherit a stale workspace chatModel from another role (e.g. gpt-4o on openai-hosted).
  const routedModelId = dispatchRoute?.model_id ?? null;
  agentWorkspace.chatModel = routedModelId;
  agentWorkspace.agentModel = routedModelId;

  const instructions = (bindings?.worker_instructions || "").trim();
  const roleDisplayName =
    dispatchRoute?.display_name ||
    dispatchRoute?.role_display_name ||
    bindings?.display_name ||
    null;
  const hubUserId =
    options.hubUserId != null && String(options.hubUserId).trim()
      ? String(options.hubUserId).trim()
      : velaUserId(user);
  const prismaUserId = parsePrismaUserId(user?.id);
  const prismaUser = prismaUserId != null ? { id: prismaUserId } : null;
  const sessionPrefix = [
    "Session (pass project_id and user_id to every vela_* tool):",
    `- project_id: ${workspace.velaProjectId}`,
    `- user_id: ${hubUserId}`,
    `- role_id: ${roleId}`,
    "",
  ].join("\n");
  const agentMessage = `${sessionPrefix}${message}`;

  const agentRoleOverride = buildAgentSystemRole({
    roleId,
    displayName: roleDisplayName,
    instructions,
  });

  const agentHandler = new EphemeralAgentHandler({
    uuid: streamUuid,
    workspace: agentWorkspace,
    prompt: agentMessage,
    userId: prismaUserId != null ? String(prismaUserId) : null,
    hubUserId,
    threadId: thread?.id ?? null,
    sessionId: null,
    attachments,
    agentRoleOverride,
  });

  const eventListener = new EphemeralEventListener();
  try {
    await agentHandler.init();
  } catch (initErr) {
    writeResponseChunk(response, {
      uuid: streamUuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: initErr?.message || "Code agent failed to start.",
    });
    return;
  }
  await agentHandler.createAIbitat({
    handler: eventListener,
    toolOverrides,
  });

  const stopHeartbeat = startSseHeartbeat(response);
  let closed;
  try {
    agentHandler.startAgentCluster();
    closed = await eventListener.streamAgentEvents(response, streamUuid);
  } finally {
    stopHeartbeat();
  }

  const {
    thoughts = [],
    textResponse = null,
    outputs = [],
    metrics = {},
  } = closed || {};

  let chatId = null;
  if (textResponse) {
    const { chat } = await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        type: workspace?.chatMode || "agent",
        attachments,
        agentThoughts: thoughts,
        outputs,
      },
      threadId: thread?.id || null,
      user: prismaUser,
    });
    chatId = chat?.id ?? null;
  }

  writeResponseChunk(response, {
    uuid: streamUuid,
    type: "finalizeResponseStream",
    close: true,
    error: false,
    chatId,
    metrics,
  });

  return closed;
}

module.exports = {
  shouldUseCodeAgentLoop,
  streamCodeAgent,
  toolOverridesFromBindings,
};
