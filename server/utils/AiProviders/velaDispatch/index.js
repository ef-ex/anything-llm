const { NativeEmbedder } = require("../../EmbeddingEngines/native");
const {
  handleDefaultStreamResponseV2,
  formatChatHistory,
} = require("../../helpers/chat/responses");
const {
  LLMPerformanceMonitor,
} = require("../../helpers/chat/LLMPerformanceMonitor");
const { VELA_API_URL } = require("../../velaContext");
const { repairMojibake } = require("../../helpers/mojibake");

const VELA_CHAT_TIMEOUT_MS = parseInt(
  process.env.VELA_CHAT_TIMEOUT_MS || "120000",
  10
);

/**
 * Cursor / dispatch streams may repeat cumulative text or resend the full message on the
 * last chunk. Normalize to incremental deltas before handleDefaultStreamResponseV2.
 */
async function* normalizeOpenAiStreamDeltas(stream) {
  let emitted = "";
  for await (const chunk of stream) {
    const choice = chunk?.choices?.[0];
    let deltaText = choice?.delta?.content;
    if (typeof deltaText !== "string" || deltaText.length === 0) {
      yield chunk;
      continue;
    }

    deltaText = repairMojibake(deltaText);

    const trimmedEmitted = emitted.trimEnd();
    const trimmedDelta = deltaText.trimEnd();

    let incremental = "";
    if (!emitted) {
      incremental = deltaText;
      emitted = deltaText;
    } else if (
      deltaText === emitted ||
      trimmedDelta === trimmedEmitted ||
      emitted.includes(deltaText) ||
      emitted.endsWith(deltaText)
    ) {
      incremental = "";
    } else if (emitted.startsWith(deltaText)) {
      incremental = "";
    } else if (deltaText.startsWith(emitted)) {
      incremental = deltaText.slice(emitted.length);
      emitted = deltaText;
    } else if (trimmedDelta.startsWith(trimmedEmitted)) {
      incremental = deltaText.slice(trimmedEmitted.length);
      emitted = deltaText;
    } else if (deltaText.length > 40) {
      let prefixLen = 0;
      const max = Math.min(emitted.length, deltaText.length);
      while (prefixLen < max && emitted[prefixLen] === deltaText[prefixLen]) {
        prefixLen++;
      }
      if (
        prefixLen >= Math.min(emitted.length, deltaText.length) - 2 ||
        prefixLen > emitted.length * 0.6
      ) {
        incremental = "";
      } else {
        incremental = deltaText;
        emitted += deltaText;
      }
    } else {
      incremental = deltaText;
      emitted += deltaText;
    }

    if (!incremental) continue;

    yield {
      ...chunk,
      choices: [
        {
          ...choice,
          delta: { ...choice.delta, content: incremental },
        },
      ],
    };
  }
}

async function* parseOpenAiSseStream(responseBody) {
  const reader = responseBody.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        yield JSON.parse(data);
      } catch {
        // skip malformed SSE lines
      }
    }
  }
}

/**
 * OpenAI-compatible chat via Vela provider dispatch (M12).
 * Resolves project-scoped credentials on the Vela backend — no provider secrets in AnythingLLM .env.
 */
class VelaLLMConnector {
  constructor({ workspace, modelPreference = null, userId = null } = {}) {
    if (!VELA_API_URL) {
      throw new Error(
        "Vela dispatch requires VELA_API_URL to be configured on the AnythingLLM server."
      );
    }
    if (!workspace?.velaProjectId || !workspace?.velaRolePresetId) {
      throw new Error(
        "Vela dispatch requires a bound Vela project and selected role preset on the workspace."
      );
    }

    this.className = "VelaLLMConnector";
    this.workspace = workspace;
    this.userId = userId;
    this.model = modelPreference || workspace.chatModel || "gpt-4o-mini";
    this.embedder = new NativeEmbedder();
    this.defaultTemp = 0.7;
    this.limits = {
      history: this.promptWindowLimit() * 0.15,
      system: this.promptWindowLimit() * 0.15,
      user: this.promptWindowLimit() * 0.7,
    };
    this.log(
      `Dispatch via Vela project=${workspace.velaProjectId} role=${workspace.velaRolePresetId} model=${this.model}`
    );
  }

