import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { fetchThreadContextFill } from "@/utils/studioCodeContext";
import { isStudioCodeEmbed } from "@/utils/studioCodeRole";

const StudioCodeContextState = createContext(null);

export function StudioCodeContextProvider({
  workspace,
  onNewAgent = null,
  children,
}) {
  const [searchParams] = useSearchParams();
  const enabled = isStudioCodeEmbed(searchParams) && !!workspace?.slug;
  const [fillByThreadSlug, setFillByThreadSlug] = useState({});
  const inflightRef = useRef(new Set());

  const refreshThread = useCallback(
    async (threadSlug) => {
      if (!enabled || !workspace?.slug || !threadSlug) return;
      const key = `${workspace.slug}:${threadSlug}`;
      if (inflightRef.current.has(key)) return;
      inflightRef.current.add(key);
      try {
        const fill = await fetchThreadContextFill(workspace.slug, threadSlug);
        setFillByThreadSlug((prev) => ({
          ...prev,
          [threadSlug]: fill,
        }));
      } finally {
        inflightRef.current.delete(key);
      }
    },
    [enabled, workspace?.slug]
  );

  const refreshThreads = useCallback(
    async (threadSlugs) => {
      if (!enabled || !workspace?.slug) return;
      const slugs = (threadSlugs || []).filter(Boolean);
      await Promise.all(slugs.map((slug) => refreshThread(slug)));
    },
    [enabled, workspace?.slug, refreshThread]
  );

  const value = useMemo(
    () => ({
      enabled,
      fillByThreadSlug,
      refreshThread,
      refreshThreads,
      getFill(threadSlug) {
        return (
          fillByThreadSlug[threadSlug] || {
            ratio: 0,
            level: "normal",
            currentTokens: 0,
            contextWindow: 0,
          }
        );
      },
      onNewAgent,
    }),
    [enabled, fillByThreadSlug, refreshThread, refreshThreads, onNewAgent]
  );

  return (
    <StudioCodeContextState.Provider value={value}>
      {children}
    </StudioCodeContextState.Provider>
  );
}

export function useStudioCodeContext() {
  return useContext(StudioCodeContextState);
}

/** Notify sidebar to refresh context fill for a thread after chat updates. */
export const STUDIO_CODE_CONTEXT_REFRESH_EVENT = "vela-studio-code-context-refresh";

export function emitStudioCodeContextRefresh(workspaceSlug, threadSlug) {
  if (!workspaceSlug || !threadSlug) return;
  window.dispatchEvent(
    new CustomEvent(STUDIO_CODE_CONTEXT_REFRESH_EVENT, {
      detail: { workspaceSlug, threadSlug },
    })
  );
}

export function useStudioCodeContextRefreshListener(workspace, onRefresh) {
  useEffect(() => {
    if (!workspace?.slug) return;
    const handler = (event) => {
      if (event.detail?.workspaceSlug !== workspace.slug) return;
      onRefresh?.(event.detail?.threadSlug);
    };
    window.addEventListener(STUDIO_CODE_CONTEXT_REFRESH_EVENT, handler);
    return () =>
      window.removeEventListener(STUDIO_CODE_CONTEXT_REFRESH_EVENT, handler);
  }, [workspace?.slug, onRefresh]);
}
