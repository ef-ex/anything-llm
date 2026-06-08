/** Studio Code workspace — Hub role picker (M49.5). */

import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import { saveSplitThreadSlugs } from "@/utils/studioCodeSplit";

const STORAGE_PREFIX = "vela-studio-code-role";

/** Hub bundled role for Studio Ask / assistant split pane (not chosen via picker). */
export const STUDIO_ASSISTANT_ROLE_ID = "studio-assistant";

export function isStudioCodeEmbed(searchParams) {
  return searchParams?.get("studio") === "code";
}

export function isStudioAskEmbed(searchParams) {
  return searchParams?.get("studio") === "ask";
}

/** Studio embeds use vela-dispatch agent runtime, not Hub orchestrator chat. */
export function isStudioEmbed(searchParams) {
  return isStudioCodeEmbed(searchParams) || isStudioAskEmbed(searchParams);
}

/** Code embed uses vela-dispatch streaming chat, not orchestrator runs/worker threads. */
export function useOrchestratorChatForWorkspace(searchParams, workspace) {
  return !!workspace?.velaProjectId && !isStudioEmbed(searchParams);
}

export function studioCodeThreadPath(workspaceSlug, threadSlug = null) {
  if (!workspaceSlug) return "/";
  if (threadSlug) {
    return paths.studioCodeEmbed.thread(workspaceSlug, threadSlug);
  }
  return paths.studioCodeEmbed.chat(workspaceSlug);
}

export function studioAskThreadPath(workspaceSlug, threadSlug = null) {
  if (!workspaceSlug) return "/";
  if (threadSlug) {
    return paths.studioAskEmbed.thread(workspaceSlug, threadSlug);
  }
  return paths.studioAskEmbed.chat(workspaceSlug);
}

function storageKey(workspaceSlug, threadSlug = null) {
  if (threadSlug) return `${STORAGE_PREFIX}:${workspaceSlug}:${threadSlug}`;
  return `${STORAGE_PREFIX}:${workspaceSlug}`;
}

export function loadStudioCodeRole(workspaceSlug, threadSlug = null, defaultRoleId = "") {
  if (!workspaceSlug) return defaultRoleId;
  try {
    if (threadSlug) {
      const perThread = localStorage.getItem(storageKey(workspaceSlug, threadSlug));
      if (perThread && typeof perThread === "string" && perThread.trim()) {
        return perThread.trim();
      }
    }
    const raw = localStorage.getItem(storageKey(workspaceSlug));
    if (raw && typeof raw === "string" && raw.trim()) return raw.trim();
  } catch {
    /* ignore */
  }
  return defaultRoleId;
}

export function saveStudioCodeRole(workspaceSlug, roleId, threadSlug = null) {
  if (!workspaceSlug || !roleId) return;
  try {
    localStorage.setItem(storageKey(workspaceSlug, threadSlug), roleId);
    if (!threadSlug) {
      localStorage.setItem(storageKey(workspaceSlug), roleId);
    }
  } catch {
    /* quota */
  }
}

function clearStudioCodeRoleStorage(workspaceSlug, threadSlug = null) {
  if (!workspaceSlug) return;
  try {
    if (threadSlug) {
      localStorage.removeItem(storageKey(workspaceSlug, threadSlug));
    } else {
      localStorage.removeItem(storageKey(workspaceSlug));
    }
  } catch {
    /* ignore */
  }
}

export function pickDefaultRoleId(roles, serverDefaultId) {
  const ids = new Set((roles || []).map((r) => r.id));
  if (serverDefaultId && ids.has(serverDefaultId)) return serverDefaultId;
  return roles?.[0]?.id || "";
}

/**
 * Create a fresh agent thread and navigate to it (replaces the active route thread).
 */
export async function activateNewStudioCodeAgent({
  workspaceSlug,
  replaceThreadSlug = null,
  splitSlugs = [],
}) {
  const { thread, error } = await Workspace.threads.new(workspaceSlug);
  if (!thread?.slug) {
    throw new Error(error || "Could not create a new agent.");
  }
  if (
    replaceThreadSlug &&
    Array.isArray(splitSlugs) &&
    splitSlugs.includes(replaceThreadSlug)
  ) {
    saveSplitThreadSlugs(
      workspaceSlug,
      splitSlugs.map((slug) =>
        slug === replaceThreadSlug ? thread.slug : slug
      )
    );
  }
  return thread;
}

export function resolveStoredRoleId(
  workspaceSlug,
  roles,
  serverDefaultId,
  threadSlug = null,
  { assistantRoleId = null, splitPaneIndex = null, splitPaneCount = 0 } = {}
) {
  const ids = new Set((roles || []).map((r) => r.id));
  const hubAssistantId =
    assistantRoleId && ids.has(assistantRoleId)
      ? assistantRoleId
      : ids.has(STUDIO_ASSISTANT_ROLE_ID)
        ? STUDIO_ASSISTANT_ROLE_ID
        : null;
  const fallback = pickDefaultRoleId(roles, serverDefaultId);

  if (threadSlug) {
    const perThread = loadStudioCodeRole(workspaceSlug, threadSlug, "");
    if (perThread && ids.has(perThread)) return perThread;
    if (perThread) clearStudioCodeRoleStorage(workspaceSlug, threadSlug);
  }

  const workspaceLevel = loadStudioCodeRole(workspaceSlug, null, "");
  if (workspaceLevel && ids.has(workspaceLevel)) return workspaceLevel;
  if (workspaceLevel) clearStudioCodeRoleStorage(workspaceSlug, null);

  // Split assistant pane (no role picker): first pane defaults to studio-assistant.
  if (
    hubAssistantId &&
    splitPaneCount > 1 &&
    splitPaneIndex === 0 &&
    threadSlug
  ) {
    return hubAssistantId;
  }

  return fallback;
}

/** True when this thread is pinned to the Hub assistant role (hide role picker). */
export function isStudioAssistantThreadRole(roleId) {
  return roleId === STUDIO_ASSISTANT_ROLE_ID;
}
