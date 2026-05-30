import Vela from "@/models/vela";

const STORAGE_PREFIX = "vela-orchestrator-runs";

export function orchestratorSessionKey(workspaceSlug, threadSlug) {
  return `${STORAGE_PREFIX}:${workspaceSlug}:${threadSlug || "default"}`;
}

export function loadStoredRuns(workspaceSlug, threadSlug) {
  try {
    const raw = sessionStorage.getItem(orchestratorSessionKey(workspaceSlug, threadSlug));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveStoredRuns(workspaceSlug, threadSlug, runsByParentId) {
  sessionStorage.setItem(
    orchestratorSessionKey(workspaceSlug, threadSlug),
    JSON.stringify(runsByParentId)
  );
}

export function upsertStoredRun(workspaceSlug, threadSlug, parentMessageId, run) {
  const map = loadStoredRuns(workspaceSlug, threadSlug);
  map[parentMessageId] = run;
  saveStoredRuns(workspaceSlug, threadSlug, map);
}

const TERMINAL = new Set(["completed", "failed", "blocked", "needs_user_input"]);

export function isTerminalStatus(status) {
  return TERMINAL.has(status);
}

export async function pollOrchestratorRun(
  workspaceSlug,
  runId,
  { intervalMs = 1000, timeoutMs = 300000, onUpdate } = {}
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const detail = await Vela.getOrchestratorRun(workspaceSlug, runId);
    if (onUpdate) onUpdate(detail);
    if (isTerminalStatus(detail.status)) return detail;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Orchestrator run timed out while waiting for completion.");
}

export async function refreshOrchestratorRuns(
  workspaceSlug,
  { projectId, sessionId, threadSlug }
) {
  const { runs = [] } = await Vela.listOrchestratorRuns(workspaceSlug, {
    projectId,
    sessionId,
  });
  const map = {};
  for (const run of runs) {
    if (run.parent_message_id) {
      map[run.parent_message_id] = run;
    }
  }
  saveStoredRuns(workspaceSlug, threadSlug, map);
  return map;
}
