import { useCallback, useEffect, useRef, useState } from "react";
import { v4 } from "uuid";
import Vela from "@/models/vela";
import {
  isTerminalStatus,
  pollOrchestratorRun,
  refreshOrchestratorRuns,
  upsertStoredRun,
} from "@/utils/orchestratorRuns";

function buildMessagesFromHistory(history, userText) {
  const messages = [];
  for (const item of history) {
    if (item.role === "user" && item.content?.trim()) {
      messages.push({ role: "user", content: item.content.trim() });
    }
    if (item.role === "assistant" && item.content?.trim() && !item.pending) {
      messages.push({ role: "assistant", content: item.content.trim() });
    }
  }
  if (!messages.some((m) => m.role === "user" && m.content === userText.trim())) {
    messages.push({ role: "user", content: userText.trim() });
  }
  return messages;
}

export default function useOrchestratorChat({
  workspace,
  threadSlug,
  enabled,
}) {
  const [runsByParentId, setRunsByParentId] = useState({});
  const [resumingRunId, setResumingRunId] = useState(null);
  const pollingRef = useRef(new Set());

  const sessionId = threadSlug || workspace?.slug || "default";

  const syncRun = useCallback(
    (parentMessageId, run) => {
      if (!workspace?.slug || !parentMessageId) return;
      upsertStoredRun(workspace.slug, threadSlug, parentMessageId, run);
      setRunsByParentId((prev) => ({ ...prev, [parentMessageId]: run }));
    },
    [workspace?.slug, threadSlug]
  );

  useEffect(() => {
    if (!enabled || !workspace?.velaProjectId || !workspace?.slug) return;
    let cancelled = false;
    (async () => {
      try {
        const map = await refreshOrchestratorRuns(workspace.slug, {
          projectId: workspace.velaProjectId,
          sessionId,
          threadSlug,
        });
        if (!cancelled) setRunsByParentId(map);
      } catch (err) {
        console.warn("[vela-orchestrator] could not load runs", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, workspace?.slug, workspace?.velaProjectId, sessionId, threadSlug]);

  const watchRun = useCallback(
    async (parentMessageId, runId) => {
      if (!workspace?.slug || pollingRef.current.has(runId)) return null;
      pollingRef.current.add(runId);
      try {
        const finalRun = await pollOrchestratorRun(workspace.slug, runId, {
          onUpdate: (detail) => syncRun(parentMessageId, detail),
        });
        syncRun(parentMessageId, finalRun);
        return finalRun;
      } finally {
        pollingRef.current.delete(runId);
      }
    },
    [workspace?.slug, syncRun]
  );

  const submitOrchestratorPrompt = useCallback(
    async ({
      userText,
      parentMessageId,
      history,
      roleId = null,
      attachments = [],
    }) => {
      if (!workspace?.velaProjectId) {
        throw new Error("No Vela project bound to this workspace.");
      }
      const clientMessageId = parentMessageId || v4();
      const created = await Vela.createOrchestratorRun(workspace.slug, {
        project_id: workspace.velaProjectId,
        session_id: sessionId,
        workspace_id: workspace.slug,
        parent_message_id: clientMessageId,
        client_message_id: clientMessageId,
        messages: buildMessagesFromHistory(history, userText),
        role_id: roleId || workspace.velaRolePresetId || null,
        attachment_hints: (attachments || []).map((a) => a?.name || String(a)).filter(Boolean),
      });

      let detail = await Vela.getOrchestratorRun(workspace.slug, created.run_id);
      syncRun(clientMessageId, detail);
      if (!isTerminalStatus(detail.status)) {
        return watchRun(clientMessageId, created.run_id);
      }
      return detail;
    },
    [workspace, sessionId, syncRun, watchRun]
  );

  const resumeRun = useCallback(
    async (run, answer) => {
      if (!workspace?.slug) return null;
      setResumingRunId(run.run_id);
      try {
        const detail = await Vela.resumeOrchestratorRun(workspace.slug, run.run_id, {
          answer,
          role_id: answer.includes("-") && !answer.includes(" ") ? answer : undefined,
        });
        const parentId = run.parent_message_id || detail.parent_message_id;
        syncRun(parentId, detail);
        if (detail.status === "queued" || detail.status === "running") {
          return watchRun(parentId, detail.run_id);
        }
        return detail;
      } finally {
        setResumingRunId(null);
      }
    },
    [workspace?.slug, syncRun, watchRun]
  );

  return {
    runsByParentId,
    resumingRunId,
    submitOrchestratorPrompt,
    resumeRun,
    syncRun,
  };
}
