import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import WorkspaceChatContainer from "@/components/WorkspaceChat";
import ThreadContainer from "@/components/Sidebar/ActiveWorkspaces/ThreadContainer";
import Workspace from "@/models/workspace";
import PasswordModal, { usePasswordModal } from "@/components/Modals/Password";
import { FullScreenLoader } from "@/components/Preloader";
import LoadingChat from "@/components/WorkspaceChat/LoadingChat";
import StudioCodeSplitLayout from "@/pages/StudioCodeEmbed/StudioCodeSplitLayout";
import { TTSProvider } from "@/components/contexts/TTSProvider";
import { DnDFileUploaderProvider } from "@/components/WorkspaceChat/ChatContainer/DnDWrapper";
import { OrchestratorChatProvider } from "@/contexts/OrchestratorChatContext";
import { StudioCodeContextProvider } from "@/contexts/StudioCodeContext";
import {
  activateNewStudioCodeAgent,
  studioCodeThreadPath,
} from "@/utils/studioCodeRole";
import { isWorkerThreadSlug } from "@/utils/orchestratorRuns";
import {
  loadSplitThreadSlugs,
  pruneSplitThreadSlugs,
  resolveStudioCodeSplitDisplay,
  toggleSplitThreadSlug,
} from "@/utils/studioCodeSplit";

/**
 * Studio Code tab shell — AnythingLLM chat with agent list (M49.5).
 */
export default function StudioCodeEmbed() {
  const { loading, requiresAuth, mode } = usePasswordModal();

  if (loading) return <FullScreenLoader />;
  if (requiresAuth !== false) {
    return <>{requiresAuth !== null && <PasswordModal mode={mode} />}</>;
  }

  return <StudioCodeEmbedChat />;
}

function AgentsSidebar({ workspace, splitThreadSlugs, onSplitToggle }) {
  return (
    <>
      <aside
        className="md:hidden shrink-0 border-b border-white/10 light:border-slate-200 bg-theme-bg-sidebar max-h-[28vh] overflow-y-auto"
        aria-label="Code agents"
      >
        <div className="px-3 py-2 border-b border-white/10 light:border-slate-200">
          <p className="text-xs font-semibold text-white light:text-slate-800">
            Agents
          </p>
        </div>
        <div className="px-1 py-1">
          <ThreadContainer
            workspace={workspace}
            splitThreadSlugs={splitThreadSlugs}
            onSplitToggle={onSplitToggle}
          />
        </div>
      </aside>
      <aside
        className="hidden md:flex flex-col w-[260px] shrink-0 border-r border-white/10 light:border-slate-200 bg-theme-bg-sidebar h-full overflow-y-auto"
        aria-label="Code agents"
      >
        <div className="px-3 py-3 border-b border-white/10 light:border-slate-200">
          <p className="text-xs font-semibold text-white light:text-slate-800">
            Agents
          </p>
          <p className="text-[11px] text-zinc-400 light:text-slate-500 mt-0.5">
            Each agent is its own chat. Check agents to compare side by side.
          </p>
        </div>
        <div className="flex-1 px-1 py-2">
          <ThreadContainer
            workspace={workspace}
            splitThreadSlugs={splitThreadSlugs}
            onSplitToggle={onSplitToggle}
          />
        </div>
      </aside>
    </>
  );
}

