import AgentTimeline from "./AgentTimeline";

/**
 * Cursor-like exposure of Vela agent reasoning, routing, and tool progress.
 * Also supports legacy orchestrator routing reason strings.
 */
export default function VelaReasoningBlock({
  agentEvents = [],
  reasoning = "",
  route = null,
  live = false,
  reason = "",
  isThinking = false,
}) {
  const hasTimeline =
    agentEvents?.length > 0 || reasoning || route || live;
  if (hasTimeline) {
    return (
      <AgentTimeline
        agentEvents={agentEvents}
        reasoning={reasoning}
        route={route}
        live={live || isThinking}
      />
    );
  }

  if (!reason) return null;
  return (
    <div className="mb-2 px-3 py-2 text-sm text-theme-text-secondary border border-theme-sidebar-border rounded-lg">
      {isThinking ? (
        <span className="animate-pulse">{reason}</span>
      ) : (
        <span>{reason}</span>
      )}
    </div>
  );
}
