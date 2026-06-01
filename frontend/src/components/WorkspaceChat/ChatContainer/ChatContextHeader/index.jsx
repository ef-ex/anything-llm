import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { isMobile } from "react-device-detect";
import useUser from "@/hooks/useUser";
import System from "@/models/system";
import Vela from "@/models/vela";
import { SIDEBAR_TOGGLE_EVENT } from "@/components/Sidebar/SidebarToggle";
import { SAVE_LLM_SELECTOR_EVENT } from "../PromptInput/LLMSelector/action";
import WorkspaceModelPicker from "../WorkspaceModelPicker";
import {
  effectiveRoleIdForThread,
  roleDisplayName,
} from "@/utils/orchestratorRuns";
import { CHAT_LAYOUT_SINGLE, CHAT_LAYOUT_SPLIT } from "@/utils/splitChatLayout";

const previewCache = new Map();

async function resolveModelLabel(workspace, t) {
  if (workspace?.chatProvider === "vela-dispatch" && workspace?.chatModel) {
    return workspace.chatModel;
  }
  const systemSettings = await System.keys();
  const effectiveProvider =
    workspace?.chatProvider ?? systemSettings?.LLMProvider;
  if (effectiveProvider !== "anythingllm-router") {
    return workspace?.chatModel ?? systemSettings?.LLMModel ?? "";
  }
  return t("model-router.metrics.model-router-default");
}

function Section({ title, children, empty }) {
  if (empty) return null;
  return (
    <div className="border-b border-theme-modal-border last:border-b-0 px-4 py-3">
      <h4 className="text-xs font-semibold text-theme-text-secondary uppercase tracking-wide mb-2">
        {title}
      </h4>
      {children}
    </div>
  );
}

function InstructionsBlock({ text, t }) {
  const [expanded, setExpanded] = useState(false);
  if (!text?.trim()) return null;
  const lines = text.trim().split("\n");
  const truncated = lines.length > 12 && !expanded;
  const shown = truncated ? lines.slice(0, 12).join("\n") : text.trim();

  return (
    <div className="text-sm text-white whitespace-pre-wrap">
      {shown}
      {truncated && (
        <button
          type="button"
          className="block mt-2 text-xs text-primary-button hover:underline"
          onClick={() => setExpanded(true)}
        >
          {t("vela.chat_context.show_more")}
        </button>
      )}
    </div>
  );
}

