import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import debounce from "lodash.debounce";
import { isMobile } from "react-device-detect";
import ChatContainer from "../ChatContainer";
import ChatContextHeader from "../ChatContainer/ChatContextHeader";
import paths from "@/utils/paths";
import Vela from "@/models/vela";
import {
  loadWorkerThreadMap,
  repairWorkerThreadParentsAsync,
  roleDisplayName,
  VELA_WORKER_THREAD_EVENT,
} from "@/utils/orchestratorRuns";
import { computeSplitGrid, enumerateSplitPanes } from "@/utils/splitChatLayout";

function runStatusDot(run) {
  if (!run) return "bg-zinc-500";
  if (run.status === "needs_user_input") return "bg-amber-400";
  if (
    run.status === "running" ||
    run.status === "queued" ||
    run.status === "classifying"
  ) {
    return "bg-emerald-400 animate-pulse";
  }
  if (run.status === "completed") return "bg-zinc-400";
  if (run.status === "failed" || run.status === "blocked") return "bg-red-400";
  return "bg-zinc-500";
}

export default function SplitChatLayout({
  workspace,
  mainThreadSlug,
  layoutMode,
  onLayoutModeChange,
}) {
  const navigate = useNavigate();
  const [workerMap, setWorkerMap] = useState(() =>
    loadWorkerThreadMap(workspace?.slug)
  );
  const [runs, setRuns] = useState([]);
  const [focusedPaneId, setFocusedPaneId] = useState(null);

  const refreshWorkerMap = useCallback(() => {
    if (!workspace?.slug) return;
    setWorkerMap({ ...loadWorkerThreadMap(workspace.slug) });
  }, [workspace?.slug]);

  const refreshRuns = useCallback(async () => {
    if (!workspace?.slug || !workspace?.velaProjectId) return;
    try {
      const list = await Vela.listOrchestratorRuns(workspace.slug, {
        projectId: workspace.velaProjectId,
        sessionId: mainThreadSlug || "default",
        limit: 50,
      });
      const { runs: runList = [] } = list || {};
      setRuns(Array.isArray(runList) ? runList : []);
    } catch {
      setRuns([]);
    }
  }, [workspace?.slug, workspace?.velaProjectId, mainThreadSlug]);

  const debouncedRefresh = useMemo(
    () =>
      debounce(() => {
        refreshWorkerMap();
        refreshRuns();
      }, 200),
    [refreshWorkerMap, refreshRuns]
  );

  useEffect(() => {
    if (!workspace?.slug) return;
    repairWorkerThreadParentsAsync(workspace.slug).then(() =>
      refreshWorkerMap()
    );
    refreshRuns();
  }, [workspace?.slug, mainThreadSlug, refreshWorkerMap, refreshRuns]);

  useEffect(() => {
    const onWorker = (e) => {
      if (e.detail?.workspaceSlug !== workspace?.slug) return;
      debouncedRefresh();
    };
    window.addEventListener(VELA_WORKER_THREAD_EVENT, onWorker);
    return () => {
      window.removeEventListener(VELA_WORKER_THREAD_EVENT, onWorker);
      debouncedRefresh.cancel();
    };
  }, [workspace?.slug, debouncedRefresh]);

  const runsById = useMemo(
    () =>
      Object.fromEntries(
        (runs || []).filter((r) => r?.run_id).map((r) => [r.run_id, r])
      ),
    [runs]
  );

  const { panes, overflowCount } = useMemo(
    () =>
      enumerateSplitPanes({
        workspaceSlug: workspace?.slug,
        mainThreadSlug,
        workerMap,
        runs,
      }),
    [workspace?.slug, mainThreadSlug, workerMap, runs]
  );

  const { rows, cols } = computeSplitGrid(panes.length);
  const gridStyle = isMobile
    ? {
        gridTemplateRows: `repeat(${panes.length}, minmax(180px, 1fr))`,
        gridTemplateColumns: "1fr",
      }
    : {
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      };

  const showHelper = panes.length === 1;

  return (
    <div className="flex flex-col h-full w-full">
      <ChatContextHeader
        workspace={workspace}
        threadSlug={mainThreadSlug}
        layoutMode={layoutMode}
        onLayoutModeChange={onLayoutModeChange}
        showLayoutToggle
      />
      {showHelper && (
        <p className="hidden md:block text-xs text-theme-text-secondary px-4 py-1">
          Worker chats appear here when Vela dispatches roles.
        </p>
      )}
      {overflowCount > 0 && (
        <p className="text-xs text-amber-400/90 px-4 py-1">
          +{overflowCount} more in sidebar
        </p>
      )}
      <div className="flex-1 min-h-0 grid gap-2 p-2 md:p-3" style={gridStyle}>
        {panes.map((pane) => {
          const run = pane.runId ? runsById[pane.runId] : null;
          const label = pane.isMain
            ? "Main"
            : `↳ ${roleDisplayName(pane.roleId)}`;
          return (
            <div
              key={pane.id}
              className={`flex flex-col min-h-0 min-w-0 rounded-lg border overflow-hidden ${
                focusedPaneId === pane.id
                  ? "border-primary-button"
                  : "border-theme-modal-border"
              }`}
              onFocus={() => setFocusedPaneId(pane.id)}
            >
              <div className="flex items-center gap-2 px-2 py-1 bg-zinc-800/80 border-b border-theme-modal-border shrink-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${runStatusDot(run)}`}
                  title={run?.status || ""}
                />
                <span className="text-xs text-white truncate flex-1">
                  {label}
                </span>
                <button
                  type="button"
                  className="text-[10px] text-primary-button hover:underline shrink-0"
                  onClick={() =>
                    navigate(
                      paths.workspace.thread(workspace.slug, pane.threadSlug)
                    )
                  }
                >
                  Single
                </button>
              </div>
              <div className="flex-1 min-h-0 relative">
                <ChatContainer
                  key={pane.id}
                  workspace={workspace}
                  threadSlug={pane.threadSlug}
                  embedded
                  showPromptInput={pane.isMain}
                  hideContextHeader
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
