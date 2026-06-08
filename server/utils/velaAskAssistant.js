const { v4: uuidv4 } = require("uuid");
const { WorkspaceThread } = require("../models/workspaceThread");
const { STUDIO_ASSISTANT_ROLE_ID } = require("./velaCodeWorkspace");
const { streamVelaAgent } = require("./velaAgentRuntime");

/**
 * @deprecated Studio Ask uses the embedded chat stack (?studio=ask). Kept for internal assistant-stream shim.
 * Studio Ask — always uses Hub role studio-assistant (no Code role picker).
 * @param {object} params
 */
async function streamStudioAssistant({
  response,
  workspace,
  message,
  userId = null,
  threadSlug = null,
  attachments = [],
}) {
  let thread = null;
  if (threadSlug && workspace?.id) {
    thread = await WorkspaceThread.get({
      slug: threadSlug,
      workspace_id: workspace.id,
    });
  }

  await streamVelaAgent({
    response,
    workspace,
    message,
    user: null,
    thread,
    attachments,
    uuid: uuidv4(),
    options: {
      roleId: STUDIO_ASSISTANT_ROLE_ID,
      mode: "assistant",
      hubUserId:
        userId != null && String(userId).trim() ? String(userId).trim() : null,
    },
  });
}

module.exports = {
  streamStudioAssistant,
};
