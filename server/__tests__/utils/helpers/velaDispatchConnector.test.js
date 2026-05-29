const { resolveProviderConnector, getLLMProvider } = require("../../../utils/helpers");

jest.mock("../../../utils/velaContext", () => ({
  VELA_API_URL: "http://127.0.0.1:7701",
}));

describe("vela-dispatch provider connector", () => {
  const workspace = {
    id: 1,
    slug: "test",
    velaProjectId: "proj-1",
    velaRolePresetId: "producer-coordinator",
    chatProvider: "vela-dispatch",
    chatModel: "gpt-4o-mini",
  };

  beforeEach(() => {
    jest.resetModules();
  });

  it("resolveProviderConnector returns VelaLLMConnector for vela-dispatch", async () => {
    const { connector } = await resolveProviderConnector({ workspace });
    expect(connector.className).toBe("VelaLLMConnector");
    expect(connector.model).toBe("gpt-4o-mini");
    expect(connector.streamingEnabled()).toBe(true);
  });

  it("getLLMProvider rejects vela-dispatch direct use", () => {
    expect(() =>
      getLLMProvider({ provider: "vela-dispatch", model: "gpt-4o-mini" })
    ).toThrow(/resolveProviderConnector/);
  });

  it("non-vela workspaces keep the default provider resolution branch", async () => {
    const prevKey = process.env.OPEN_AI_KEY;
    const prevModel = process.env.OPEN_AI_MODEL_PREF;
    process.env.OPEN_AI_KEY = "test-key";
    process.env.OPEN_AI_MODEL_PREF = "gpt-4o-mini";
    try {
      const { connector } = await resolveProviderConnector({
        workspace: { ...workspace, chatProvider: null, velaRolePresetId: null },
      });
      expect(connector.className).not.toBe("VelaLLMConnector");
    } finally {
      if (prevKey === undefined) delete process.env.OPEN_AI_KEY;
      else process.env.OPEN_AI_KEY = prevKey;
      if (prevModel === undefined) delete process.env.OPEN_AI_MODEL_PREF;
      else process.env.OPEN_AI_MODEL_PREF = prevModel;
    }
  });
});
