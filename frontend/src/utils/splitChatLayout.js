/** Split chat layout helpers (M26). */

export const MAX_SPLIT_PANES = 12;
export const MAX_SPLIT_WORKER_PANES = MAX_SPLIT_PANES - 1;

export const CHAT_LAYOUT_SINGLE = "single";
export const CHAT_LAYOUT_SPLIT = "split";

export function chatLayoutStorageKey(workspaceSlug) {
  return `vela-chat-layout:${workspaceSlug}`;
}

export function loadChatLayoutMode(workspaceSlug) {
  if (!workspaceSlug) return CHAT_LAYOUT_SINGLE;
  try {
    const raw = window.localStorage.getItem(
      chatLayoutStorageKey(workspaceSlug)
    );
    return raw === CHAT_LAYOUT_SPLIT ? CHAT_LAYOUT_SPLIT : CHAT_LAYOUT_SINGLE;
  } catch {
    return CHAT_LAYOUT_SINGLE;
  }
}

export function saveChatLayoutMode(workspaceSlug, mode) {
  if (!workspaceSlug) return;
  try {
    window.localStorage.setItem(chatLayoutStorageKey(workspaceSlug), mode);
  } catch {
    /* quota */
  }
}

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "blocked",
  "cancelled",
]);

const RUN_STATUS_RANK = {
  needs_user_input: 0,
  running: 1,
  queued: 2,
  classifying: 3,
  completed: 4,
  failed: 5,
  blocked: 6,
  cancelled: 7,
};

function runStatusRank(status) {
  return RUN_STATUS_RANK[status] ?? 8;
}

function runMatchesThread(entry, runsById) {
  if (!entry?.runId) return null;
  return runsById[entry.runId] || null;
}

function isRecentlyCompleted(run, maxAgeMs = 30 * 60 * 1000) {
  if (!run || run.status !== "completed") return false;
  const ts = run.updated_at || run.completed_at || run.created_at;
  if (!ts) return false;
  const updated = new Date(ts).getTime();
  if (Number.isNaN(updated)) return false;
  return Date.now() - updated <= maxAgeMs;
}

function workerQualifies(entry, runsById) {
  const run = runMatchesThread(entry, runsById);
  if (!run) return true;
  if (!TERMINAL_STATUSES.has(run.status)) return true;
  return isRecentlyCompleted(run);
}

function compareWorkerEntries(a, b, runsById) {
  const runA = runMatchesThread(a, runsById);
  const runB = runMatchesThread(b, runsById);
  const rankA = runStatusRank(runA?.status);
  const rankB = runStatusRank(runB?.status);
  if (rankA !== rankB) return rankA - rankB;
  const createdA = runA?.created_at || "";
  const createdB = runB?.created_at || "";
  if (createdA !== createdB)
    return String(createdA).localeCompare(String(createdB));
  return String(a.threadSlug).localeCompare(String(b.threadSlug));
}

/**
 * @returns {{ panes: Array<{ id: string, threadSlug: string, isMain: boolean, roleId?: string, runId?: string, label: string }>, overflowCount: number }}
 */
export function enumerateSplitPanes({
  workspaceSlug: _workspaceSlug,
  mainThreadSlug,
  workerMap = {},
  runs = [],
}) {
  const mainSlug = mainThreadSlug ?? "";
  const runsById = Object.fromEntries(
    (Array.isArray(runs) ? runs : [])
      .filter((r) => r?.run_id)
      .map((r) => [r.run_id, r])
  );

  const panes = [
    {
      id: `main:${mainSlug}`,
      threadSlug: mainSlug,
      isMain: true,
      roleId: "orchestrator",
      label: "Main",
    },
  ];

  const workers = Object.values(workerMap)
    .filter(
      (entry) =>
        entry?.threadSlug &&
        entry.parentThreadSlug != null &&
        String(entry.parentThreadSlug) === String(mainSlug) &&
        workerQualifies(entry, runsById)
    )
    .sort((a, b) => compareWorkerEntries(a, b, runsById));

  let overflowCount = 0;
  const workerCap = MAX_SPLIT_WORKER_PANES;
  const included = workers.slice(0, workerCap);
  overflowCount = Math.max(0, workers.length - workerCap);

  for (const entry of included) {
    panes.push({
      id: `worker:${entry.threadSlug}`,
      threadSlug: entry.threadSlug,
      isMain: false,
      roleId: entry.roleId,
      runId: entry.runId,
      label: entry.threadSlug,
    });
  }

  return { panes, overflowCount };
}

/**
 * Dynamic grid dimensions for up to 12 panes (max 3 rows × 4 columns).
 */
export function computeSplitGrid(paneCount) {
  const n = Math.max(1, Math.min(MAX_SPLIT_PANES, paneCount));
  if (n === 1) return { rows: 1, cols: 1 };
  if (n === 2) return { rows: 1, cols: 2 };
  if (n <= 4) return { rows: 2, cols: 2 };
  if (n <= 6) return { rows: 2, cols: 3 };
  if (n <= 8) return { rows: 2, cols: 4 };
  return { rows: 3, cols: 4 };
}
