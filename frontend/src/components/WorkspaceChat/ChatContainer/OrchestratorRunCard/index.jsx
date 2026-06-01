import { useEffect, useMemo, useState } from "react";
import { CaretDown, CaretRight, ArrowSquareOut } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import paths from "@/utils/paths";
import {
  formatOrchestratorModelLabel,
  orchestratorRunSummary,
  roleDisplayName,
  VELA_WORKER_THREAD_EVENT,
  workerThreadForRun,
} from "@/utils/orchestratorRuns";

function statusHeadline(run, t) {
  const role = roleDisplayName(run.role_id);
  if (run.status === "queued" || run.status === "running") {
    return t("chat_window.vela_orchestrator.dispatching", {
      defaultValue: "Vela is working with {{role}}…",
      role,
    });
  }
  if (run.status === "completed") {
    return t("chat_window.vela_orchestrator.dispatched_done", {
      defaultValue: "Vela worked with {{role}}.",
      role,
    });
  }
  if (run.status === "classifying") {
    return t("chat_window.vela_orchestrator.routing", {
      defaultValue: "Vela is choosing the right worker…",
    });
  }
  if (run.status === "failed" || run.status === "blocked") {
    return t("chat_window.vela_orchestrator.dispatch_failed", {
      defaultValue: "Vela could not complete this task.",
    });
  }
  return t("chat_window.vela_orchestrator.working", {
    defaultValue: "Vela is working on your request…",
  });
}

export default function OrchestratorRunCard({
  run,
  workspaceSlug,
  parentThreadSlug = null,
  onResume,
  resuming = false,
}) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const summary = useMemo(() => orchestratorRunSummary(run), [run]);
  const [workerLink, setWorkerLink] = useState(() =>
    workerThreadForRun(workspaceSlug, run?.run_id)
  );

  useEffect(() => {
    setWorkerLink(workerThreadForRun(workspaceSlug, run?.run_id));
    const onWorkerThread = (event) => {
      const detail = event.detail || {};
      if (detail.workspaceSlug !== workspaceSlug) return;
      if (detail.runId && detail.runId !== run?.run_id) return;
      if (detail.threadSlug) {
        setWorkerLink({
          threadSlug: detail.threadSlug,
          parentThreadSlug: detail.parentThreadSlug,
          runId: detail.runId,
          roleId: detail.roleId,
        });
        return;
      }
      setWorkerLink(workerThreadForRun(workspaceSlug, run?.run_id));
    };
    window.addEventListener(VELA_WORKER_THREAD_EVENT, onWorkerThread);
    return () => window.removeEventListener(VELA_WORKER_THREAD_EVENT, onWorkerThread);
  }, [workspaceSlug, run?.run_id]);

  if (!run || run.status === "needs_user_input") return null;

  const headline = statusHeadline(run, t);
  const isActive =
    run.status === "classifying" ||
    run.status === "queued" ||
    run.status === "running";

  return (
    <div className="mt-2 mb-3 ml-2 md:ml-6 border border-white/10 rounded-lg bg-white/5 light:bg-slate-50 light:border-slate-200 text-sm">
      <div className="px-3 py-2">
        <div className="flex items-start gap-2">
          <span
            className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${
              isActive ? "bg-primary-button animate-pulse" : "bg-green-500/80"
            }`}
          />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-white/90 light:text-slate-800">{headline}</p>
            {summary && (
              <p className="text-white/65 light:text-slate-600 mt-1 line-clamp-3">{summary}</p>
            )}
            {workerLink?.threadSlug && (
              <Link
                to={paths.workspace.thread(workspaceSlug, workerLink.threadSlug)}
                className="inline-flex items-center gap-1 mt-2 text-primary-button hover:underline text-xs font-medium"
              >
                <ArrowSquareOut className="w-3.5 h-3.5" />
                {t("chat_window.vela_orchestrator.open_worker_thread", {
                  defaultValue: "Open worker session",
                })}
              </Link>
            )}
          </div>
        </div>
        <button
          type="button"
          className="mt-2 flex items-center gap-1 text-xs text-white/45 light:text-slate-500 hover:text-white/70"
          onClick={() => setShowDetails((v) => !v)}
        >
          {showDetails ? (
            <CaretDown className="w-3 h-3" />
          ) : (
            <CaretRight className="w-3 h-3" />
          )}
          {t("chat_window.vela_orchestrator.technical_details", {
            defaultValue: "Technical details",
          })}
        </button>
      </div>

      {showDetails && (
        <div className="px-3 pb-3 border-t border-white/10 light:border-slate-200 text-xs text-white/55 light:text-slate-500 space-y-1">
          <p>
            {run.status} · {run.role_id || "—"}
            {run.model_id ? ` · ${formatOrchestratorModelLabel(run.model_id)}` : ""}
            {run.workflow_id ? ` · ${run.workflow_id}` : ""}
          </p>
          {run.routing_evidence?.reason && (
            <p className="whitespace-pre-wrap">{run.routing_evidence.reason}</p>
          )}
          {run.events?.slice(-4).map((ev) => (
            <p key={ev.id}>
              {ev.event_type}: {ev.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