function StudioCodeEmbedChat() {
  const { slug, threadSlug } = useParams();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState(null);
  const [loadedSlug, setLoadedSlug] = useState(null);
  const [splitSlugs, setSplitSlugs] = useState([]);
  const [validThreadSlugs, setValidThreadSlugs] = useState([]);
  const [activeInputSlug, setActiveInputSlug] = useState(threadSlug || null);
  const ensuringThreadRef = useRef(false);

  const syncThreadSlugsWithServer = useCallback(
    async ({ redirectStaleRoute = true } = {}) => {
      if (!workspace?.slug) return;
      const { threads } = await Workspace.threads.all(workspace.slug);
      const mainThreads = (threads || []).filter(
        (t) => t?.slug && !isWorkerThreadSlug(workspace.slug, t.slug)
      );
      const validSlugs = mainThreads.map((t) => t.slug);
      setValidThreadSlugs(validSlugs);
      const pruned = pruneSplitThreadSlugs(workspace.slug, validSlugs);
      setSplitSlugs(pruned);

      if (redirectStaleRoute && threadSlug && !validSlugs.includes(threadSlug)) {
        const fallback = validSlugs[0];
        navigate(
          fallback
            ? studioCodeThreadPath(workspace.slug, fallback)
            : studioCodeThreadPath(workspace.slug),
          { replace: true }
        );
      }
    },
    [workspace?.slug, threadSlug, navigate]
  );

  const refreshSplitSlugs = useCallback(() => {
    void syncThreadSlugsWithServer({ redirectStaleRoute: false });
  }, [syncThreadSlugsWithServer]);

  useEffect(() => {
    setSplitSlugs([]);
    setValidThreadSlugs([]);
  }, [slug]);

  useEffect(() => {
    async function load() {
      if (!slug) return;
      const ws = await Workspace.bySlug(slug);
      if (!ws) {
        setWorkspace(null);
        setLoadedSlug(slug);
        return;
      }
      const [{ showAgentCommand }] = await Promise.all([
        Workspace.agentCommandAvailable(slug),
      ]);
      setWorkspace({ ...ws, showAgentCommand });
      setLoadedSlug(slug);
    }
    void load();
  }, [slug]);

  useEffect(() => {
    if (threadSlug) setActiveInputSlug(threadSlug);
  }, [threadSlug]);

  useEffect(() => {
    void syncThreadSlugsWithServer();
  }, [syncThreadSlugsWithServer]);

  const displaySplitSlugs = useMemo(() => {
    const valid = new Set(validThreadSlugs);
    if (valid.size === 0) return splitSlugs;
    return splitSlugs.filter((s) => valid.has(s));
  }, [splitSlugs, validThreadSlugs]);

  const { panes, overflowCount, splitActive } = useMemo(
    () => resolveStudioCodeSplitDisplay(displaySplitSlugs, threadSlug),
    [displaySplitSlugs, threadSlug]
  );

  const useSplitGrid = splitActive && panes.length > 1;

  useEffect(() => {
    if (!useSplitGrid || !activeInputSlug) return;
    if (!panes.includes(activeInputSlug)) {
      setActiveInputSlug(panes[0] || threadSlug || null);
    }
  }, [useSplitGrid, panes, activeInputSlug, threadSlug]);

  const handleSplitToggle = useCallback(
    (targetSlug, checked) => {
      if (!workspace?.slug) return;
      const next = toggleSplitThreadSlug(
        workspace.slug,
        targetSlug,
        checked,
        splitSlugs
      );
      setSplitSlugs(next);
      if (checked) {
        setActiveInputSlug(targetSlug);
      }
    },
    [workspace?.slug, splitSlugs]
  );

  const handleNewAgent = useCallback(async () => {
    if (!workspace?.slug) return;
    const replaceSlug = activeInputSlug || threadSlug;
    const thread = await activateNewStudioCodeAgent({
      workspaceSlug: workspace.slug,
      replaceThreadSlug: replaceSlug,
      splitSlugs,
    });
    setSplitSlugs(loadSplitThreadSlugs(workspace.slug));
    setActiveInputSlug(thread.slug);
    navigate(studioCodeThreadPath(workspace.slug, thread.slug), {
      replace: true,
    });
  }, [
    workspace?.slug,
    activeInputSlug,
    threadSlug,
    splitSlugs,
    navigate,
  ]);

  useEffect(() => {
    async function ensureThreadRoute() {
      if (!workspace?.slug || threadSlug || ensuringThreadRef.current) return;

      ensuringThreadRef.current = true;
      try {
        const { threads } = await Workspace.threads.all(workspace.slug);
        const mainThreads = (threads || []).filter(
          (t) => !isWorkerThreadSlug(workspace.slug, t.slug)
        );
        if (mainThreads.length > 0) {
          navigate(studioCodeThreadPath(workspace.slug, mainThreads[0].slug), {
            replace: true,
          });
          return;
        }
        const { thread, error } = await Workspace.threads.new(workspace.slug);
        if (thread) {
          navigate(studioCodeThreadPath(workspace.slug, thread.slug), {
            replace: true,
          });
          return;
        }
        console.warn("[vela] could not create initial code agent:", error);
      } finally {
        ensuringThreadRef.current = false;
      }
    }
    void ensureThreadRoute();
  }, [workspace?.slug, threadSlug, navigate]);

  if (!slug || loadedSlug !== slug) {
    return (
      <div className="w-screen h-[100dvh] bg-zinc-950">
        <LoadingChat />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="w-screen h-[100dvh] bg-zinc-950 flex items-center justify-center p-6 text-center text-zinc-400 text-sm">
        This code workspace could not be loaded. Run the dev stack and open Code
        again from Vela Studio.
      </div>
    );
  }

  const orchestratorThreadSlug = activeInputSlug || threadSlug;

  return (
    <StudioCodeContextProvider
      workspace={workspace}
      onNewAgent={handleNewAgent}
      refreshSplitSlugs={refreshSplitSlugs}
    >
      <div className="w-screen h-[100dvh] overflow-hidden bg-zinc-950 light:bg-slate-50 flex flex-col md:flex-row">
        <AgentsSidebar
          workspace={workspace}
          splitThreadSlugs={displaySplitSlugs}
          onSplitToggle={handleSplitToggle}
        />
        <main className="flex-1 min-w-0 h-full">
          {useSplitGrid ? (
            <TTSProvider>
              <DnDFileUploaderProvider
                workspace={workspace}
                threadSlug={orchestratorThreadSlug}
              >
                <OrchestratorChatProvider
                  workspace={workspace}
                  threadSlug={orchestratorThreadSlug}
                >
                  <StudioCodeSplitLayout
                    workspace={workspace}
                    paneThreadSlugs={panes}
                    activeInputThreadSlug={activeInputSlug || panes[0]}
                    onActivatePane={setActiveInputSlug}
                    overflowCount={overflowCount}
                  />
                </OrchestratorChatProvider>
              </DnDFileUploaderProvider>
            </TTSProvider>
          ) : (
            <WorkspaceChatContainer loading={false} workspace={workspace} embedded />
          )}
        </main>
      </div>
    </StudioCodeContextProvider>
  );
}
