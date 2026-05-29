import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import Vela from "@/models/vela";
import Workspace from "@/models/workspace";

export default function VelaRolePresetRow({ workspaceSlug = null, onClose }) {
  const { t } = useTranslation();
  const { slug: routeSlug } = useParams();
  const slug = workspaceSlug || routeSlug;

  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState("loading");
  const [presets, setPresets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadingRoleId, setLoadingRoleId] = useState(null);
  const [error, setError] = useState(null);
  const [routeSummary, setRouteSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!slug) {
        setStatus("no_workspace");
        return;
      }

      setStatus("loading");
      setError(null);

      try {
        const [velaStatus, workspace] = await Promise.all([
          Vela.status(slug),
          Workspace.bySlug(slug),
        ]);
        if (cancelled) return;

        setSelectedId(workspace?.velaRolePresetId || "");

        if (!velaStatus.configured) {
          setStatus("not_configured");
          return;
        }
        if (!velaStatus.available) {
          setStatus("unavailable");
          return;
        }

        const list = await Vela.listRolePresets(slug);
        if (cancelled) return;
        setPresets(Array.isArray(list) ? list : []);
        setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(e.message);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;

    async function loadRoute() {
      if (!slug || !selectedId || status !== "ready") {
        setRouteSummary(null);
        return;
      }
      try {
        const route = await Vela.resolveRolePreset(slug, selectedId);
        if (!cancelled) setRouteSummary(route);
      } catch {
        if (!cancelled) setRouteSummary(null);
      }
    }

    loadRoute();
    return () => {
      cancelled = true;
    };
  }, [slug, selectedId, status]);

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedId) || null,
    [presets, selectedId]
  );

  function toggleExpanded() {
    setExpanded((open) => !open);
  }

  async function handleSelectRole(roleId) {
    if (!slug || !roleId) return;
    setLoadingRoleId(roleId);
    setError(null);
    try {
      const route = await Vela.applyRolePreset(slug, roleId);
      setSelectedId(roleId);
      setRouteSummary(route);
      setExpanded(false);
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingRoleId(null);
    }
  }

  const subtitle = selectedPreset
    ? selectedPreset.display_name
    : t("chat_window.vela_role_presets.none");

  return (
    <div className="flex flex-col gap-1 border-t border-zinc-700 light:border-slate-300 pt-2">
      <button
        type="button"
        onClick={toggleExpanded}
        disabled={status !== "ready" || presets.length === 0}
        className="flex items-center justify-between w-full px-2 py-1 rounded cursor-pointer hover:bg-zinc-700 light:hover:bg-slate-200 border-none bg-transparent text-left disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-normal text-white light:text-slate-800">
            {t("chat_window.vela_role_presets.title")}
          </span>
          <span className="text-[11px] text-zinc-400 light:text-slate-500 truncate">
            {subtitle}
          </span>
        </div>
        {status === "ready" && presets.length > 0 && (
          expanded ? (
            <CaretUp size={14} className="shrink-0 text-zinc-400" />
          ) : (
            <CaretDown size={14} className="shrink-0 text-zinc-400" />
          )
        )}
      </button>

      {status === "loading" && (
        <p className="px-2 text-[11px] text-zinc-400 light:text-slate-500">
          {t("chat_window.vela_role_presets.loading")}
        </p>
      )}

      {status === "no_workspace" && (
        <p className="px-2 text-[11px] text-zinc-400 light:text-slate-500">
          {t("chat_window.vela_role_presets.no_workspace")}
        </p>
      )}

      {status === "not_configured" && (
        <p className="px-2 text-[11px] text-zinc-400 light:text-slate-500">
          {t("chat_window.vela_role_presets.not_configured")}
        </p>
      )}

      {status === "unavailable" && (
        <p className="px-2 text-[11px] text-zinc-400 light:text-slate-500">
          {t("chat_window.vela_role_presets.unavailable")}
        </p>
      )}

      {status === "error" && (
        <p className="px-2 text-[11px] text-red-400 light:text-red-600">
          {error || t("chat_window.vela_role_presets.error")}
        </p>
      )}

      {expanded && status === "ready" && (
        <div className="flex flex-col gap-0.5 px-1 pb-1 max-h-48 overflow-y-auto">
          {presets.map((preset) => {
            const active = preset.id === selectedId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectRole(preset.id)}
                disabled={loadingRoleId !== null}
                className={`flex flex-col items-start w-full px-2 py-1.5 rounded border-none cursor-pointer text-left ${
                  active
                    ? "bg-zinc-700 light:bg-slate-200"
                    : "bg-transparent hover:bg-zinc-700 light:hover:bg-slate-200"
                }`}
              >
                <span className="text-sm text-white light:text-slate-800">
                  {preset.display_name}
                  {loadingRoleId === preset.id ? " …" : ""}
                </span>
                {preset.description && (
                  <span className="text-[11px] text-zinc-400 light:text-slate-500 leading-snug">
                    {preset.description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {routeSummary && status === "ready" && (
        <p className="px-2 text-[11px] text-zinc-400 light:text-slate-500 leading-snug">
          {t("chat_window.vela_role_presets.route_summary", {
            model: routeSummary.model_display_name,
            depth: routeSummary.context_depth,
          })}
        </p>
      )}

      {error && status === "ready" && (
        <p className="px-2 text-[11px] text-red-400 light:text-red-600">{error}</p>
      )}
    </div>
  );
}
