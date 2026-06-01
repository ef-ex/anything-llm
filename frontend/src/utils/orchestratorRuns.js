import Vela from "@/models/vela";
import Workspace from "@/models/workspace";

const STORAGE_PREFIX = "vela-orchestrator-runs";
const WORKER_THREADS_PREFIX = "vela-worker-threads";
export const VELA_WORKER_THREAD_EVENT = "vela-worker-thread-created";
export const VELA_ORCHESTRATOR_DRAFT_EVENT = "vela-orchestrator-draft-updated";

/** Default artist-facing prompt when routing needs clarification. */
export const DEFAULT_CLARIFICATION_MESSAGE =
  "Vela isn't sure what you'd like to do yet. Tell her what you want to work on—for example concept art, editing, or code.";

/** Short operator/error strings only — not orchestrator routing narratives. */
const TECHNICAL_MESSAGE_MARKERS = [
  "orchestrator returned",
  "non-json",
  "malformed_orchestrator",
  "invalid_orchestrator",
  "blocker_reason",
  "worker needs your input",
  "selecting role",
  "provider_chat",
];

const ROLE_DISPLAY_NAMES = {
  orchestrator: "Vela",
  "development-tester": "development tester",
  "concept-artist": "concept artist",
  "producer-coordinator": "producer",
};

export function roleDisplayName(roleId) {
  if (!roleId) return "a studio worker";
  return ROLE_DISPLAY_NAMES[roleId] || roleId.replace(/-/g, " ");
}

export function orchestratorSessionKey(workspaceSlug, threadSlug) {
  return `${STORAGE_PREFIX}:${workspaceSlug}:${threadSlug || "default"}`;
}

const CHAT_DRAFT_PREFIX = "vela-orch-chat-draft";

export function orchestratorChatDraftKey(workspaceSlug, threadSlug) {
  return `${CHAT_DRAFT_PREFIX}:${workspaceSlug}:${threadSlug || "default"}`;
}

/** Persist in-flight orchestrator chat (survives thread navigation before writeback). */
export function saveOrchestratorChatDraft(workspaceSlug, threadSlug, history) {
  if (!workspaceSlug || !Array.isArray(history)) return;
  try {
    sessionStorage.setItem(
      orchestratorChatDraftKey(workspaceSlug, threadSlug),
      JSON.stringify(history)
    );
  } catch {
    /* quota */
  }
}

