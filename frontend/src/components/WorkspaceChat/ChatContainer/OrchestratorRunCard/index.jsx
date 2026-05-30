import { useMemo, useState } from "react";
import {
  CaretDown,
  CaretRight,
  Clock,
  WarningCircle,
  CheckCircle,
  Question,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

function formatElapsed(run) {
  if (!run?.created_at) return "";
  const start = Date.parse(run.created_at);
  const end = run.completed_at ? Date.parse(run.completed_at) : Date.now();
  if (Number.isNaN(start)) return "";
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function statusIcon(status) {
  if (status === "completed") return <CheckCircle className="w-4 h-4 text-green-400" />;
  if (status === "needs_user_input") return <Question className="w-4 h-4 text-amber-400" />;
  if (status === "failed" || status === "blocked") {
    return <WarningCircle className="w-4 h-4 text-orange-400" />;
  }
  return <Clock className="w-4 h-4 text-white/50 animate-pulse" />;
}

export default function OrchestratorRunCard({
  run,
  onResume,
  resuming = false,
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(
    run.status === "needs_user_input" || run.status === "failed" || run.status === "blocked"
  );
  const [answer, setAnswer] = useState("");

  const summary = useMemo(() => {
    if (run.status === "completed" && run.output_text) {
      const text = run.output_text.trim();
      return text.length > 160 ? `${text.slice(0, 160)}…` : text;
    }
    return run.status_message || run.selection_reason || run.status;
  }, [run]);

  const routing = run.routing_evidence || {};
  const roleLabel =
    run.role_id ||
    routing.role_id ||
    run.workflow_id ||
    routing.workflow_id ||
    t("chat_window.vela_orchestrator.no_role");
  const routeConfidence =
    typeof routing.confidence === "number" ? routing.confidence : null;
  const routeReason = routing.reason || run.selection_reason || "";
  const clarificationQuestion =
    routing.clarification_question || run.pending_user_input?.question;

  return (
    <div className="mt-2 mb-3 ml-2 md:ml-6 border border-white/10 rounded-lg bg-white/5 light:bg-slate-50 light:border-slate-200 text-sm">
      <button
        type="button"
        className="w-full flex items-start gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <CaretDown className="w-4 h-4 mt-0.5 shrink-0" />
        ) : (
          <CaretRight className="w-4 h-4 mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {statusIcon(run.status)}
            <span className="font-medium text-white/90 light:text-slate-800">
              {t(`chat_window.vela_orchestrator.status_${run.status}`, {
                defaultValue: run.status,
              })}
            </span>
            <span className="text-white/50 light:text-slate-500">· {roleLabel}</span>
            {run.workflow_id && run.role_id && (
              <span className="text-white/40 light:text-slate-400">
                · {t("chat_window.vela_orchestrator.workflow")}: {run.workflow_id}
              </span>
            )}
            {routeConfidence != null && (
              <span className="text-white/40 light:text-slate-400">
                · {t("chat_window.vela_orchestrator.confidence")}:{" "}
                {Math.round(routeConfidence * 100)}%
              </span>
            )}
            <span className="text-white/40 light:text-slate-400">{formatElapsed(run)}</span>
          </div>
          <p className="text-white/70 light:text-slate-600 mt-1 line-clamp-2">{summary}</p>
        </div>
      </button>

      {run.status === "needs_user_input" && (run.pending_user_input || clarificationQuestion) && (
        <div className="px-3 pb-3 border-t border-white/10 light:border-slate-200">
          <p className="text-amber-200/90 light:text-amber-800 mt-2 text-sm">
            {clarificationQuestion || run.pending_user_input?.question}
          </p>
          <div className="flex gap-2 mt-2">
            <input
              className="flex-1 rounded-md bg-zinc-800 light:bg-white border border-white/10 light:border-slate-300 px-2 py-1 text-white light:text-slate-900"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={t("chat_window.vela_orchestrator.answer_placeholder")}
              disabled={resuming}
            />
            <button
              type="button"
              disabled={resuming || !answer.trim()}
              className="rounded-md bg-primary-button px-3 py-1 text-white disabled:opacity-50"
              onClick={() => onResume?.(run, answer.trim())}
            >
              {t("chat_window.vela_orchestrator.resume")}
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-3 border-t border-white/10 light:border-slate-200 text-white/70 light:text-slate-600 space-y-2">
          {(run.provider_id || run.model_id) && (
            <p>
              <span className="text-white/50 light:text-slate-400">
                {t("chat_window.vela_orchestrator.provider")}:{" "}
              </span>
              {[run.provider_id, run.model_id].filter(Boolean).join(" / ")}
            </p>
          )}
          {(routeReason || run.selection_reason) && (
            <p>
              <span className="text-white/50 light:text-slate-400">
                {t("chat_window.vela_orchestrator.route_reason")}:{" "}
              </span>
              {routeReason || run.selection_reason}
            </p>
          )}
          {run.role_id && (
            <p>
              <span className="text-white/50 light:text-slate-400">
                {t("chat_window.vela_orchestrator.selected_role")}:{" "}
              </span>
              {run.role_id}
            </p>
          )}
          {(run.workflow_id || routing.workflow_id) && (
            <p>
              <span className="text-white/50 light:text-slate-400">
                {t("chat_window.vela_orchestrator.selected_workflow")}:{" "}
              </span>
              {run.workflow_id || routing.workflow_id}
            </p>
          )}
          {run.clarification_history?.length > 0 && (
            <div>
              <p className="text-white/50 light:text-slate-400 mb-1">
                {t("chat_window.vela_orchestrator.clarifications")}
              </p>
              <ul className="list-disc ml-4 space-y-1">
                {run.clarification_history.map((turn, idx) => (
                  <li key={`${turn.answered_at}-${idx}`}>
                    <span className="block text-white/60 light:text-slate-500">{turn.question}</span>
                    <span>{turn.answer}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {run.steps?.length > 0 && (
            <div>
              <p className="text-white/50 light:text-slate-400 mb-1">
                {t("chat_window.vela_orchestrator.steps")}
              </p>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {run.steps.map((step) => (
                  <li
                    key={step.id}
                    className={`text-xs border-l-2 pl-2 ${
                      step.step_type === "provider_chat"
                        ? "border-primary-button/60"
                        : "border-white/10"
                    }`}
                  >
                    <span className="text-white/40 light:text-slate-400">
                      {step.step_key}
                      {step.step_type === "provider_chat"
                        ? ` (${t("chat_window.vela_orchestrator.provider_chat")})`
                        : ""}{" "}
                      — {step.status}
                    </span>
                    {step.log_lines?.length > 0 && (
                      <span className="block">{step.log_lines[step.log_lines.length - 1]}</span>
                    )}
                    {step.artifact_refs?.length > 0 && (
                      <span className="block text-white/50">
                        {t("chat_window.vela_orchestrator.artifacts")}:{" "}
                        {step.artifact_refs.join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {run.child_runs?.length > 0 && (
            <div>
              <p className="text-white/50 light:text-slate-400 mb-1">
                {t("chat_window.vela_orchestrator.child_workers")}
              </p>
              <ul className="space-y-1">
                {run.child_runs.map((child) => (
                  <li key={child.run_id} className="text-xs">
                    {child.workflow_id || child.role_id}: {child.status}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {run.events?.length > 0 && (
            <div>
              <p className="text-white/50 light:text-slate-400 mb-1">
                {t("chat_window.vela_orchestrator.events")}
              </p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {run.events.map((ev) => (
                  <li key={ev.id} className="text-xs">
                    <span className="text-white/40 light:text-slate-400">{ev.event_type}</span>
                    {": "}
                    {ev.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {run.error_message && (
            <p className="text-orange-300 light:text-orange-700">{run.error_message}</p>
          )}
          {run.output_artifact_refs?.length > 0 && (
            <p>
              {t("chat_window.vela_orchestrator.artifacts")}: {run.output_artifact_refs.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
