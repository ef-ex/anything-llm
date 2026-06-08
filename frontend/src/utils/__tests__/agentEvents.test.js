import { describe, expect, test } from "vitest";
import { reduceAgentEvents } from "../agentEvents";

describe("agentEvents reducer", () => {
  test("rehydrates route, reasoning, tools, and final answer", () => {
    const timeline = reduceAgentEvents([
      {
        type: "route.selected",
        run_id: "run-1",
        payload: { provider_id: "p", model_id: "m" },
      },
      { type: "reasoning.delta", payload: { delta: "thinking" } },
      {
        type: "tool.call.started",
        payload: { tool_call_id: "c1", name: "vela_web_research" },
      },
      {
        type: "tool.call.result",
        payload: { tool_call_id: "c1", name: "vela_web_research", result: "{}" },
      },
      { type: "message.delta", payload: { delta: "Answer" } },
      { type: "agent.completed", payload: { output_text: "Answer" } },
    ]);

    expect(timeline.runId).toBe("run-1");
    expect(timeline.route.provider_id).toBe("p");
    expect(timeline.reasoning).toBe("thinking");
    expect(timeline.toolCalls[0].status).toBe("completed");
    expect(timeline.message).toBe("Answer");
    expect(timeline.status).toBe("completed");
  });
});
