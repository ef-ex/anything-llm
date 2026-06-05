const fs = require("fs");
const path = require("path");
const { safeJsonParse } = require("./http");

const MCP_SERVER_NAME = "vela-studio";

function mcpConfigPath() {
  return process.env.NODE_ENV === "development"
    ? path.resolve(
        __dirname,
        "../storage/plugins/anythingllm_mcp_servers.json"
      )
    : path.resolve(
        process.env.STORAGE_DIR ?? path.resolve(__dirname, "../storage"),
        "plugins/anythingllm_mcp_servers.json"
      );
}

function ensureVelaStudioMcpConfig() {
  const configPath = mcpConfigPath();
  if (!fs.existsSync(path.dirname(configPath))) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
  }
  const servers = safeJsonParse(
    fs.existsSync(configPath)
      ? fs.readFileSync(configPath, "utf8")
      : '{"mcpServers":{}}',
    { mcpServers: {} }
  );

  const pythonCmd = process.env.VELA_MCP_PYTHON || "python";
  servers.mcpServers[MCP_SERVER_NAME] = {
    command: pythonCmd,
    args: ["-m", "vela.mcp"],
    env: {
      VELA_API_URL: process.env.VELA_API_URL || "http://127.0.0.1:7001",
      VELA_CHAT_INTERNAL_TOKEN: process.env.VELA_CHAT_INTERNAL_TOKEN || "",
      VELA_DATA_DIR: process.env.VELA_DATA_DIR || "",
    },
    anythingllm: {
      suppressedTools: [],
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(servers, null, 2), "utf8");
  return MCP_SERVER_NAME;
}

function isVelaAskAssistantWorkspace(workspace) {
  return (
    workspace?.chatProvider === "vela-dispatch" &&
    workspace?.velaRolePresetId === "studio-assistant"
  );
}

module.exports = {
  MCP_SERVER_NAME,
  ensureVelaStudioMcpConfig,
  isVelaAskAssistantWorkspace,
};
