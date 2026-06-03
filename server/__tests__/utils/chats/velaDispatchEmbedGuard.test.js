const { VelaLLMConnector } = require("../../../utils/AiProviders/velaDispatch");

jest.mock("../../../utils/velaContext", () => ({
  VELA_API_URL: "http://127.0.0.1:7701",
}));

describe("VelaLLMConnector embed guard (M35)", () => {
  const workspace = {
    id: 1,
    velaProjectId: "proj-1",
    velaRolePresetId: "producer-coordinator",
    chatProvider: "vela-dispatch",
    chatModel: "gpt-4o-mini",
  };

  beforeEach(() => {
    delete process.env.VELA_DISPATCH_SKIP_RAG;
  });

  it("blocks embedTextInput on vela-dispatch fast path", async () => {
    const connector = new VelaLLMConnector({ workspace });
    await expect(connector.embedTextInput("hello")).rejects.toThrow(
      /VELA_DISPATCH_SKIP_RAG/
    );
  });

  it("allows embed when VELA_DISPATCH_SKIP_RAG=0", async () => {
    process.env.VELA_DISPATCH_SKIP_RAG = "0";
    const connector = new VelaLLMConnector({ workspace });
    connector.embedder = {
      embedTextInput: jest.fn(async () => [0.1, 0.2]),
    };
    await expect(connector.embedTextInput("hello")).resolves.toEqual([0.1, 0.2]);
  });
});
