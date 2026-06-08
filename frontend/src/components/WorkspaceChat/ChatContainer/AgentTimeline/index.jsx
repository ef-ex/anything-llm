import { CaretDown, CaretRight, Wrench } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { reduceAgentEvents } from "@/utils/agentEvents";

function CollapsibleSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-theme-sidebar-border rounded-lg overflow-hidden mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm bg-theme-sidebar-border/30 hover:bg-theme-sidebar-border/50"
      >
        {open ? <CaretDown size={14} /> : <CaretRight size={14} />}
        <span className="font-medium">{title}</span>
      </button>
      {open ? <div className="px-3 py-2 text-sm">{children}</div> : null}
    </div>
  );
}

export default function AgentTimeline({
  agentEvents = [],
  route = null,
  reasoning = "",
  toolCalls: toolCallsProp = null,
  live = false,
}) {
  const reduced = useMemo(
    () => (agentEvents.length ? reduceAgentEvents(agentEvents) : null),
    [agentEvents]
  );

  const timelineRoute = route || reduced?.route;
  const timelineReasoning = reasoning || reduced?.reasoning || "";
  const toolCalls = toolCallsProp || reduced?.toolCalls || [];
  const status = reduced?.status || (live ? "running" : "completed");

  if (
    !timelineRoute &&
    !timelineReasoning &&
    toolCalls.length === 0 &&
    !live
  ) {
    return null;
  }

  const showReasoning = Boolean(timelineReasoning) || (live && reduced?.status === "running");

  return (
    <div className="mb-3 space-y-1 text-theme-text-secondary">
      {timelineRoute ? (
        <CollapsibleSection title="Route" defaultOpen={live}>
          <div className="font-mono text-xs space-y-1">
            {timelineRoute.provider_id ? (
              <div>
                Provider: {timelineRoute.provider_id} / {timelineRoute.model_id}
              </div>
            ) : null}
            {timelineRoute.selection_reason ? (
              <div>Reason: {timelineRoute.selection_reason}</div>
            ) : null}
            {Array.isArray(timelineRoute.mcp_servers) &&
            timelineRoute.mcp_servers.length ? (
              <div>MCP: {timelineRoute.mcp_servers.join(", ")}</div>
            ) : null}
          </div>
        </CollapsibleSection>
      ) : null}

      {showReasoning ? (
        <CollapsibleSection title="Reasoning" defaultOpen={live}>
          <pre className="whitespace-pre-wrap font-sans text-sm text-theme-text-primary/90">
            {timelineReasoning || (live ? "…" : "")}
          </pre>
        </CollapsibleSection>
      ) : null}

      {toolCalls.length > 0 ? (
        <CollapsibleSection
          title={`Tools (${toolCalls.length})`}
          defaultOpen={live}
        >
          <ul className="space-y-2">
            {toolCalls.map((tool) => (
              <li key={tool.id || tool.name} className="text-xs">
                <div className="flex items-center gap-1 font-medium text-theme-text-primary">
                  <Wrench size={12} />
                  {tool.name}
                  <span className="text-theme-text-secondary">
                    ({tool.status || "pending"})
                  </span>
                </div>
                {tool.result ? (
                  <pre className="mt-1 p-2 rounded bg-theme-bg-secondary overflow-x-auto max-h-40">
                    {String(tool.result).slice(0, 1200)}
                  </pre>
                ) : null}
                {tool.error ? (
                  <div className="mt-1 text-red-500">{tool.error}</div>
                ) : null}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      ) : null}

      {live && status === "running" ? (
        <div className="text-xs text-theme-text-secondary animate-pulse">
          Agent running…
        </div>
      ) : null}
    </div>
  );
}
