import React, { useEffect, useRef, useState } from "react";
import { default as WorkspaceChatContainer } from "@/components/WorkspaceChat";
import Sidebar from "@/components/Sidebar";
import { useNavigate, useParams } from "react-router-dom";
import Workspace from "@/models/workspace";
import PasswordModal, { usePasswordModal } from "@/components/Modals/Password";
import { isMobile } from "react-device-detect";
import { FullScreenLoader } from "@/components/Preloader";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";

export default function WorkspaceChat() {
  const { loading, requiresAuth, mode } = usePasswordModal();

  if (loading) return <FullScreenLoader />;
  if (requiresAuth !== false) {
    return <>{requiresAuth !== null && <PasswordModal mode={mode} />}</>;
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-zinc-950 light:bg-slate-50 flex">
      {!isMobile && <Sidebar />}
      <ShowWorkspaceChat />
    </div>
  );
}

function ShowWorkspaceChat() {
  const { slug, threadSlug } = useParams();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState(null);
  const ensuringThreadRef = useRef(false);
  // Tracks which workspace `workspace` belongs to. While a new workspace's
  // data is in flight, we keep the previous workspace's chat mounted
  // (Slack/Linear-style transition) instead of flashing a skeleton.
  const [loadedSlug, setLoadedSlug] = useState(null);

  useEffect(() => {
    async function getWorkspace() {
      if (!slug) return;
      const _workspace = await Workspace.bySlug(slug);
      if (!_workspace) {
        setWorkspace(null);
        setLoadedSlug(slug);
        return;
      }

      const [suggestedMessages, { showAgentCommand }] = await Promise.all([
        Workspace.getSuggestedMessages(slug),
        Workspace.agentCommandAvailable(slug),
      ]);
      setWorkspace({
        ..._workspace,
        suggestedMessages,
        showAgentCommand,
      });
      setLoadedSlug(slug);
      localStorage.setItem(
        LAST_VISITED_WORKSPACE,
        JSON.stringify({
          slug: _workspace.slug,
          name: _workspace.name,
        })
      );
    }
    getWorkspace();
  }, [slug]);

  useEffect(() => {
    async function ensureThreadRoute() {
      if (!workspace?.slug || threadSlug || ensuringThreadRef.current) return;

      ensuringThreadRef.current = true;
      try {
        const { threads } = await Workspace.threads.all(workspace.slug);
        if (threads?.length > 0) {
          navigate(
            paths.workspace.thread(workspace.slug, threads[0].slug),
            { replace: true }
          );
          return;
        }
        const { thread, error } = await Workspace.threads.new(workspace.slug);
        if (thread) {
          navigate(paths.workspace.thread(workspace.slug, thread.slug), {
            replace: true,
          });
          return;
        }
        console.warn("[vela] could not create initial thread:", error);
      } finally {
        ensuringThreadRef.current = false;
      }
    }
    ensureThreadRoute();
  }, [workspace?.slug, threadSlug, navigate]);

  return (
    <WorkspaceChatContainer
      loading={loadedSlug !== slug}
      workspace={workspace}
    />
  );
}
