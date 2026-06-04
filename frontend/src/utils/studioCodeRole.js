/** Studio Code workspace — Hub role picker (M49.5). */

import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import { saveSplitThreadSlugs } from "@/utils/studioCodeSplit";

export const DEFAULT_STUDIO_CODE_ROLE_ID = "code-maintainer";

const STORAGE_PREFIX = "vela-studio-code-role";

export function isStudioCodeEmbed(searchParams) {
  return searchParams?.get("studio") === "code";
}

/** Code embed uses vela-dispatch streaming chat, not orchestrator runs/worker threads. */
export function useOrchestratorChatForWorkspace(searchParams, workspace) {
  return !!workspace?.velaProjectId && !isStudioCodeEmbed(searchParams);
}

export function studioCodeThreadPath(workspaceSlug, threadSlug = null) {
  if (!workspaceSlug) return "/";
  if (threadSlug) {
    return paths.studioCodeEmbed.thread(workspaceSlug, threadSlug);
  }
  return paths.studioCodeEmbed.chat(workspaceSlug);
}

export function loadStudioCodeRole(workspaceSlug, defaultRoleId = DEFAULT_STUDIO_CODE_ROLE_ID) {
  if (!workspaceSlug) return defaultRoleId;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${workspaceSlug}`);
    if (raw && typeof raw === "string" && raw.trim()) return raw.trim();
  } catch {
    /* ignore */
  }
  return defaultRoleId;
}

export function saveStudioCodeRole(workspaceSlug, roleId) {
  if (!workspaceSlug || !roleId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:${workspaceSlug}`, roleId);
  } catch {
    /* quota */
  }
}

export function pickDefaultRoleId(roles, serverDefaultId) {
  const ids = new Set((roles || []).map((r) => r.id));
  if (serverDefaultId && ids.has(serverDefaultId)) return serverDefaultId;
  if (ids.has(DEFAULT_STUDIO_CODE_ROLE_ID)) return DEFAULT_STUDIO_CODE_ROLE_ID;
  return roles?.[0]?.id || DEFAULT_STUDIO_CODE_ROLE_ID;
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

export function resolveStoredRoleId(workspaceSlug, roles, serverDefaultId) {
  const fallback = pickDefaultRoleId(roles, serverDefaultId);
  const stored = loadStudioCodeRole(workspaceSlug, fallback);
  const ids = new Set((roles || []).map((r) => r.id));
  if (ids.has(stored)) return stored;
  return fallback;
}
