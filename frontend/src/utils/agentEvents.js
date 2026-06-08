/**
 * Reduce unified Vela agent events into timeline state for live and historical views.
 */

export function createAgentTimelineState() {
  return {
    runId: null,
    route: null,
    reasoning: "",
    message: "",
    toolCalls: [],
    usage: null,
    status: "running",
    error: null,
    events: [],
  };
}

export function applyAgentEvent(state, event) {
  if (!event || typeof event !== "object") return state;
  const next = {
    ...state,
    events: [...state.events, event],
  };
  if (event.run_id) next.runId = event.run_id;

  const type = event.type;
  const payload = event.payload || {};

  switch (type) {
    case "route.selected":
      next.route = payload;
      break;
    case "reasoning.delta":
      next.reasoning += String(payload.delta || "");
      break;
    case "message.delta":
      next.message += String(payload.delta || "");
      break;
    case "tool.call.started": {
      const id = payload.tool_call_id || payload.name;
      const existing = next.toolCalls.find((t) => t.id === id);
      if (existing) {
        next.toolCalls = next.toolCalls.map((t) =>
          t.id === id
            ? { ...t, name: payload.name, arguments: payload.arguments, status: "running" }
            : t
        );
      } else {
        next.toolCalls = [
          ...next.toolCalls,
          {
            id,
            name: payload.name,
            arguments: payload.arguments,
            status: "running",
          },
        ];
      }
      break;
    }
    case "tool.call.result":
      next.toolCalls = next.toolCalls.map((t) =>
        t.id === payload.tool_call_id || t.name === payload.name
          ? { ...t, status: "completed", result: payload.result }
          : t
      );
      break;
    case "tool.call.error":
      next.toolCalls = next.toolCalls.map((t) =>
        t.id === payload.tool_call_id || t.name === payload.name
          ? { ...t, status: "error", error: payload.error }
          : t
      );
      break;
    case "usage.updated":
      next.usage = payload.usage || payload;
      break;
    case "agent.completed":
      next.status = "completed";
      if (payload.output_text && !next.message) {
        next.message = String(payload.output_text);
      }
      break;
    case "agent.failed":
      next.status = "failed";
      next.error = payload.error || "Agent failed";
      break;
    default:
      break;
  }

  return next;
}

export function reduceAgentEvents(events = []) {
  return events.reduce(applyAgentEvent, createAgentTimelineState());
}
