import React, { useEffect, useState, useCallback, useMemo } from "react";
import Workspace from "@/models/workspace";
import LoadingChat from "./LoadingChat";
import ChatContainer from "./ChatContainer";
import SplitChatLayout from "./SplitChatLayout";
import paths from "@/utils/paths";
import ModalWrapper from "../ModalWrapper";
import { useParams } from "react-router-dom";
import { DnDFileUploaderProvider } from "./ChatContainer/DnDWrapper";
import { WarningCircle } from "@phosphor-icons/react";
import {
  TTSProvider,
  useWatchForAutoPlayAssistantTTSResponse,
} from "../contexts/TTSProvider";
import { PENDING_HOME_MESSAGE } from "@/utils/constants";
import { OrchestratorChatProvider } from "@/contexts/OrchestratorChatContext";
import {
  loadOrchestratorChatDraft,
  mergeOrchestratorChatHistory,
  resolveOrchestratorMainThreadSlug,
} from "@/utils/orchestratorRuns";
import {
  CHAT_LAYOUT_SINGLE,
  CHAT_LAYOUT_SPLIT,
  loadChatLayoutMode,
  saveChatLayoutMode,
} from "@/utils/splitChatLayout";

export default function WorkspaceChat({ loading, workspace, embedded = false }) {
  useWatchForAutoPlayAssistantTTSResponse();
  const { threadSlug = null } = useParams();
  const [layoutMode, setLayoutMode] = useState(CHAT_LAYOUT_SINGLE);
  const [loaded, setLoaded] = useState(null);

  const velaBound = !!workspace?.velaProjectId;
  const mainThreadSlug = useMemo(
    () =>
      velaBound
        ? resolveOrchestratorMainThreadSlug(workspace?.slug, threadSlug)
        : threadSlug,
    [velaBound, workspace?.slug, threadSlug]
  );

  useEffect(() => {
    if (!workspace?.slug) return;
    setLayoutMode(loadChatLayoutMode(workspace.slug));
  }, [workspace?.slug]);

  const handleLayoutModeChange = useCallback(
    (mode) => {
      if (!workspace?.slug) return;
      setLayoutMode(mode);
      saveChatLayoutMode(workspace.slug, mode);
    },
    [workspace?.slug]
  );

  useEffect(() => {
    if (loading || !workspace?.slug) return;

    const key = `${workspace.slug}:${threadSlug ?? "default"}`;
    const draft =
      workspace?.velaProjectId != null
        ? loadOrchestratorChatDraft(workspace.slug, threadSlug)
        : null;
    const draftHistory = mergeOrchestratorChatHistory([], draft);
    setLoaded({
      key,
      workspace,
      threadSlug,
      history: draftHistory,
    });
  }, [workspace?.slug, workspace?.velaProjectId, loading, threadSlug]);

  useEffect(() => {
    async function getHistory() {
      if (loading) return;
      if (!workspace?.slug) {
        setLoaded({ key: "none", workspace: null, history: [] });
        return false;
      }

      const key = `${workspace.slug}:${threadSlug ?? "default"}`;
      const draft =
        workspace?.velaProjectId != null
          ? loadOrchestratorChatDraft(workspace.slug, threadSlug)
          : null;

      const serverHistory = threadSlug
        ? await Workspace.threads.chatHistory(workspace.slug, threadSlug)
        : await Workspace.chatHistory(workspace.slug);

      const history = mergeOrchestratorChatHistory(serverHistory, draft);

      setLoaded({
        key,
        workspace,
        threadSlug,
        history,
      });
    }
    getHistory();
  }, [workspace, loading, threadSlug]);

  const splitActive = velaBound && layoutMode === CHAT_LAYOUT_SPLIT && !embedded;

  const hasPendingMessage = !!sessionStorage.getItem(PENDING_HOME_MESSAGE);
  if (loaded === null) {
    if (hasPendingMessage) {
      return (
        <div className="transition-all duration-500 relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full" />
      );
    }
    return <LoadingChat />;
  }
  if (!loading && !workspace) {
    return (
      <>
        {loading === false && !workspace && (
          <ModalWrapper isOpen={true}>
            <div className="w-full max-w-2xl bg-theme-bg-secondary rounded-lg shadow border-2 border-theme-modal-border overflow-hidden">
              <div className="relative p-6 border-b rounded-t border-theme-modal-border">
                <div className="w-full flex gap-x-2 items-center">
                  <WarningCircle
                    className="text-red-500 w-6 h-6"
                    weight="fill"
                  />
                  <h3 className="text-xl font-semibold text-red-500 overflow-hidden overflow-ellipsis whitespace-nowrap">
                    Workspace not found
                  </h3>
                </div>
              </div>
              <div className="py-7 px-9 space-y-2 flex-col">
                <p className="text-white text-sm">
                  The workspace you're looking for is not available. It may have
                  been deleted or you may not have access to it.
                </p>
              </div>
              <div className="flex w-full justify-end items-center p-6 space-x-2 border-t border-theme-modal-border rounded-b">
                <a
                  href={paths.home()}
                  className="transition-all duration-300 bg-white text-black hover:opacity-60 px-4 py-2 rounded-lg text-sm"
                >
                  Return to homepage
                </a>
              </div>
            </div>
          </ModalWrapper>
        )}
        <LoadingChat />
      </>
    );
  }

  setEventDelegatorForCodeSnippets();

  const orchestratorThreadSlug = splitActive
    ? mainThreadSlug
    : loaded.threadSlug;

  return (
    <TTSProvider>
      <DnDFileUploaderProvider
        workspace={loaded.workspace}
        threadSlug={loaded.threadSlug}
      >
        <OrchestratorChatProvider
          workspace={loaded.workspace}
          threadSlug={orchestratorThreadSlug}
        >
          {splitActive ? (
            <div
              style={{ height: isMobileHeight() }}
              className="relative flex md:ml-[2px] md:mr-[16px] md:my-[16px] w-full h-full z-[2]"
            >
              <div className="flex-1 min-w-0 relative md:rounded-[16px] bg-zinc-900 light:bg-white h-full overflow-hidden border-none light:border-solid light:border light:border-theme-modal-border">
                <SplitChatLayout
                  workspace={loaded.workspace}
                  mainThreadSlug={mainThreadSlug}
                  layoutMode={layoutMode}
                  onLayoutModeChange={handleLayoutModeChange}
                />
              </div>
            </div>
          ) : (
            <ChatContainer
              key={loaded.key}
              workspace={loaded.workspace}
              threadSlug={loaded.threadSlug}
              knownHistory={loaded.history}
              embedded={embedded}
              hideContextHeader={embedded}
              layoutMode={layoutMode}
              onLayoutModeChange={handleLayoutModeChange}
              showLayoutToggle={velaBound && !embedded}
            />
          )}
        </OrchestratorChatProvider>
      </DnDFileUploaderProvider>
    </TTSProvider>
  );
}

