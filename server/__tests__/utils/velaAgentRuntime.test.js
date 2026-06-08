const {
  mapAgentEventToChunks,
} = require("../../utils/velaAgentRuntime");

describe("velaAgentRuntime", () => {
  test("emits only agentEvent chunks for timeline UI", () => {
    const state = { text: "", reasoning: "", agentEvents: [], runId: null };
    const uuid = "test-uuid";

    const routeChunks = mapAgentEventToChunks(
      {
        type: "route.selected",
        run_id: "run-1",
        payload: {
          provider_id: "cursor-subscription",
          model_id: "cursor-acp/auto",
          role_id: "studio-assistant",
        },
      },
      uuid,
      state
    );
    expect(routeChunks).toEqual([
      {
        type: "agentEvent",
        uuid,
        event: expect.objectContaining({ type: "route.selected" }),
        velaAgent: true,
      },
    ]);
    expect(
      routeChunks.some((c) => c.type === "modelRouteNotification")
    ).toBe(false);

    const msgChunks = mapAgentEventToChunks(
      { type: "message.delta", payload: { delta: "Hello" } },
      uuid,
      state
    );
    expect(state.text).toBe("Hello");
    expect(msgChunks).toHaveLength(1);
    expect(msgChunks[0].type).toBe("agentEvent");
    expect(msgChunks.some((c) => c.type === "textResponseChunk")).toBe(false);
    expect(state.agentEvents.length).toBe(2);
  });
});
