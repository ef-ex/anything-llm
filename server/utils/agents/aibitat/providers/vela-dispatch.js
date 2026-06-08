const Provider = require("./ai-provider.js");
const { velaApiRequest } = require("../../../velaApi");
const {
  formatFunctionsToTools,
  formatMessagesForTools,
} = require("./helpers/tooled.js");
const { safeJsonParse } = require("../../../http");

const CODE_AGENT_TIMEOUT_MS = parseInt(
  process.env.VELA_CODE_AGENT_TIMEOUT_MS || "300000",
  10
);
const INCLUDE_HUB_CONTEXT = process.env.VELA_CODE_AGENT_INCLUDE_CONTEXT === "1";

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
    const modelId =
      this.model && this.model !== "vela-dispatch" && this.model !== "gpt-4o"
        ? this.model
        : this.workspace?.agentModel || this.workspace?.chatModel || null;
    const payload = {
      project_id: this.workspace?.velaProjectId,
      role_id: this.workspace?.velaRolePresetId,
      workspace_id: this.workspace?.id ? String(this.workspace.id) : null,
      user_id: this.userId ? String(this.userId) : undefined,
      messages,
      tools: tools.length ? tools : undefined,
      include_context: INCLUDE_HUB_CONTEXT,
      options: { temperature: 0.3, stream: false },
    };
    if (modelId && modelId !== "vela-dispatch") {
      payload.model_id = modelId;
    }
    return payload;
  }

  async #postChat(messages, functions = []) {
    if (!this.workspace?.velaProjectId || !this.workspace?.velaRolePresetId) {
      throw new Error("Workspace missing Vela project or role preset");
    }

    const formatted = formatMessagesForTools(messages);
    const result = await velaApiRequest("provider/chat", {
      method: "POST",
      body: this.#dispatchBody(formatted, functions),
      timeoutMs: CODE_AGENT_TIMEOUT_MS,
    });
    if (!result.ok) {
      throw new Error(
        `Vela dispatch failed (${result.status}): ${result.error || "unknown error"}`
      );
    }
    return result.data;
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

  /**
   * Get the cost of the completion.
   * Stubbed — Vela Hub tracks dispatch cost on the backend.
   * @param _usage The completion usage to get the cost for.
   * @returns The cost of the completion.
   */
  getCost(_usage) {
    return 0;
  }
}

module.exports = VelaDispatchProvider;