export default function ChatContextHeader({
  workspace = null,
  threadSlug = null,
  layoutMode = CHAT_LAYOUT_SINGLE,
  onLayoutModeChange = null,
  showLayoutToggle = false,
}) {
  const { t } = useTranslation();
  const { user } = useUser();
  const { slug: urlSlug } = useParams();
  const slug = urlSlug ?? workspace?.slug;
  const [modelName, setModelName] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [contentOpen, setContentOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => window.localStorage.getItem("anythingllm_sidebar_toggle") !== "closed"
  );
  const panelRef = useRef(null);

  const velaBound = !!workspace?.velaProjectId;
  const effectiveRoleId = useMemo(
    () =>
      velaBound
        ? effectiveRoleIdForThread(workspace, workspace.slug, threadSlug)
        : null,
    [velaBound, workspace, threadSlug]
  );

  const refreshModelName = useCallback(async () => {
    if (!slug || !workspace) return;
    setModelName(await resolveModelLabel(workspace, t));
  }, [slug, workspace, t]);

  useEffect(() => {
    refreshModelName();
  }, [refreshModelName]);

  useEffect(() => {
    function handleToggle(e) {
      setSidebarOpen(e.detail.open);
    }
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(SIDEBAR_TOGGLE_EVENT, handleToggle);
  }, []);

  useEffect(() => {
    function handleSave() {
      refreshModelName();
    }
    window.addEventListener(SAVE_LLM_SELECTOR_EVENT, handleSave);
    return () =>
      window.removeEventListener(SAVE_LLM_SELECTOR_EVENT, handleSave);
  }, [refreshModelName]);

  useEffect(() => {
    setContentOpen(false);
  }, [threadSlug, effectiveRoleId]);

  useEffect(() => {
    if (!velaBound || !effectiveRoleId) {
      setRoleLabel("");
      return;
    }
    let cancelled = false;
    (async () => {
      const cacheKey = `${workspace.slug}:${effectiveRoleId}`;
      const cached = previewCache.get(cacheKey);
      if (cached?.display_name) {
        setRoleLabel(cached.display_name);
        return;
      }
      try {
        const presets = await Vela.listRolePresets(workspace.slug);
        const list = Array.isArray(presets) ? presets : presets?.presets || [];
        const match = list.find((p) => p.id === effectiveRoleId);
        if (!cancelled) {
          setRoleLabel(match?.display_name || roleDisplayName(effectiveRoleId));
        }
      } catch {
        if (!cancelled) setRoleLabel(roleDisplayName(effectiveRoleId));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [velaBound, workspace?.slug, effectiveRoleId]);

  useEffect(() => {
    if (
      !contentOpen ||
      !velaBound ||
      !effectiveRoleId ||
      !workspace?.velaProjectId
    ) {
      return;
    }
    const cacheKey = `${workspace.slug}:${effectiveRoleId}:${workspace.velaProjectId}`;
    const cached = previewCache.get(cacheKey);
    if (cached) {
      setPreview(cached);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    Vela.getRoleArtistPreview(workspace.slug, effectiveRoleId, {
      projectId: workspace.velaProjectId,
    })
      .then((data) => {
        if (cancelled) return;
        previewCache.set(cacheKey, data);
        if (data?.display_name) setRoleLabel(data.display_name);
        setPreview(data);
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err.message || "Preview unavailable");
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    contentOpen,
    velaBound,
    effectiveRoleId,
    workspace?.slug,
    workspace?.velaProjectId,
  ]);

  useEffect(() => {
    if (!contentOpen) return;
    function onDocClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setContentOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [contentOpen]);

  if (!velaBound) {
    if (!!user && user.role !== "admin") return null;
    return <WorkspaceModelPicker workspaceSlug={slug} />;
  }

  const positionClass = isMobile
    ? "relative w-full px-3 py-2 border-b border-theme-modal-border flex flex-wrap items-center gap-2"
    : `hidden md:flex absolute top-2 z-30 transition-all duration-500 items-center gap-1.5 max-w-[calc(100%-2rem)] ${
        sidebarOpen ? "left-3" : "left-11"
      }`;

  return (
    <div className={positionClass} ref={panelRef}>
      <span className="text-xs text-zinc-400 light:text-slate-500 truncate max-w-[140px]">
        {modelName || t("chat_window.select_model")}
      </span>
      <span className="text-xs text-zinc-600 light:text-slate-400">·</span>
      <span className="text-xs text-zinc-300 light:text-slate-700 truncate max-w-[200px]">
        {t("vela.chat_context.role")}: {roleLabel || "…"}
      </span>
      <button
        type="button"
        aria-expanded={contentOpen}
        className="flex items-center gap-0.5 text-xs text-primary-button hover:underline px-1"
        onClick={() => setContentOpen((o) => !o)}
      >
        {t("vela.chat_context.content")}
        {contentOpen ? <CaretUp size={12} /> : <CaretDown size={12} />}
      </button>

      {showLayoutToggle && onLayoutModeChange && (
        <div className="flex items-center gap-0.5 ml-1 border border-theme-modal-border rounded-full overflow-hidden text-[11px]">
          <button
            type="button"
            className={`px-2 py-0.5 ${
              layoutMode === CHAT_LAYOUT_SINGLE
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
            onClick={() => onLayoutModeChange(CHAT_LAYOUT_SINGLE)}
          >
            {t("vela.chat_layout.single")}
          </button>
          <button
            type="button"
            className={`px-2 py-0.5 ${
              layoutMode === CHAT_LAYOUT_SPLIT
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
            onClick={() => onLayoutModeChange(CHAT_LAYOUT_SPLIT)}
          >
            {t("vela.chat_layout.split")}
          </button>
        </div>
      )}

      {contentOpen && (
        <div
          className={`absolute ${
            isMobile ? "left-0 right-0 top-full" : "left-0 top-full mt-1"
          } z-40 w-full md:w-[min(520px,calc(100vw-3rem))] max-h-[min(70vh,480px)] overflow-y-auto bg-zinc-800 light:bg-white border border-zinc-700 light:border-slate-300 rounded-xl shadow-lg`}
        >
          {previewLoading && (
            <p className="p-4 text-sm text-theme-text-secondary">
              {t("vela.chat_context.loading")}
            </p>
          )}
          {!previewLoading && previewError && (
            <p className="p-4 text-sm text-theme-text-secondary">
              {previewError}
            </p>
          )}
          {!previewLoading && preview && (
            <>
              <Section
                title={t("vela.chat_context.summary")}
                empty={!preview.routing_description}
              >
                <p className="text-sm text-white whitespace-pre-wrap">
                  {preview.routing_description || preview.description}
                </p>
              </Section>
              <Section
                title={t("vela.chat_context.worker_instructions")}
                empty={!preview.worker_instructions}
              >
                <InstructionsBlock text={preview.worker_instructions} t={t} />
              </Section>
              {(preview.rule_sets || []).map((rs) => (
                <Section
                  key={rs.id}
                  title={`${t("vela.chat_context.rules")}: ${rs.name}`}
                  empty={!rs.rules?.length}
                >
                  <ul className="text-sm text-white space-y-1 list-disc pl-4">
                    {(rs.rules || []).map((rule, idx) => (
                      <li key={`${rs.id}-${idx}`}>
                        <span className="font-medium">{rule.name}:</span>{" "}
                        {rule.content}
                      </li>
                    ))}
                  </ul>
                </Section>
              ))}
              <Section
                title={t("vela.chat_context.skills")}
                empty={!preview.skills?.length}
              >
                <ul className="text-sm text-white space-y-1">
                  {(preview.skills || []).map((s) => (
                    <li key={s.id}>
                      <span className="font-medium">{s.display_name}</span>
                      {s.description ? ` — ${s.description}` : ""}
                    </li>
                  ))}
                </ul>
              </Section>
              <Section
                title={t("vela.chat_context.mcp_servers")}
                empty={!preview.mcp_servers?.length}
              >
                <ul className="text-sm text-white space-y-1">
                  {(preview.mcp_servers || []).map((m) => (
                    <li key={m.id}>{m.display_name}</li>
                  ))}
                </ul>
              </Section>
              <Section
                title={t("vela.chat_context.model_route")}
                empty={!preview.model_route?.model_id}
              >
                <p className="text-sm text-white">
                  {preview.model_route?.provider_display_name ||
                    preview.model_route?.provider_id}
                  {" · "}
                  {preview.model_route?.model_display_name ||
                    preview.model_route?.model_id}
                </p>
              </Section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
