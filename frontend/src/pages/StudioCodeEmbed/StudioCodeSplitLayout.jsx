import { useEffect, useState } from "react";
import { isMobile } from "react-device-detect";
import ChatContainer from "@/components/WorkspaceChat/ChatContainer";
import Workspace from "@/models/workspace";
import { MAX_STUDIO_CODE_SPLIT_PANES, studioCodeSplitGridStyle } from "@/utils/studioCodeSplit";

/**
 * Multi-session split grid for Studio Code (M49.5 PR3).
 * Only the active pane shows the compose bar.
 */
export default function StudioCodeSplitLayout({
  workspace,
  paneThreadSlugs = [],
  activeInputThreadSlug = null,
  onActivatePane = null,
  overflowCount = 0,
}) {
  const [historiesBySlug, setHistoriesBySlug] = useState({});
  const [threadNames, setThreadNames] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!workspace?.slug || paneThreadSlugs.length === 0) return;
      const nextHistory = {};
      await Promise.all(
        paneThreadSlugs.map(async (threadSlug) => {
          const serverHistory = await Workspace.threads.chatHistory(
            workspace.slug,
            threadSlug
          );
          nextHistory[threadSlug] = Array.isArray(serverHistory)
            ? serverHistory
            : [];
        })
      );
      const { threads } = await Workspace.threads.all(workspace.slug);
      const nextNames = {};
      for (const t of threads || []) {
        if (t?.slug) nextNames[t.slug] = t.name || t.slug;
      }
      if (!cancelled) {
        setHistoriesBySlug(nextHistory);
        setThreadNames(nextNames);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace?.slug, paneThreadSlugs.join("|")]);

  const gridStyle = studioCodeSplitGridStyle(paneThreadSlugs.length, isMobile);

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      {overflowCount > 0 && (
        <p
          className="text-xs text-amber-400/90 px-3 py-1 shrink-0"
          title="Uncheck a session in the list to include a different thread"
        >
          +{overflowCount} more in list (showing first {MAX_STUDIO_CODE_SPLIT_PANES})
        </p>
      )}
      <div className="flex-1 min-h-0 grid gap-2 p-2" style={gridStyle}>
        {paneThreadSlugs.map((threadSlug) => {
          const isActiveInput = threadSlug === activeInputThreadSlug;
          const label = threadNames[threadSlug] || threadSlug;
          return (
            <div
              key={threadSlug}
              className={`flex flex-col min-h-0 min-w-0 rounded-lg border overflow-hidden ${
                isActiveInput
                  ? "border-primary-button ring-1 ring-primary-button/40"
                  : "border-white/10 light:border-slate-300"
              }`}
              onMouseDown={() => onActivatePane?.(threadSlug)}
            >
              <div
                className={`flex items-center px-2 py-1 shrink-0 border-b border-white/10 light:border-slate-200 ${
                  isActiveInput
                    ? "bg-primary-button/20"
                    : "bg-zinc-800/80 light:bg-slate-100"
                }`}
              >
                <span className="text-xs text-white light:text-slate-800 truncate flex-1">
                  {label}
                </span>
                {isActiveInput ? (
                  <span className="text-[10px] text-primary-button shrink-0 ml-2">
                    Input
                  </span>
                ) : (
                  <button
                    type="button"
                    className="text-[10px] text-zinc-400 hover:text-white light:hover:text-slate-900 shrink-0 ml-2"
                    onClick={() => onActivatePane?.(threadSlug)}
                  >
                    Focus
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-0 relative">
                <ChatContainer
                  key={`${workspace.slug}:${threadSlug}`}
                  workspace={workspace}
                  threadSlug={threadSlug}
                  knownHistory={historiesBySlug[threadSlug] ?? []}
                  embedded
                  hideContextHeader
                  showPromptInput={isActiveInput}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
