const { v4: uuidv4 } = require("uuid");
const { WorkspaceChats } = require("../models/workspaceChats");
const { writeResponseChunk } = require("./helpers/chat/responses");
const { velaApiRequest, velaUserId, parsePrismaUserId } = require("./velaApi");
const { STUDIO_ASSISTANT_ROLE_ID } = require("./velaCodeWorkspace");

const AGENT_TIMEOUT_MS = parseInt(
  process.env.VELA_AGENT_RUNTIME_TIMEOUT_MS ||
    process.env.VELA_CODE_AGENT_TIMEOUT_MS ||
    "300000",
  10
);
const SSE_HEARTBEAT_MS = parseInt(
  process.env.VELA_AGENT_SSE_HEARTBEAT_MS ||
    process.env.VELA_CODE_AGENT_SSE_HEARTBEAT_MS ||
    "15000",
  10
);

/** @typedef {import('./velaAgentRuntime.types')} AgentEvent */

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
 * Parse Hub agent SSE lines from a fetch reader.
 * @param {ReadableStreamDefaultReader<Uint8Array>} reader
 * @returns {AsyncGenerator<Record<string, unknown>>}
 */
async function* readHubAgentEvents(reader) {
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const lines = part.split("\n");
      let dataLine = null;
      for (const line of lines) {
        if (line.startsWith("data:")) {
          dataLine = line.slice(5).trim();
        }
      }
      if (!dataLine) continue;
      try {
        const parsed = JSON.parse(dataLine);
        if (parsed && typeof parsed === "object") yield parsed;
      } catch {
        // ignore malformed chunks
      }
    }
  }
}

/**
 * Map Hub agent events to a single agentEvent chunk (timeline UI owns display).
 * @param {Record<string, unknown>} event
 * @param {string} uuid
 * @param {{ text: string, reasoning: string, agentEvents: object[], runId: string|null }} state
 */
function mapAgentEventToChunks(event, uuid, state) {
  const type = String(event.type || "");
  const payload =
    event.payload && typeof event.payload === "object" ? event.payload : {};
  state.agentEvents.push(event);
  if (event.run_id) state.runId = String(event.run_id);

  if (type === "reasoning.delta" && payload.delta) {
    state.reasoning += String(payload.delta);
  }
  if (type === "message.delta" && payload.delta) {
    state.text += String(payload.delta);
  }
  if (type === "agent.completed" && payload.output_text && !state.text) {
    state.text = String(payload.output_text);
  }

  const chunks = [{ type: "agentEvent", uuid, event, velaAgent: true }];

  if (type === "agent.failed") {
    chunks.push({
      type: "abort",
      uuid,
      textResponse: null,
      close: true,
      error: String(payload.error || "Agent failed"),
      velaAgent: true,
    });
  }

  return chunks;
}

/**
 * Resolve Studio Code role against Hub picker list.
 */