export function loadOrchestratorChatDraft(workspaceSlug, threadSlug) {
  if (!workspaceSlug) return null;
  try {
    const raw = sessionStorage.getItem(orchestratorChatDraftKey(workspaceSlug, threadSlug));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearOrchestratorChatDraft(workspaceSlug, threadSlug) {
  if (!workspaceSlug) return;
  sessionStorage.removeItem(orchestratorChatDraftKey(workspaceSlug, threadSlug));
}

/** Main thread slug for orchestrator session when viewing a worker sub-thread. */
export function resolveOrchestratorParentThreadSlug(workspaceSlug, threadSlug) {
  if (!workspaceSlug || !threadSlug) return threadSlug;
  const map = loadWorkerThreadMap(workspaceSlug);
  const entry = Object.values(map).find((e) => e.threadSlug === threadSlug);
  return entry?.parentThreadSlug ?? threadSlug;
}

/** Update in-flight pending assistant + reasoning in sessionStorage (survives thread navigation). */
export function patchOrchestratorPendingInDraft(workspaceSlug, threadSlug, run) {
  if (!workspaceSlug || !threadSlug || !run) return;
  const draft = loadOrchestratorChatDraft(workspaceSlug, threadSlug);
  if (!Array.isArray(draft) || !draft.some((m) => m?.velaOrchestratorPending)) return;

  const reason =
    orchestratorLiveStatusText(run) ||
    (run.status === "queued" || run.status === "running" ? "Vela is thinking…" : "");

  const next = draft.map((m) =>
    m.velaOrchestratorPending
      ? {
          ...m,
          velaRoutingReason: reason,
          velaOrchestratorRunId: run.run_id,
          pending: true,
        }
      : m
  );
  saveOrchestratorChatDraft(workspaceSlug, threadSlug, next);
  window.dispatchEvent(
    new CustomEvent(VELA_ORCHESTRATOR_DRAFT_EVENT, {
      detail: { workspaceSlug, threadSlug },
    })
  );
}

/** Persist completed turn in draft until server history catches up on next load. */
export function saveOrchestratorChatDraftFinal(workspaceSlug, threadSlug, history) {
  if (!workspaceSlug || !Array.isArray(history)) return;
  const finalized = history.map((m) => {
    if (!m?.velaOrchestratorPending && !m?.pending) return m;
    const { pending, velaOrchestratorPending, ...rest } = m;
    return { ...rest, pending: false };
  });
  saveOrchestratorChatDraft(workspaceSlug, threadSlug, finalized);
  window.dispatchEvent(
    new CustomEvent(VELA_ORCHESTRATOR_DRAFT_EVENT, {
      detail: { workspaceSlug, threadSlug },
    })
  );
}

/** Prefer live draft while a turn is still in progress. */
/** Last user turn when a pending orchestrator assistant row is appended after it. */
export function resolveOrchestratorPromptTurn(history) {
  if (!Array.isArray(history) || history.length === 0) {
    return { promptMessage: null, remHistory: [] };
  }
  let lastUserIdx = -1;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const m = history[i];
    if (m?.role === "user" && String(m.content || "").trim()) {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) {
    return { promptMessage: null, remHistory: history };
  }
  return {
    promptMessage: history[lastUserIdx],
    remHistory: history.slice(0, lastUserIdx),
  };
}

function enrichOrchestratorMessageFields(target, source) {
  if (!target || !source) return target;
  return {
    ...target,
    velaRoutingReason: target.velaRoutingReason || source.velaRoutingReason,
    velaOrchestratorRunId: target.velaOrchestratorRunId || source.velaOrchestratorRunId,
  };
}

export function mergeOrchestratorChatHistory(serverHistory, draft) {
  if (!Array.isArray(draft) || draft.length === 0) {
    return Array.isArray(serverHistory) ? serverHistory : [];
  }
  if (!Array.isArray(serverHistory) || serverHistory.length === 0) {
    return draft;
  }
  const draftActive = draft.some((m) => m?.pending || m?.velaOrchestratorPending);
  if (draftActive) return draft;

  const draftByUuid = Object.fromEntries(
    draft.filter((m) => m?.uuid).map((m) => [m.uuid, m])
  );
  const merged = serverHistory.map((m) => enrichOrchestratorMessageFields(m, draftByUuid[m.uuid]));

  if (draft.length > merged.length) return draft;
  if (draft.length === merged.length) {
    return merged.map((m, i) => enrichOrchestratorMessageFields(m, draft[i]));
  }
  return merged;
}

/** Live worker-thread view while the run is in progress (before DB writeback). */
export function syncWorkerThreadLiveDraft(workspaceSlug, run) {
  if (!workspaceSlug || !run?.run_id) return;
  if (
    run.status === "completed" ||
    run.status === "failed" ||
    run.status === "blocked" ||
    run.status === "needs_user_input"
  ) {
    return;
  }
  const link = workerThreadForRun(workspaceSlug, run.run_id);
  if (!link?.threadSlug) return;

  const role = roleDisplayName(run.role_id);
  const inProgress =
    run.status === "classifying" || run.status === "queued" || run.status === "running";
  const summary =
    buildWorkerThreadSummary(run) ||
    `${role} is working on your request…`;
  const reasoning = orchestratorRoutingReason(run) || orchestratorLiveStatusText(run);

  saveOrchestratorChatDraft(workspaceSlug, link.threadSlug, [
    {
      uuid: `vela-worker-${run.run_id}`,
      role: "user",
      content: "Worker session started by Vela.",
    },
    {
      uuid: `vela-worker-reply-${run.run_id}`,
      role: "assistant",
      content: summary,
      velaRoutingReason: reasoning || undefined,
      velaOrchestratorPending: inProgress,
      pending: inProgress,
    },
  ]);
  window.dispatchEvent(
    new CustomEvent(VELA_ORCHESTRATOR_DRAFT_EVENT, {
      detail: { workspaceSlug, threadSlug: link.threadSlug },
    })
  );
}

function workerThreadsKey(workspaceSlug) {
  return `${WORKER_THREADS_PREFIX}:${workspaceSlug}`;
}

function workerParentHintKey(workspaceSlug, runId) {
  return `vela-worker-parent:${workspaceSlug}:${runId}`;
}

/** Normalize thread slug for parent/child matching (default chat = empty string). */
export function normalizeThreadSlug(slug) {
  return slug == null || slug === "" ? "" : String(slug);
}

function threadSlugsMatch(parentSlug, threadSlug) {
  return normalizeThreadSlug(parentSlug) === normalizeThreadSlug(threadSlug);
}

export function saveWorkerParentForRun(workspaceSlug, runId, parentThreadSlug) {
  if (!workspaceSlug || !runId) return;
  try {
    sessionStorage.setItem(
      workerParentHintKey(workspaceSlug, runId),
      normalizeThreadSlug(parentThreadSlug)
    );
  } catch {
    /* quota */
  }
}

export function loadWorkerParentForRun(workspaceSlug, runId) {
  if (!workspaceSlug || !runId) return null;
  try {
    const raw = sessionStorage.getItem(workerParentHintKey(workspaceSlug, runId));
    return raw === null ? null : raw;
  } catch {
    return null;
  }
}

/** Map orchestrator session_id (from API) to sidebar parent thread slug. */
export function sessionIdToParentThreadSlug(sessionId, workspaceSlug) {
  if (!sessionId || sessionId === "default") return "";
  if (workspaceSlug && sessionId === workspaceSlug) return "";
  return String(sessionId);
}

function workerParentNeedsRepair(entry) {
  if (!entry?.runId && !entry?.threadSlug) return false;
  return entry.parentThreadSlug === null || entry.parentThreadSlug === undefined;
}

function resolveWorkerParentSlug(workspaceSlug, runId, parentThreadSlug) {
  if (parentThreadSlug != null && parentThreadSlug !== "") {
    return normalizeThreadSlug(parentThreadSlug);
  }
  const hint = loadWorkerParentForRun(workspaceSlug, runId);
  if (hint !== null) return hint;
  return "";
}

export function isWorkerThreadEntry(entry) {
  return !!(entry?.threadSlug && entry?.runId);
}

export function workerThreadChildSlugs(workspaceSlug) {
  const map = loadWorkerThreadMap(workspaceSlug);
  return new Set(
    Object.values(map)
      .map((e) => e?.threadSlug)
      .filter(Boolean)
  );
}

export function isWorkerThreadSlug(workspaceSlug, threadSlug) {
  if (!threadSlug) return false;
  return workerThreadChildSlugs(workspaceSlug).has(threadSlug);
}

/** Backfill parent thread slugs from per-run session hints (sync, sessionStorage only). */
export function repairWorkerThreadParents(workspaceSlug) {
  if (!workspaceSlug) return false;
  const map = loadWorkerThreadMap(workspaceSlug);
  let changed = false;
  for (const [runId, entry] of Object.entries(map)) {
    if (!entry || !workerParentNeedsRepair(entry)) continue;
    const hint = loadWorkerParentForRun(workspaceSlug, entry.runId || runId);
    if (hint === null) continue;
    entry.parentThreadSlug = hint;
    changed = true;
  }
  if (changed) saveWorkerThreadMap(workspaceSlug, map);
  return changed;
}

/** Repair missing parents from orchestrator run session_id (survives hub restart). */
export async function repairWorkerThreadParentsAsync(workspaceSlug) {
  if (!workspaceSlug) return false;
  let changed = repairWorkerThreadParents(workspaceSlug);
  const map = loadWorkerThreadMap(workspaceSlug);
  const pending = Object.entries(map).filter(([, entry]) => workerParentNeedsRepair(entry));
  if (pending.length === 0) return changed;

  await Promise.all(
    pending.map(async ([key, entry]) => {
      const runId = entry.runId || key;
      try {
        const run = await Vela.getOrchestratorRun(workspaceSlug, runId, {
          includeEvents: false,
        });
        if (!run?.session_id) return;
        const parent = sessionIdToParentThreadSlug(run.session_id, workspaceSlug);
        entry.parentThreadSlug = parent;
        saveWorkerParentForRun(workspaceSlug, runId, parent);
        changed = true;
      } catch {
        /* run removed or API unavailable */
      }
    })
  );

  if (changed) {
    saveWorkerThreadMap(workspaceSlug, map);
    window.dispatchEvent(
      new CustomEvent(VELA_WORKER_THREAD_EVENT, {
        detail: { workspaceSlug, repaired: true },
      })
    );
  }
  return changed;
}

export function loadWorkerThreadMap(workspaceSlug) {
  try {
    const raw = sessionStorage.getItem(workerThreadsKey(workspaceSlug));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveWorkerThreadMap(workspaceSlug, map) {
  sessionStorage.setItem(workerThreadsKey(workspaceSlug), JSON.stringify(map));
}

export function workerThreadForRun(workspaceSlug, runId) {
  if (!workspaceSlug || !runId) return null;
  const map = loadWorkerThreadMap(workspaceSlug);
  return map[runId] || null;
}

const _workerThreadCreatePromises = new Map();

/**
 * Create a workspace thread for an orchestrator worker run (artist sub-session).
 * Dedupes concurrent callers (poll + sync) per run_id.
 */
export async function ensureWorkerThread(workspaceSlug, { run, parentThreadSlug = null }) {
  if (!workspaceSlug || !run?.run_id || !run.role_id) return null;
  if (run.role_id === "orchestrator") return null;

  const effectiveParent = resolveWorkerParentSlug(
    workspaceSlug,
    run.run_id,
    parentThreadSlug
  );

  const map = loadWorkerThreadMap(workspaceSlug);
  if (map[run.run_id]) {
    const existing = map[run.run_id];
    if (workerParentNeedsRepair(existing)) {
      existing.parentThreadSlug = effectiveParent;
      saveWorkerParentForRun(workspaceSlug, run.run_id, effectiveParent);
      saveWorkerThreadMap(workspaceSlug, map);
      window.dispatchEvent(
        new CustomEvent(VELA_WORKER_THREAD_EVENT, {
          detail: { workspaceSlug, ...existing },
        })
      );
    }
    return existing;
  }

  if (_workerThreadCreatePromises.has(run.run_id)) {
    return _workerThreadCreatePromises.get(run.run_id);
  }

  const createPromise = (async () => {
    const latestMap = loadWorkerThreadMap(workspaceSlug);
    if (latestMap[run.run_id]) return latestMap[run.run_id];

    const { thread, error } = await Workspace.threads.new(workspaceSlug);
    if (!thread || error) {
      console.warn("[vela] worker thread create failed", error);
      return null;
    }

    const label = roleDisplayName(run.role_id);
    await Workspace.threads.update(workspaceSlug, thread.slug, {
      name: `↳ ${label}`,
    });

    const entry = {
      threadSlug: thread.slug,
      parentThreadSlug: effectiveParent,
      runId: run.run_id,
      roleId: run.role_id,
    };
    latestMap[run.run_id] = entry;
    saveWorkerParentForRun(workspaceSlug, run.run_id, effectiveParent);
    saveWorkerThreadMap(workspaceSlug, latestMap);
    window.dispatchEvent(
      new CustomEvent(VELA_WORKER_THREAD_EVENT, { detail: { workspaceSlug, ...entry } })
    );
    return entry;
  })();

  _workerThreadCreatePromises.set(run.run_id, createPromise);
  try {
    return await createPromise;
  } finally {
    _workerThreadCreatePromises.delete(run.run_id);
  }
}

function workerThreadPopulatedKey(workspaceSlug, runId) {
  return `vela-worker-thread-populated:${workspaceSlug}:${runId}`;
}

export function buildWorkerThreadSummary(run) {
  if (!run) return "";
  const parts = [];
  const role = roleDisplayName(run.role_id);
  parts.push(`**${role}** — ${run.status || "unknown"}`);

  const routing = orchestratorRoutingReason(run);
  if (routing) {
    parts.push(`**Why Vela chose this worker**\n\n${routing}`);
  }

  const output =
    formatWorkerOutput(run.output_text) ||
    (run.output_text && !run.output_text.trim().startsWith("{")
      ? run.output_text.trim()
      : null);
  if (output) {
    parts.push(`**Result**\n\n${output}`);
  }

  if (run.steps?.length > 0) {
    const stepLines = run.steps.map((s) => {
      const log = s.log_lines?.length ? s.log_lines[s.log_lines.length - 1] : "";
      return `- ${s.step_key}: ${s.status}${log ? ` — ${log}` : ""}`;
    });
    parts.push(`**What happened**\n\n${stepLines.join("\n")}`);
  }

  return parts.join("\n\n");
}

/** Write orchestrator/worker run summary into the worker thread chat. */
export async function populateWorkerThreadChat(workspaceSlug, run) {
  if (!workspaceSlug || !run?.run_id) return;
  const link = workerThreadForRun(workspaceSlug, run.run_id);
  if (!link?.threadSlug) return;

  const populatedKey = workerThreadPopulatedKey(workspaceSlug, run.run_id);
  if (sessionStorage.getItem(populatedKey)) return;

  const summary = buildWorkerThreadSummary(run);
  if (!summary) return;

  await Vela.writebackOrchestratorChat(workspaceSlug, {
    userMessage: "Worker session started by Vela.",
    assistantMessage: summary,
    threadSlug: link.threadSlug,
  });
  sessionStorage.setItem(populatedKey, "1");
}

export function sortThreadsWithWorkerChildren(threads, workspaceSlug) {
  const map = loadWorkerThreadMap(workspaceSlug);
  const bySlug = Object.fromEntries(threads.map((t) => [t.slug, t]));
  const childSlugs = new Set(
    Object.values(map)
      .map((w) => w.threadSlug)
      .filter((slug) => slug && bySlug[slug])
  );

  /** Default chat has no API row; nest those workers directly under the default sidebar row. */
  const defaultParentWorkers = [];
  for (const entry of Object.values(map)) {
    const slug = entry?.threadSlug;
    if (!slug || !bySlug[slug]) continue;
    if (normalizeThreadSlug(entry.parentThreadSlug) !== "") continue;
    if (!defaultParentWorkers.some((t) => t.slug === slug)) {
      defaultParentWorkers.push(bySlug[slug]);
    }
  }

  const ordered = [...defaultParentWorkers];
  for (const thread of threads) {
    if (childSlugs.has(thread.slug)) continue;
    if (defaultParentWorkers.some((t) => t.slug === thread.slug)) continue;
    ordered.push(thread);
    for (const entry of Object.values(map)) {
      if (
        entry.threadSlug &&
        bySlug[entry.threadSlug] &&
        normalizeThreadSlug(entry.parentThreadSlug) !== "" &&
        threadSlugsMatch(entry.parentThreadSlug, thread.slug) &&
        !ordered.includes(bySlug[entry.threadSlug])
      ) {
        ordered.push(bySlug[entry.threadSlug]);
      }
    }
  }
  for (const thread of threads) {
    if (!ordered.includes(thread)) ordered.push(thread);
  }
  return ordered;
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
  for (const key of Object.keys(map)) {
    if (map[key]?.run_id === run?.run_id && key !== parentMessageId) {
      delete map[key];
    }
  }
  map[parentMessageId] = run;
  saveStoredRuns(workspaceSlug, threadSlug, map);
}

const TERMINAL = new Set(["completed", "failed", "blocked", "needs_user_input"]);
const ACTIVE = new Set(["classifying", "queued", "running"]);

export function isTerminalStatus(status) {
  return TERMINAL.has(status);
}

export function isActiveOrchestratorStatus(status) {
  return ACTIVE.has(status);
}

export function formatOrchestratorModelLabel(modelId) {
  if (!modelId) return "";
  return String(modelId).replace(/^cursor-acp\//, "").trim();
}

export function findOpenClarificationRun(runsByParentId) {
  if (!runsByParentId || typeof runsByParentId !== "object") return null;
  return (
    Object.values(runsByParentId).find((run) => run?.status === "needs_user_input") ||
    null
  );
}

export function orchestratorRunForUserMessage(runsByParentId, message) {
  if (!message || !runsByParentId) return null;
  const key = message.uuid || (message.chatId != null ? String(message.chatId) : null);
  if (key && runsByParentId[key]) return runsByParentId[key];
  if (message.velaOrchestratorRunId) {
    return (
      Object.values(runsByParentId).find((r) => r?.run_id === message.velaOrchestratorRunId) ||
      null
    );
  }
  return null;
}

/** Routing reason for collapsible “Vela's reasoning” block. */
/** Live narrative for the reasoning panel (updates as run events arrive). */
export function orchestratorLiveStatusText(run) {
  if (!run) return "";
  const parts = [];
  const routing = orchestratorRoutingReason(run);
  if (routing) parts.push(routing);

  const eventLines = (run.events || [])
    .slice(-6)
    .map((ev) => String(ev?.message || "").trim())
    .filter((line) => line && !isTechnicalOrchestratorCopy(line));
  if (eventLines.length) {
    const joined = eventLines.join("\n");
    if (!parts.some((p) => joined.includes(p.slice(0, 40)))) {
      parts.push(joined);
    }
  }

  if (isActiveOrchestratorStatus(run.status)) {
    const sm = String(run.status_message || "").trim();
    if (sm && !isTechnicalOrchestratorCopy(sm) && !parts.includes(sm)) {
      parts.push(sm);
    }
    if (run.status === "classifying" && parts.length === 0) {
      parts.push("Vela is routing your request…");
    }
    if ((run.status === "queued" || run.status === "running") && run.role_id) {
      const role = roleDisplayName(run.role_id);
      const model = formatOrchestratorModelLabel(run.model_id);
      const workerLine = model
        ? `Working with ${role} (${model})…`
        : `Working with ${role}…`;
      if (!parts.some((p) => p.includes(role))) {
        parts.push(workerLine);
      }
    }
    const partial = String(run.output_text || "").trim();
    if (
      partial &&
      !partial.startsWith("{") &&
      !partial.includes("```json") &&
      partial.length < 800 &&
      !isTechnicalOrchestratorCopy(partial)
    ) {
      parts.push(partial.length > 300 ? `${partial.slice(0, 300)}…` : partial);
    }
  }

  return parts.join("\n\n").trim();
}

export function orchestratorRoutingReason(run) {
  if (!run) return "";
  const routing = run.routing_evidence || {};
  const raw = routing.reason || run.selection_reason || "";
  let text = String(raw).trim();
  if (!text) return "";
  if (isTechnicalOrchestratorCopy(text)) return "";

  // Unwrap single-line "Routing: … Readiness: … Handoff: …" into readable paragraphs
  if (/^Routing:/i.test(text)) {
    const segments = [];
    const routingM = text.match(/Routing:\s*([\s\S]*?)(?=Readiness:|Handoff:|$)/i);
    const readinessM = text.match(/Readiness:\s*([\s\S]*?)(?=Handoff:|$)/i);
    const handoffM = text.match(/Handoff:\s*([\s\S]*?)$/i);
    if (routingM?.[1]?.trim()) segments.push(routingM[1].trim());
    if (readinessM?.[1]?.trim()) segments.push(readinessM[1].trim());
    if (handoffM?.[1]?.trim()) segments.push(handoffM[1].trim());
    if (segments.length > 0) text = segments.join("\n\n");
  }

  return text.trim();
}

export async function pollOrchestratorRun(
  workspaceSlug,
  runId,
  { intervalMs = 400, timeoutMs = 300000, onUpdate } = {}
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

export const CLASSIFIER_ROLE_IDS = new Set(["orchestrator"]);

export function workerRoleIdForOrchestratorRequest(roleId, workspace) {
  const picked = roleId || workspace?.velaRolePresetId || null;
  if (!picked || CLASSIFIER_ROLE_IDS.has(picked)) return null;
  return picked;
}

function isWorkerMetadataHandoff(text) {
  if (!text || typeof text !== "string") return false;
  const lowered = text.toLowerCase();
  return (
    lowered.includes("metadata") ||
    lowered.includes("does not emit") ||
    lowered.includes("json wrapper") ||
    lowered.includes("dummy/test role") ||
    lowered.includes("routing-only") ||
    lowered.includes("development-tester dummy")
  );
}

function isTechnicalOrchestratorCopy(text) {
  if (!text || typeof text !== "string") return true;
  if (isWorkerMetadataHandoff(text)) return true;
  const trimmed = text.trim();
  if (trimmed.length > 140) return false;
  const lowered = trimmed.toLowerCase();
  return TECHNICAL_MESSAGE_MARKERS.some((m) => lowered.includes(m));
}

function tryParseJsonObject(text) {
  if (!text || typeof text !== "string") return null;
  let trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) trimmed = fence[1].trim();
  if (!trimmed.startsWith("{")) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) trimmed = match[0];
    else return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function tryParseClassifierJson(text) {
  const parsed = tryParseJsonObject(text);
  if (parsed && "confidence" in parsed) return parsed;
  return null;
}

/** Format development-tester / worker JSON for chat. */
export function formatWorkerOutput(text) {
  const parsed = tryParseJsonObject(text);
  if (!parsed) return null;

  if ("confidence" in parsed && "role_id" in parsed) {
    return null;
  }

  const parts = [];
  if (parsed.note && typeof parsed.note === "string") {
    parts.push(parsed.note.trim());
  }
  if (parsed.predicted_output?.description) {
    parts.push(String(parsed.predicted_output.description).trim());
  }
  if (parsed.predicted_path && typeof parsed.predicted_path === "string") {
    const path = parsed.predicted_path.replace(/\\/g, "/");
    const name = path.split("/").pop() || path;
    parts.push(`Planned file: ${name}`);
  }
  if (parsed.summary && typeof parsed.summary === "string") {
    parts.push(parsed.summary.trim());
  }
  if (parsed.message && typeof parsed.message === "string") {
    parts.push(parsed.message.trim());
  }

  const unique = [...new Set(parts.filter(Boolean))];
  return unique.length > 0 ? unique.join("\n\n") : null;
}

export function orchestratorFriendlyMessage(run) {
  if (!run) return null;
  const routing = run.routing_evidence || {};
  const candidates = [
    routing.clarification_question,
    run.pending_user_input?.question,
    ...(Array.isArray(run.warnings) ? run.warnings : []),
  ].filter(Boolean);

  for (const text of candidates) {
    const trimmed = String(text).trim();
    if (trimmed && !isTechnicalOrchestratorCopy(trimmed)) {
      return trimmed;
    }
  }

  if (run.status === "needs_user_input") {
    return DEFAULT_CLARIFICATION_MESSAGE;
  }

  return null;
}

export function orchestratorChatMessage(run) {
  if (!run) return null;

  const friendly = orchestratorFriendlyMessage(run);
  if (friendly) return friendly;

  if (run.status === "failed" || run.status === "blocked") {
    const err = run.error_message || run.status_message;
    if (err && !isTechnicalOrchestratorCopy(err)) return err;
    return "Something went wrong on the studio side. Try again in a moment.";
  }

  if (run.status === "completed" && run.output_text) {
    const worker = formatWorkerOutput(run.output_text);
    if (worker) return worker;

    const parsed = tryParseClassifierJson(run.output_text);
    if (parsed) {
      if (parsed.clarification_question) {
        const q = String(parsed.clarification_question).trim();
        if (q && !isTechnicalOrchestratorCopy(q)) return q;
        return DEFAULT_CLARIFICATION_MESSAGE;
      }
      return null;
    }
    const text = run.output_text.trim();
    if (text.startsWith("{") || text.includes("```json")) return formatWorkerOutput(text);
    if (!isTechnicalOrchestratorCopy(text)) return text;
  }

  return null;
}

export function orchestratorRunSummary(run) {
  if (!run) return "";
  if (isActiveOrchestratorStatus(run.status)) {
    const chat = orchestratorMainThreadReply(run);
    if (chat) {
      return chat.length > 160 ? `${chat.slice(0, 160)}…` : chat;
    }
    return orchestratorLiveStatusText(run) || run.status_message || "";
  }
  if (
    run.status === "completed" &&
    run.role_id &&
    run.role_id !== "orchestrator"
  ) {
    const routing = orchestratorRoutingReason(run);
    if (routing) {
      return routing.length > 160 ? `${routing.slice(0, 160)}…` : routing;
    }
  }
  return "";
}

export function shouldShowOrchestratorRunCard(run) {
  if (!run) return false;
  if (run.status === "needs_user_input") return false;
  if (isActiveOrchestratorStatus(run.status)) return true;
  if (run.role_id && run.role_id !== "orchestrator") {
    return run.status === "completed" || run.status === "failed" || run.status === "blocked";
  }
  return false;
}

export function orchestratorMainThreadReply(run) {
  const direct = orchestratorChatMessage(run);
  const workerCompleted =
    run?.status === "completed" && run.role_id && run.role_id !== "orchestrator";
  if (workerCompleted && (!direct || isWorkerMetadataHandoff(direct))) {
    const role = roleDisplayName(run.role_id);
    return `Vela handed this off to ${role}. Open the worker session (↳ in the thread list) for the full result.`;
  }
  return direct;
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
