const {
  needsHubAgentReload,
} = require("../../utils/helpers/chat/agentRunReload");

describe("agentRunReload", () => {
  test("needs reload when runId exists without agent events", () => {
    expect(needsHubAgentReload({ runId: "run-1" })).toBe(true);
    expect(needsHubAgentReload({ runId: "run-1", agentEvents: [] })).toBe(
      true
    );
  });

  test("skips reload when local timeline is complete", () => {
    expect(
      needsHubAgentReload({
        runId: "run-1",
        agentEvents: [
          { type: "reasoning.delta", payload: { delta: "think" } },
          { type: "message.delta", payload: { delta: "hi" } },
          { type: "agent.completed", payload: { output_text: "hi" } },
        ],
      })
    ).toBe(false);
  });
});