  log(text, ...args) {
    console.log(`\x1b[35m[${this.className}]\x1b[0m ${text}`, ...args);
  }

  streamingEnabled() {
    return true;
  }

  static promptWindowLimit() {
    return Number(process.env.VELA_DISPATCH_CONTEXT_WINDOW || 128000);
  }

  promptWindowLimit() {
    return VelaLLMConnector.promptWindowLimit();
  }

  isValidChatCompletionModel() {
    return true;
  }

  #appendContext(contextTexts = []) {
    if (!contextTexts?.length) return "";
    return (
      "\nContext:\n" +
      contextTexts
        .map((text, i) => `[CONTEXT ${i}]:\n${text}\n[END CONTEXT ${i}]\n\n`)
        .join("")
    );
  }

  #generateContent({ userPrompt, attachments = [] }) {
    if (!attachments.length) return userPrompt;
    const content = [{ type: "text", text: userPrompt }];
    for (const attachment of attachments) {
      content.push({
        type: "image_url",
        image_url: { url: attachment.contentString, detail: "high" },
      });
    }
    return content;
  }

  constructPrompt({
    systemPrompt = "",
    contextTexts = [],
    chatHistory = [],
    userPrompt = "",
    attachments = [],
  }) {
    return [
      {
        role: "system",
        content: `${systemPrompt}${this.#appendContext(contextTexts)}`,
      },
      ...formatChatHistory(chatHistory, this.#generateContent.bind(this)),
      {
        role: "user",
        content: this.#generateContent({ userPrompt, attachments }),
      },
    ];
  }

  async compressMessages(promptArgs = {}, rawHistory = []) {
    const { messageArrayCompressor } = require("../../helpers/chat");
    const messageArray = this.constructPrompt(promptArgs);
    return await messageArrayCompressor(this, messageArray, rawHistory);
  }

  #dispatchPayload(messages, { temperature, stream }) {
    const modelId = this.model || this.workspace?.chatModel || null;
    const payload = {
      project_id: this.workspace.velaProjectId,
      role_id: this.workspace.velaRolePresetId,
      workspace_id: String(this.workspace.id),
      messages,
      options: {
        temperature,
        stream: !!stream,
      },
    };
    if (this.userId) payload.user_id = this.userId;
    if (modelId && modelId !== "vela-dispatch") {
      payload.model_id = modelId;
    }
    return payload;
  }

  #dispatchTimingFromHeaders(headers) {
    if (!headers) return {};
    const timing = {};
    const map = {
      prepare_ms: "x-vela-prepare-ms",
      context_ms: "x-vela-context-ms",
      provider_ttfb_ms: "x-vela-provider-ttfb-ms",
      total_ms: "x-vela-total-ms",
    };
    for (const [key, headerName] of Object.entries(map)) {
      const raw = headers.get?.(headerName) ?? headers[headerName];
      if (raw != null && raw !== "") {
        const value = Number(raw);
        if (!Number.isNaN(value)) timing[key] = value;
      }
    }
    return timing;
  }

  async #velaFetch(path, body, { stream = false } = {}) {
    const url = `${VELA_API_URL}/api/${path.replace(/^\//, "")}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VELA_CHAT_TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
        ...(stream ? {} : {}),
      });
      return resp;
    } finally {
      clearTimeout(timeout);
    }
  }

  async #parseDispatchError(resp) {
    const text = await resp.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    const detail = data?.detail;
    if (detail && typeof detail === "object" && detail.error) {
      return detail.error;
    }
    if (typeof detail === "string") return detail;
    return `Vela dispatch failed (HTTP ${resp.status})`;
  }

  async getChatCompletion(messages = null, { temperature = 0.7 } = {}) {
    const result = await LLMPerformanceMonitor.measureAsyncFunction(
      (async () => {
        const resp = await this.#velaFetch(
          "provider/chat",
          this.#dispatchPayload(messages, { temperature, stream: false })
        );
        if (!resp.ok) {
          throw new Error(await this.#parseDispatchError(resp));
        }
        return resp.json();
      })()
    );

    const payload = result.output;
    return {
      textResponse: repairMojibake(payload.content || ""),
      metrics: {
        prompt_tokens: payload.usage?.prompt_tokens || 0,
        completion_tokens: payload.usage?.completion_tokens || 0,
        total_tokens: payload.usage?.total_tokens || 0,
        outputTps: payload.usage?.completion_tokens
          ? payload.usage.completion_tokens / result.duration
          : 0,
        duration: result.duration,
        model: this.model,
        provider: this.className,
        timestamp: new Date(),
        vela_provider_id: payload.metadata?.provider_id,
        vela_credential_scope: payload.metadata?.credential_scope,
        vela_prepare_ms: payload.metadata?.prepare_ms,
        vela_context_ms: payload.metadata?.context_ms,
        vela_total_ms: payload.metadata?.total_ms,
      },
    };
  }

  async streamGetChatCompletion(messages = null, { temperature = 0.7 } = {}) {
    const resp = await this.#velaFetch(
      "provider/chat/stream",
      this.#dispatchPayload(messages, { temperature, stream: true }),
      { stream: true }
    );

    if (!resp.ok) {
      throw new Error(await this.#parseDispatchError(resp));
    }

    const dispatchTiming = this.#dispatchTimingFromHeaders(resp.headers);
    const rawStream = {
      [Symbol.asyncIterator]() {
        return parseOpenAiSseStream(resp.body);
      },
    };
    const stream = {
      [Symbol.asyncIterator]() {
        return normalizeOpenAiStreamDeltas(rawStream);
      },
      metadata: dispatchTiming,
    };

    return LLMPerformanceMonitor.measureStream({
      func: Promise.resolve(stream),
      messages,
      runPromptTokenCalculation: true,
      modelTag: this.model,
      provider: this.className,
    });
  }

  handleStream(response, stream, responseProps) {
    const result = handleDefaultStreamResponseV2(response, stream, responseProps);
    if (stream?.metadata && stream?.metrics) {
      Object.assign(stream.metrics, {
        vela_prepare_ms: stream.metadata.prepare_ms,
        vela_context_ms: stream.metadata.context_ms,
        vela_provider_ttfb_ms: stream.metadata.provider_ttfb_ms,
        vela_total_ms: stream.metadata.total_ms,
      });
    }
    return result;
  }

  #embedBlocked() {
    if (process.env.VELA_DISPATCH_SKIP_RAG === "0") return false;
    const provider = this.workspace?.chatProvider || process.env.LLM_PROVIDER;
    return provider === "vela-dispatch";
  }

  async embedTextInput(textInput) {
    if (this.#embedBlocked()) {
      this.log(
        "embedTextInput blocked on vela-dispatch fast path (set VELA_DISPATCH_SKIP_RAG=0 to allow)"
      );
      throw new Error(
        "Embedding is disabled for vela-dispatch chat mode (VELA_DISPATCH_SKIP_RAG)"
      );
    }
    return await this.embedder.embedTextInput(textInput);
  }

  async embedChunks(textChunks = []) {
    if (this.#embedBlocked()) {
      this.log(
        "embedChunks blocked on vela-dispatch fast path (set VELA_DISPATCH_SKIP_RAG=0 to allow)"
      );
      throw new Error(
        "Embedding is disabled for vela-dispatch chat mode (VELA_DISPATCH_SKIP_RAG)"
      );
    }
    return await this.embedder.embedChunks(textChunks);
  }
}

module.exports = { VelaLLMConnector, normalizeOpenAiStreamDeltas };
