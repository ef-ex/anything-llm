import { useEffect, useState } from "react";
import { isMobile } from "react-device-detect";
import ChatContainer from "@/components/WorkspaceChat/ChatContainer";
import Workspace from "@/models/workspace";
import { useStudioCodeContext } from "@/contexts/StudioCodeContext";
import { contextFillBorderClass } from "@/utils/studioCodeContext";
import { MAX_STUDIO_CODE_SPLIT_PANES, studioCodeSplitGridStyle } from "@/utils/studioCodeSplit";
import {
  isStudioAssistantThreadRole,
  resolveStoredRoleId,
} from "@/utils/studioCodeRole";
import Vela from "@/models/vela";

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
  const studioCtx = useStudioCodeContext();
  const [historiesBySlug, setHistoriesBySlug] = useState({});
  const [threadNames, setThreadNames] = useState({});
  const [roleNamesById, setRoleNamesById] = useState({});
  const [codeRoles, setCodeRoles] = useState([]);
  const [codeRolesDefaultId, setCodeRolesDefaultId] = useState("");
  const [assistantRoleId, setAssistantRoleId] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!workspace?.slug || !workspace?.velaProjectId) return;
      try {
        const data = await Vela.listStudioCodeRoles(workspace.slug, {
          projectId: workspace.velaProjectId,
        });
        if (cancelled) return;
        const map = {};
        for (const role of data?.roles || []) {
          if (role?.id) map[role.id] = role.display_name || role.id;
        }
        setRoleNamesById(map);
        setCodeRoles(data?.roles || []);
        setCodeRolesDefaultId(data?.default_role_id || "");
        setAssistantRoleId(data?.assistant_role_id || "");
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace?.slug, workspace?.velaProjectId]);

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

  useEffect(() => {
    if (studioCtx?.enabled) {
      studioCtx.refreshThreads(paneThreadSlugs);
    }
  }, [studioCtx, paneThreadSlugs.join("|")]);

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
        {paneThreadSlugs.map((threadSlug, paneIndex) => {
          const isActiveInput = threadSlug === activeInputThreadSlug;
          const label = threadNames[threadSlug] || threadSlug;
          const roleId = resolveStoredRoleId(
            workspace.slug,
            codeRoles,
            codeRolesDefaultId,
            threadSlug,
            {
              assistantRoleId,
              splitPaneIndex: paneIndex,
              splitPaneCount: paneThreadSlugs.length,
            }
          );
          const roleLabel = roleNamesById[roleId] || "";
          const contextBorder =
            studioCtx?.enabled
              ? contextFillBorderClass(studioCtx.getFill(threadSlug).level)
              : "";
          return (
            <div
              key={threadSlug}
              className={`flex flex-col min-h-0 min-w-0 rounded-lg border overflow-hidden ${
                isActiveInput
                  ? "border-primary-button ring-1 ring-primary-button/40"
                  : "border-white/10 light:border-slate-300"
              } ${contextBorder}`}
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
                  {roleLabel ? (
                    <span className="text-zinc-400 light:text-slate-500 font-normal">
                      {" "}
                      · {roleLabel}
                    </span>
                  ) : null}
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
                  studioCodeResolvedRoleId={roleId}
                  hideStudioCodeRolePicker={isStudioAssistantThreadRole(roleId)}
                  studioCodeSplitPaneIndex={paneIndex}
                  studioCodeSplitPaneCount={paneThreadSlugs.length}
                  studioCodeAssistantRoleId={assistantRoleId}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