function isMobileHeight() {
  if (typeof window === "undefined") return "100%";
  return window.innerWidth < 768 ? "100%" : "calc(100% - 32px)";
}

// Enables us to safely markdown and sanitize all responses without risk of injection
// but still be able to attach a handler to copy code snippets on all elements
// that are code snippets.
function copyCodeSnippet(uuid) {
  const target = document.querySelector(`[data-code="${uuid}"]`);
  if (!target) return false;
  const markdown =
    target.parentElement?.parentElement?.querySelector(
      "pre:first-of-type"
    )?.innerText;
  if (!markdown) return false;

  window.navigator.clipboard.writeText(markdown);
  target.classList.add("text-green-500");
  const originalText = target.innerHTML;
  target.innerText = "Copied!";
  target.setAttribute("disabled", true);

  setTimeout(() => {
    target.classList.remove("text-green-500");
    target.innerHTML = originalText;
    target.removeAttribute("disabled");
  }, 2500);
}

// Listens and hunts for all data-code-snippet clicks.
export function setEventDelegatorForCodeSnippets() {
  document?.addEventListener("click", function (e) {
    const target = e.target.closest("[data-code-snippet]");
    const uuidCode = target?.dataset?.code;
    if (!uuidCode) return false;
    copyCodeSnippet(uuidCode);
  });
}
