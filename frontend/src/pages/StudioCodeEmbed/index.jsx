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
import { studioCodeThreadPath } from "@/utils/studioCodeRole";
import { isWorkerThreadSlug } from "@/utils/orchestratorRuns";
import {
  loadSplitThreadSlugs,
  resolveStudioCodeSplitDisplay,
  toggleSplitThreadSlug,
} from "@/utils/studioCodeSplit";

/**
 * Studio Code tab shell — AnythingLLM chat with session thread list (M49.5).
 */
export default function StudioCodeEmbed() {
  const { loading, requiresAuth, mode } = usePasswordModal();

  if (loading) return <FullScreenLoader />;
  if (requiresAuth !== false) {
    return <>{requiresAuth !== null && <PasswordModal mode={mode} />}</>;
  }

  return <StudioCodeEmbedChat />;
}

function SessionsSidebar({ workspace, splitThreadSlugs, onSplitToggle }) {
  return (
    <>
      <div className="md:hidden shrink-0 border-b border-white/10 light:border-slate-200 bg-theme-bg-sidebar max-h-[28vh] overflow-y-auto">
        <div className="px-3 py-2 border-b border-white/10 light:border-slate-200">
          <p className="text-xs font-semibold text-white light:text-slate-800">
            Sessions
          </p>
        </div>
        <div className="px-1 py-1">
          <ThreadContainer
            workspace={workspace}
            splitThreadSlugs={splitThreadSlugs}
            onSplitToggle={onSplitToggle}
          />
        </div>
      </div>
      <aside
        className="hidden md:flex flex-col w-[260px] shrink-0 border-r border-white/10 light:border-slate-200 bg-theme-bg-sidebar h-full overflow-y-auto"
        aria-label="Code chat sessions"
      >
        <div className="px-3 py-3 border-b border-white/10 light:border-slate-200">
          <p className="text-xs font-semibold text-white light:text-slate-800">
            Sessions
          </p>
          <p className="text-[11px] text-zinc-400 light:text-slate-500 mt-0.5">
            Check threads to open them side by side in split view.
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
  const [splitSlugs, setSplitSlugs] = useState(() => loadSplitThreadSlugs(slug));
  const [activeInputSlug, setActiveInputSlug] = useState(threadSlug || null);
  const ensuringThreadRef = useRef(false);

  useEffect(() => {
    setSplitSlugs(loadSplitThreadSlugs(slug));
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

  const { panes, overflowCount, splitActive } = useMemo(
    () => resolveStudioCodeSplitDisplay(splitSlugs, threadSlug),
    [splitSlugs, threadSlug]
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
        console.warn("[vela] could not create initial code thread:", error);
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
    <div className="w-screen h-[100dvh] overflow-hidden bg-zinc-950 light:bg-slate-50 flex flex-col md:flex-row">
      <SessionsSidebar
        workspace={workspace}
        splitThreadSlugs={splitSlugs}
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
  );
}
