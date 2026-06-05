const Provider = require("./ai-provider.js");
const { VELA_API_URL } = require("../../../velaContext");
const {
  formatFunctionsToTools,
  formatMessagesForTools,
} = require("./helpers/tooled.js");
const { safeJsonParse } = require("../../../http");

/**
 * AIbitat provider for Vela Hub dispatch (studio-assistant agent loop).
 */
class VelaDispatchProvider extends Provider {
  constructor(config = {}) {
    super(null);
    this.workspace = config.workspace || null;
    this.userId = config.userId || null;
    this.model = config.model || "gpt-4o-mini";
    this.verbose = true;
  }

  get supportsAgentStreaming() {
    return false;
  }

  supportsNativeToolCalling() {
    return true;
  }

  #dispatchBody(messages, functions = []) {
    const tools = formatFunctionsToTools(functions);
    return {
      project_id: this.workspace?.velaProjectId,
      role_id: this.workspace?.velaRolePresetId,
      workspace_id: this.workspace?.id ? String(this.workspace.id) : null,
      user_id: this.userId ? String(this.userId) : undefined,
      messages,
      tools: tools.length ? tools : undefined,
      options: { temperature: 0.3, stream: false },
    };
  }

  async #postChat(messages, functions = []) {
    if (!VELA_API_URL) throw new Error("VELA_API_URL is not configured");
    if (!this.workspace?.velaProjectId || !this.workspace?.velaRolePresetId) {
      throw new Error("Workspace missing Vela project or role preset");
    }

    const formatted = formatMessagesForTools(messages);
    const resp = await fetch(`${VELA_API_URL}/api/provider/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.#dispatchBody(formatted, functions)),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Vela dispatch failed (${resp.status}): ${text.slice(0, 300)}`);
    }
    return resp.json();
  }

  async complete(messages, functions = []) {
    this.providerLog("VelaDispatch.complete");
    this.resetUsage();
    const data = await this.#postChat(messages, functions);
    const toolCalls = Array.isArray(data.tool_calls) ? data.tool_calls : [];
    if (toolCalls.length > 0) {
      const first = toolCalls[0];
      return {
        textResponse: data.content || "",
        functionCall: {
          id: first.id || `call_${Date.now()}`,
          name: first.name,
          arguments:
            typeof first.arguments === "string"
              ? safeJsonParse(first.arguments, {})
              : first.arguments || {},
        },
        cost: this.getCost(),
      };
    }
    return {
      textResponse: data.content || "",
      functionCall: null,
      cost: this.getCost(),
    };
  }

  async stream(messages, functions = [], eventHandler = null) {
    const result = await this.complete(messages, functions);
    if (eventHandler && result.textResponse) {
      eventHandler({
        type: "reportStreamEvent",
        content: { type: "fullTextResponse", content: result.textResponse },
      });
    }
    return result;
  }
}

module.exports = VelaDispatchProvider;
