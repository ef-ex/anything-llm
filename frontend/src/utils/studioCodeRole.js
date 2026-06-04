/** Studio Code workspace — Hub role picker (M49.5). */

import paths from "@/utils/paths";

export const DEFAULT_STUDIO_CODE_ROLE_ID = "code-maintainer";

const STORAGE_PREFIX = "vela-studio-code-role";

export function isStudioCodeEmbed(searchParams) {
  return searchParams?.get("studio") === "code";
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

export function studioCodeDispatchParams(workspaceSlug, defaultRoleId = DEFAULT_STUDIO_CODE_ROLE_ID) {
  const roleId = loadStudioCodeRole(workspaceSlug, defaultRoleId);
  return {
    roleId,
    workflowId: null,
  };
}

export function pickDefaultRoleId(roles, serverDefaultId) {
  const ids = new Set((roles || []).map((r) => r.id));
  if (serverDefaultId && ids.has(serverDefaultId)) return serverDefaultId;
  if (ids.has(DEFAULT_STUDIO_CODE_ROLE_ID)) return DEFAULT_STUDIO_CODE_ROLE_ID;
  return roles?.[0]?.id || DEFAULT_STUDIO_CODE_ROLE_ID;
}

export function resolveStoredRoleId(workspaceSlug, roles, serverDefaultId) {
  const fallback = pickDefaultRoleId(roles, serverDefaultId);
  const stored = loadStudioCodeRole(workspaceSlug, fallback);
  const ids = new Set((roles || []).map((r) => r.id));
  if (ids.has(stored)) return stored;
  return fallback;
}
