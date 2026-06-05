const { v4: uuidv4 } = require("uuid");
const {
  EphemeralAgentHandler,
  EphemeralEventListener,
} = require("./agents/ephemeral");
const { WorkspaceThread } = require("../models/workspaceThread");
const {
  ensureVelaStudioMcpConfig,
  MCP_SERVER_NAME,
} = require("./velaStudioMcp");

/**
 * Stream Studio Assistant agent loop (AIbitat + vela-studio MCP) over HTTP SSE.
 * @param {object} params
 * @param {import("express").Response} params.response
 * @param {object} params.workspace
 * @param {string} params.message
 * @param {string|null} params.userId
 * @param {string|null} params.threadSlug
 * @param {Array} params.attachments
 */
async function streamStudioAssistant({
  response,
  workspace,
  message,
  userId = null,
  threadSlug = null,
  attachments = [],
}) {
  ensureVelaStudioMcpConfig();

  const uuid = uuidv4();
  let thread = null;
  if (threadSlug) {
    thread = await WorkspaceThread.get({
      slug: threadSlug,
      workspace_id: workspace.id,
    });
  }

  const agentHandler = new EphemeralAgentHandler({
    uuid,
    workspace,
    prompt: message,
    userId,
    threadId: thread?.id ?? null,
    sessionId: null,
    attachments,
  });

  const eventListener = new EphemeralEventListener();
  await agentHandler.init();
  await agentHandler.createAIbitat({
    handler: eventListener,
    toolOverrides: [`@@mcp_${MCP_SERVER_NAME}`],
  });

  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders?.();

  agentHandler.startAgentCluster();

  return eventListener.streamAgentEvents(response, uuid);
}

module.exports = { streamStudioAssistant };