async function resolveAgentRoleId(workspace, roleId, user) {
  const explicit =
    typeof roleId === "string" && roleId.trim() ? roleId.trim() : "";
  const candidate = explicit || workspace?.velaRolePresetId?.trim?.() || "";
  if (candidate === STUDIO_ASSISTANT_ROLE_ID) return candidate;
  if (!candidate || !workspace?.velaProjectId) return candidate || null;

  const result = await velaApiRequest("studio/code-roles", {
    query: {
      user_id: velaUserId(user),
      project_id: workspace.velaProjectId,
    },
    timeoutMs: AGENT_TIMEOUT_MS,
  });
  if (!result.ok || !result.data) return candidate;

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

function isVelaAgentWorkspace(workspace) {
  return (
    !!workspace?.velaProjectId && workspace?.chatProvider === "vela-dispatch"
  );
}

/**
 * Stream unified Vela agent runtime from Hub over HTTP SSE.
 */
async function streamVelaAgent({
  response,
  workspace,
  message,
  user = null,
  thread = null,
  attachments = [],
  uuid = null,
  options = {},
}) {
  const streamUuid = uuid || uuidv4();
  const roleId = await resolveAgentRoleId(workspace, options.roleId, user);
  let streamTerminalSent = false;
  const writeTerminalChunk = (chunk) => {
    writeResponseChunk(response, chunk);
    if (
      chunk.type === "abort" ||
      chunk.type === "finalizeResponseStream"
    ) {
      streamTerminalSent = true;
    }
  };

  if (!roleId) {
    writeTerminalChunk({
      uuid: streamUuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: "No role selected for this Vela agent.",
    });
    return;
  }

  const hubUserId =
    options.hubUserId != null && String(options.hubUserId).trim()
      ? String(options.hubUserId).trim()
      : velaUserId(user);
  const prismaUserId = parsePrismaUserId(user?.id);
  const prismaUser = prismaUserId != null ? { id: prismaUserId } : null;

  const body = {
    project_id: workspace.velaProjectId,
    user_id: hubUserId,
    role_id: roleId,
    message,
    workspace_id: workspace?.id ? String(workspace.id) : null,
    thread_id: thread?.id ? String(thread.id) : null,
    mode:
      options.mode ||
      (roleId === STUDIO_ASSISTANT_ROLE_ID
        ? "assistant"
        : options.studioCodeAgent
          ? "code"
          : "assistant"),
    attachments: Array.isArray(attachments) ? attachments : [],
  };

  const { VELA_API_URL } = require("./velaContext");
  if (!VELA_API_URL) {
    writeTerminalChunk({
      uuid: streamUuid,
      type: "abort",
      close: true,
      error: "Vela backend not configured (VELA_API_URL)",
    });
    return;
  }

  const token = process.env.VELA_CHAT_INTERNAL_TOKEN || "";
  const url = `${VELA_API_URL}/api/agent/stream`;
  const stopHeartbeat = startSseHeartbeat(response);
  const state = {
    text: "",
    reasoning: "",
    agentEvents: [],
    runId: null,
  };

  let chatId = null;
  let streamFailed = false;
  let lastStreamError = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
    let fetchResponse;
    try {
      fetchResponse = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(token ? { "X-Vela-Chat-Token": token } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!fetchResponse.ok) {
      const errText = await fetchResponse.text();
      let detail = errText.slice(0, 500);
      try {
        const parsed = JSON.parse(errText);
        if (parsed?.detail) {
          detail =
            typeof parsed.detail === "string"
              ? parsed.detail
              : JSON.stringify(parsed.detail).slice(0, 500);
        }
      } catch {
        // keep raw text
      }
      streamFailed = true;
      lastStreamError = detail || `Agent stream failed (${fetchResponse.status})`;
      writeTerminalChunk({
        uuid: streamUuid,
        type: "abort",
        close: true,
        error: lastStreamError,
      });
      return;
    }

    const reader = fetchResponse.body?.getReader();
    if (!reader) {
      streamFailed = true;
      lastStreamError = "Agent stream returned no body";
      writeTerminalChunk({
        uuid: streamUuid,
        type: "abort",
        close: true,
        error: lastStreamError,
      });
      return;
    }

    for await (const event of readHubAgentEvents(reader)) {
      const chunks = mapAgentEventToChunks(event, streamUuid, state);
      for (const chunk of chunks) {
        if (
          chunk.type === "abort" ||
          chunk.type === "finalizeResponseStream"
        ) {
          if (chunk.type === "abort") {
            streamFailed = true;
            lastStreamError = chunk.error || lastStreamError;
          }
          writeTerminalChunk(chunk);
        } else {
          writeResponseChunk(response, chunk);
        }
      }
      if (event.type === "agent.failed") {
        streamFailed = true;
        const failedPayload =
          event.payload && typeof event.payload === "object"
            ? event.payload
            : {};
        lastStreamError = String(failedPayload.error || lastStreamError || "");
      }
    }
  } catch (err) {
    streamFailed = true;
    lastStreamError =
      err?.name === "AbortError"
        ? `Agent stream timed out after ${Math.round(AGENT_TIMEOUT_MS / 1000)}s`
        : err?.message || "Agent stream failed";
    writeTerminalChunk({
      uuid: streamUuid,
      type: "abort",
      close: true,
      error: lastStreamError,
    });
    return;
  } finally {
    stopHeartbeat();
  }

  if (state.text) {
    try {
      const { chat } = await WorkspaceChats.new({
        workspaceId: workspace.id,
        prompt: message,
        response: {
          text: state.text,
          sources: [],
          type: workspace?.chatMode || "chat",
          attachments,
          agentEvents: state.agentEvents,
          runId: state.runId,
          reasoning: state.reasoning || undefined,
          velaAgent: true,
        },
        threadId: thread?.id || null,
        user: prismaUser,
      });
      chatId = chat?.id ?? null;
    } catch (persistErr) {
      console.error("[vela] failed to persist agent chat:", persistErr);
    }
  }

  if (!streamTerminalSent) {
    if (streamFailed) {
      writeTerminalChunk({
        uuid: streamUuid,
        type: "abort",
        close: true,
        error: lastStreamError || "Agent stream failed",
      });
    } else {
      writeTerminalChunk({
        uuid: streamUuid,
        type: "finalizeResponseStream",
        close: true,
        error: false,
        chatId,
        metrics: {},
      });
    }
  }

  return {
    textResponse: state.text,
    agentEvents: state.agentEvents,
    runId: state.runId,
  };
}

module.exports = {
  AGENT_TIMEOUT_MS,
  STUDIO_ASSISTANT_ROLE_ID,
  isVelaAgentWorkspace,
  resolveAgentRoleId,
  streamVelaAgent,
  mapAgentEventToChunks,
  readHubAgentEvents,
};
