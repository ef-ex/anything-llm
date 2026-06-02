/**
 * M33 — Vela Hub provider control plane flags.
 */

function hubControlsProviders() {
  const v = process.env.VELA_HUB_CONTROLS_PROVIDERS;
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

function allowStockLlm() {
  const v = String(process.env.VELA_ALLOW_STOCK_LLM || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function hubAdminUrl() {
  return process.env.VELA_ADMIN_URL || "http://127.0.0.1:7001";
}

const LLM_ENV_KEYS = new Set([
  "LLMProvider",
  "OpenAiKey",
  "OpenAiModelPref",
  "AnthropicApiKey",
  "GeminiLLMApiKey",
  "AzureOpenAiKey",
  "AzureOpenAiEndpoint",
]);

function blocksLlmEnvUpdate(body) {
  if (!hubControlsProviders() || allowStockLlm()) return false;
  if (!body || typeof body !== "object") return false;
  return Object.keys(body).some((key) => LLM_ENV_KEYS.has(key));
}

function hubProviderBlockResponse() {
  return {
    error:
      "Provider configuration is managed in Vela Hub when VELA_HUB_CONTROLS_PROVIDERS is enabled.",
    hub_url: `${hubAdminUrl()}#ai-providers/profiles`,
    code: "vela_hub_controls_providers",
  };
}

module.exports = {
  hubControlsProviders,
  allowStockLlm,
  hubAdminUrl,
  blocksLlmEnvUpdate,
  hubProviderBlockResponse,
  LLM_ENV_KEYS,
};
