import { createContext, useContext, useMemo, useRef } from "react";
import useOrchestratorChat from "@/hooks/useOrchestratorChat";
import {
  patchOrchestratorPendingInDraft,
  resolveOrchestratorParentThreadSlug,
  syncWorkerThreadLiveDraft,
} from "@/utils/orchestratorRuns";

const OrchestratorChatContext = createContext(null);

/**
 * Keeps orchestrator polling alive while the artist switches between main and worker threads.
 */
export function OrchestratorChatProvider({ workspace, threadSlug, children }) {
  const enabled = !!workspace?.velaProjectId;
  const parentThreadSlug = useMemo(
    () => resolveOrchestratorParentThreadSlug(workspace?.slug, threadSlug),
    [workspace?.slug, threadSlug]
  );
  const parentThreadSlugRef = useRef(parentThreadSlug);
  parentThreadSlugRef.current = parentThreadSlug;

  const value = useOrchestratorChat({
    workspace,
    threadSlug: parentThreadSlug,
    enabled,
    parentThreadSlug,
    workerOriginThreadSlug: threadSlug,
    onRunUpdate: (_parentId, run) => {
      if (!workspace?.slug) return;
      syncWorkerThreadLiveDraft(workspace.slug, run);
      patchOrchestratorPendingInDraft(workspace.slug, parentThreadSlugRef.current, run);
    },
  });

  return (
    <OrchestratorChatContext.Provider value={value}>
      {children}
    </OrchestratorChatContext.Provider>
  );
}

export function useOrchestratorChatContext() {
  return useContext(OrchestratorChatContext);
}
