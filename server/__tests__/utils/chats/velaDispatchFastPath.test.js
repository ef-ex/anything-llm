const {
  isVelaDispatchFastPath,
  shouldIncludePinnedOnFastPath,
} = require("../../../utils/chats/velaDispatchFastPath");

describe("vela-dispatch fast path (M35)", () => {
  const workspace = {
    chatProvider: "vela-dispatch",
    slug: "test",
  };

  beforeEach(() => {
    delete process.env.VELA_DISPATCH_SKIP_RAG;
    delete process.env.VELA_DISPATCH_INCLUDE_PINNED;
  });

  it("is active for vela-dispatch chat/automatic modes", () => {
    expect(isVelaDispatchFastPath(workspace, "chat")).toBe(true);
    expect(isVelaDispatchFastPath(workspace, "automatic")).toBe(true);
  });

  it("is inactive for query mode", () => {
    expect(isVelaDispatchFastPath(workspace, "query")).toBe(false);
  });

  it("is inactive for stock providers", () => {
    expect(
      isVelaDispatchFastPath({ ...workspace, chatProvider: "openai" }, "chat")
    ).toBe(false);
  });

  it("respects VELA_DISPATCH_SKIP_RAG=0", () => {
    process.env.VELA_DISPATCH_SKIP_RAG = "0";
    expect(isVelaDispatchFastPath(workspace, "chat")).toBe(false);
  });

  it("includes pinned docs when attachments exist or env set", () => {
    expect(shouldIncludePinnedOnFastPath([])).toBe(false);
    expect(shouldIncludePinnedOnFastPath([{ name: "a.txt" }])).toBe(true);
    process.env.VELA_DISPATCH_INCLUDE_PINNED = "1";
    expect(shouldIncludePinnedOnFastPath([])).toBe(true);
  });
});

describe("chatPrompt vela-dispatch context skip (M37)", () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.LLM_PROVIDER;
    delete chatPromptModule?._loggedDispatchContextSkip;
  });

  let chatPromptModule;

  it("does not call fetchVelaContext for vela-dispatch workspaces", async () => {
    jest.doMock("../../../utils/velaContext", () => ({
      fetchVelaContext: jest.fn(async () => ({ rules: [] })),
      buildContextPrefix: jest.fn(() => "[Vela Rules]\n- test"),
    }));
    jest.doMock("../../../models/systemSettings", () => ({
      SystemSettings: { saneDefaultSystemPrompt: "Base prompt" },
    }));
    jest.doMock("../../../models/systemPromptVariables", () => ({
      SystemPromptVariables: {
        expandSystemPromptVariables: jest.fn(async (prompt) => prompt),
      },
    }));
    jest.doMock("../../../utils/memories", () => ({
      promptWithMemories: jest.fn(({ systemPrompt }) => systemPrompt),
    }));

    ({ chatPrompt: chatPromptModule } = require("../../../utils/chats/index"));
    const { fetchVelaContext } = require("../../../utils/velaContext");

    const result = await chatPromptModule({
      chatProvider: "vela-dispatch",
      openAiPrompt: "Workspace prompt",
      id: 1,
    });

    expect(fetchVelaContext).not.toHaveBeenCalled();
    expect(result).toBe("Workspace prompt");
  });
});
