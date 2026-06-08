const STUDIO_ASSISTANT_ROLE_ID = "studio-assistant";
const DEFAULT_CODE_MCP_ID = "vela-code";
const DEFAULT_STUDIO_MCP_ID = "vela-studio";

const CODE_TOOL_CLASSES = new Set(["code", "filesystem", "adapter", "pipeline"]);
const STUDIO_TOOL_CLASSES = new Set(["research", "chat", "entity", "notes"]);

/**
 * True when workspace is a Studio Code embed agent (vela-dispatch + project).
 * @param {object|null|undefined} workspace
 * @returns {boolean}
 */
function isStudioCodeAgentWorkspace(workspace) {
  return (
    !!workspace?.velaProjectId && workspace?.chatProvider === "vela-dispatch"
  );
}

/**
 * @param {object} workspace
 * @param {{ studioCodeAgent?: boolean, roleId?: string|null }} options
 * @returns {boolean}
 */
function shouldUseCodeAgentLoop(workspace, options = {}) {
  if (options.studioCodeAgent === false) return false;
  if (!isStudioCodeAgentWorkspace(workspace)) return false;
  // Studio Code embed passes per-thread role_id — always use the agent loop so
  // Hub routing matches the role picker (including studio-assistant).
  if (options.studioCodeAgent && options.roleId) return true;
  // Ask workspace and assistant-stream always use studio-assistant via agent loop.
  if (workspace?.velaRolePresetId === STUDIO_ASSISTANT_ROLE_ID) return true;
  return true;
}

/**
 * @param {string[]|null|undefined} toolClasses
 * @returns {string[]}
 */
function mcpIdsFromToolClasses(toolClasses) {
  const tools = new Set(Array.isArray(toolClasses) ? toolClasses : []);
  const ids = [];
  for (const toolClass of tools) {
    if (STUDIO_TOOL_CLASSES.has(toolClass) && !ids.includes(DEFAULT_STUDIO_MCP_ID)) {
      ids.push(DEFAULT_STUDIO_MCP_ID);
    }
    if (CODE_TOOL_CLASSES.has(toolClass) && !ids.includes(DEFAULT_CODE_MCP_ID)) {
      ids.push(DEFAULT_CODE_MCP_ID);
    }
  }
  if (ids.length === 0) ids.push(DEFAULT_STUDIO_MCP_ID);
  return ids;
}

/**
 * @param {object} bindings
 * @returns {string[]}
 */
function toolOverridesFromBindings(bindings) {
  const overrides = [];
  const mcps = Array.isArray(bindings?.mcp_servers) ? bindings.mcp_servers : [];
  for (const mcp of mcps) {
    const id = mcp?.id;
    if (typeof id === "string" && id.trim()) {
      overrides.push(`@@mcp_${id.trim()}`);
    }
  }
  if (overrides.length === 0) {
    for (const id of mcpIdsFromToolClasses(bindings?.allowed_tool_classes)) {
      overrides.push(`@@mcp_${id}`);
    }
  }
  return overrides;
}

module.exports = {
  STUDIO_ASSISTANT_ROLE_ID,
  DEFAULT_CODE_MCP_ID,
  DEFAULT_STUDIO_MCP_ID,
  isStudioCodeAgentWorkspace,
  shouldUseCodeAgentLoop,
  mcpIdsFromToolClasses,
  toolOverridesFromBindings,
};
