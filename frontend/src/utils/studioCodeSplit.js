/** Studio Code embed — multi-session split grid (M49.5 PR3). */

import { computeSplitGrid } from "@/utils/splitChatLayout";

export const MAX_STUDIO_CODE_SPLIT_PANES = 4;

const STORAGE_PREFIX = "vela-studio-code-split";

export function splitStorageKey(workspaceSlug) {
  return `${STORAGE_PREFIX}:${workspaceSlug}`;
}

export function loadSplitThreadSlugs(workspaceSlug) {
  if (!workspaceSlug) return [];
  try {
    const raw = localStorage.getItem(splitStorageKey(workspaceSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => typeof s === "string" && s.trim());
  } catch {
    return [];
  }
}

export function saveSplitThreadSlugs(workspaceSlug, slugs) {
  if (!workspaceSlug) return;
  try {
    const cleaned = (slugs || []).filter((s) => typeof s === "string" && s.trim());
    if (cleaned.length === 0) {
      localStorage.removeItem(splitStorageKey(workspaceSlug));
      return;
    }
    localStorage.setItem(splitStorageKey(workspaceSlug), JSON.stringify(cleaned));
  } catch {
    /* quota */
  }
}

/**
 * @returns {{ panes: string[], overflowCount: number, splitActive: boolean }}
 */
export function resolveStudioCodeSplitDisplay(selectedSlugs, routeThreadSlug) {
  const selected = (selectedSlugs || []).filter(Boolean);
  if (selected.length === 0) {
    return {
      panes: routeThreadSlug ? [routeThreadSlug] : [],
      overflowCount: 0,
      splitActive: false,
    };
  }
  const panes = selected.slice(0, MAX_STUDIO_CODE_SPLIT_PANES);
  return {
    panes,
    overflowCount: Math.max(0, selected.length - MAX_STUDIO_CODE_SPLIT_PANES),
    splitActive: true,
  };
}

export function toggleSplitThreadSlug(workspaceSlug, threadSlug, checked, currentSlugs) {
  const set = new Set(currentSlugs || []);
  if (checked) {
    if (set.size >= MAX_STUDIO_CODE_SPLIT_PANES && !set.has(threadSlug)) {
      return Array.from(set);
    }
    set.add(threadSlug);
  } else {
    set.delete(threadSlug);
  }
  const next = Array.from(set);
  saveSplitThreadSlugs(workspaceSlug, next);
  return next;
}

export function studioCodeSplitGridStyle(paneCount, isMobile) {
  const capped = Math.max(1, Math.min(MAX_STUDIO_CODE_SPLIT_PANES, paneCount));
  const { rows, cols } = computeSplitGrid(capped);
  if (isMobile) {
    return {
      gridTemplateRows: `repeat(${capped}, minmax(160px, 1fr))`,
      gridTemplateColumns: "1fr",
    };
  }
  return {
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  };
}
