/**
 * Local Vela Hub dev: load shared Studio Code token from parent repo config/.
 * Matches scripts/launch-dev.ps1 and vela.config candidate auto-load.
 */
const fs = require("fs");
const path = require("path");

function hubConfigPath(...parts) {
  return path.join(__dirname, "..", "..", "..", "config", ...parts);
}

function applyDevChatTokenFromHubRepo() {
  if (process.env.VELA_CHAT_INTERNAL_TOKEN?.trim()) return;
  const tokenPath = hubConfigPath(".dev-chat-internal-token");
  try {
    if (!fs.existsSync(tokenPath)) return;
    const token = fs.readFileSync(tokenPath, "utf8").trim();
    if (token) process.env.VELA_CHAT_INTERNAL_TOKEN = token;
  } catch {
    // optional dev convenience; production must set env explicitly
  }
}

module.exports = { applyDevChatTokenFromHubRepo };
