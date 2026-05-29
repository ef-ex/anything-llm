import { X, Database, ArrowLeft, ArrowSquareOut } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import ChatSidebar from "../ChatSidebar";
import { PROMPT_INPUT_EVENT } from "../PromptInput";
import { VelaEntitiesProvider, useVelaEntitiesContext } from "./VelaEntitiesContext";

export { useVelaEntitiesSidebar } from "../ChatSidebar";

export default function VelaEntitiesSidebar({ workspace, onWorkspaceUpdate }) {
  return (
    <VelaEntitiesProvider workspace={workspace} onWorkspaceUpdate={onWorkspaceUpdate}>
      <VelaEntitiesSidebarContent />
    </VelaEntitiesProvider>
  );
}

function VelaEntitiesSidebarContent() {
  const { sidebarOpen, velaAvailable } = useVelaEntitiesContext();

  return (
    <ChatSidebar isOpen={sidebarOpen}>
      <div
        className="ml-4 w-[366px] flex-shrink-0 flex flex-col gap-4 mt-[72px] px-5 pb-6 overflow-y-auto no-scroll bg-zinc-900 light:bg-white light:border-2 light:border-slate-300 md:rounded-[16px] relative z-20"
        style={{ maxHeight: "calc(100% - 88px)" }}
      >
        <SidebarHeader />
        {velaAvailable === false && <UnavailableBanner />}
        {velaAvailable !== false && <ProjectSwitcher />}
        {velaAvailable !== false && <EntityPanel />}
      </div>
    </ChatSidebar>
  );
}

function SidebarHeader() {
  const { t } = useTranslation();
  const { closeSidebar, selectedId, setSelectedId } = useVelaEntitiesContext();

  return (
    <div className="flex items-start justify-between shrink-0 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {selectedId && (
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="text-zinc-400 hover:text-white border-none bg-transparent cursor-pointer p-0"
          >
            <ArrowLeft size={16} weight="bold" />
          </button>
        )}
        <Database size={18} className="text-zinc-400 shrink-0" />
        <p className="font-medium text-base leading-6 text-zinc-50 light:text-slate-900 truncate">
          {t("chat_window.vela_entities.title")}
        </p>
      </div>
      <button
        onClick={closeSidebar}
        type="button"
        className="text-zinc-50 light:text-slate-900 hover:text-white light:hover:text-slate-400 transition-colors border-none bg-transparent cursor-pointer shrink-0"
      >
        <X size={16} weight="bold" />
      </button>
    </div>
  );
}

function UnavailableBanner() {
  const { t } = useTranslation();
  return (
    <p className="text-sm text-amber-400/90 light:text-amber-700">
      {t("chat_window.vela_entities.unavailable")}
    </p>
  );
}

function ProjectSwitcher() {
  const { t } = useTranslation();
  const {
    projects,
    boundProjectId,
    activeResolution,
    bindWorkspaceProject,
    setUserDefault,
    error,
  } = useVelaEntitiesContext();

  return (
    <div className="flex flex-col gap-2 shrink-0">
      <label className="text-xs text-zinc-400 light:text-slate-600 uppercase tracking-wide">
        {t("chat_window.vela_entities.project_label")}
      </label>
      <select
        value={boundProjectId || ""}
        onChange={(e) => bindWorkspaceProject(e.target.value || null)}
        className="w-full bg-zinc-800 light:bg-white border border-zinc-600 light:border-slate-300 rounded-lg px-3 py-2 text-sm text-white light:text-slate-900"
      >
        <option value="">{t("chat_window.vela_entities.no_project")}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {activeResolution?.project_id && (
        <p className="text-xs text-zinc-500 light:text-slate-500">
          {t("chat_window.vela_entities.resolved_via", {
            source: activeResolution.source,
          })}
        </p>
      )}
      {boundProjectId && (
        <button
          type="button"
          onClick={() => setUserDefault(boundProjectId)}
          className="text-xs text-zinc-400 hover:text-zinc-200 underline border-none bg-transparent cursor-pointer text-left p-0"
        >
          {t("chat_window.vela_entities.set_user_default")}
        </button>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function EntityPanel() {
  const { selectedId } = useVelaEntitiesContext();
  if (selectedId) return <EntityDetail />;
  return <EntityBrowser />;
}

function EntityBrowser() {
  const { t } = useTranslation();
  const {
    boundProjectId,
    typeFilter,
    setTypeFilter,
    search,
    setSearch,
    filteredEntities,
    setSelectedId,
    loading,
    entityTypes,
  } = useVelaEntitiesContext();

  if (!boundProjectId) {
    return (
      <p className="text-sm text-zinc-400 light:text-slate-600 text-center py-4">
        {t("chat_window.vela_entities.bind_project_hint")}
      </p>
    );
  }

  return (
    <>
      <div className="flex gap-2">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="flex-1 bg-zinc-800 light:bg-white border border-zinc-600 light:border-slate-300 rounded-lg px-2 py-1.5 text-sm text-white light:text-slate-900"
        >
          <option value="">{t("chat_window.vela_entities.all_types")}</option>
          {entityTypes
            .filter(Boolean)
            .map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
        </select>
      </div>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("chat_window.vela_entities.search_placeholder")}
        className="w-full bg-zinc-800 light:bg-white border border-zinc-600 light:border-slate-300 rounded-lg px-3 py-2 text-sm text-white light:text-slate-900 placeholder:text-zinc-500"
      />
      {loading ? (
        <p className="text-sm text-zinc-500">{t("chat_window.vela_entities.loading")}</p>
      ) : filteredEntities.length === 0 ? (
        <p className="text-sm text-zinc-400 text-center py-4">
          {t("chat_window.vela_entities.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {filteredEntities.map((entity) => (
            <li key={entity.id}>
              <button
                type="button"
                onClick={() => setSelectedId(entity.id)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-800 light:hover:bg-slate-100 border-none bg-transparent cursor-pointer"
              >
                <span className="text-xs text-zinc-500 uppercase">{entity.type}</span>
                <p className="text-sm text-zinc-100 light:text-slate-900 font-medium">
                  {entity.name}
                </p>
                {entity.description && (
                  <p className="text-xs text-zinc-500 truncate">{entity.description}</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EntityDetail() {
  const { t } = useTranslation();
  const ctx = useVelaEntitiesContext();
  const { entityDetail, entityFiles, fileVersions, referenceString } = ctx;

  if (!entityDetail) return null;

  const pinnedVersion = entityDetail.metadata?.pinned_version;
  const pinnedFileId = entityDetail.metadata?.pinned_file_ref_id;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="text-xs text-zinc-500 uppercase">{entityDetail.type}</span>
        <h3 className="text-lg font-medium text-zinc-50 light:text-slate-900">
          {entityDetail.name}
        </h3>
        <p className="text-xs text-zinc-500">{entityDetail.status}</p>
        {entityDetail.description && (
          <p className="text-sm text-zinc-400 mt-1">{entityDetail.description}</p>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <p className="text-xs text-zinc-400 uppercase">
          {t("chat_window.vela_entities.pinned_version")}
        </p>
        {pinnedVersion && (
          <p className="text-sm text-zinc-300">
            {t("chat_window.vela_entities.current_pin")}:{" "}
            <code className="text-xs">{pinnedVersion}</code>
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          {fileVersions.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => ctx.pinVersion(v)}
              className={`text-xs px-2 py-1 rounded border cursor-pointer ${
                pinnedVersion === v
                  ? "border-emerald-500 text-emerald-400"
                  : "border-zinc-600 text-zinc-400 hover:border-zinc-400"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        {entityFiles.length > 0 && (
          <ul className="flex flex-col gap-1 mt-1">
            {entityFiles.map((f) => (
              <li key={f.file_ref_id} className="text-xs">
                <button
                  type="button"
                  onClick={() => ctx.pinFile(f.file_ref_id)}
                  className={`text-left w-full truncate hover:underline border-none bg-transparent cursor-pointer p-0 ${
                    pinnedFileId === f.file_ref_id
                      ? "text-emerald-400"
                      : "text-zinc-400"
                  }`}
                >
                  {f.path} ({f.version || "—"})
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReferenceBuilder />
      <ContextPreviewSection />
      <PathPreviewSection />
      <PublishSection />

      <button
        type="button"
        onClick={() => insertReference(referenceString)}
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-white text-zinc-900 text-sm font-medium hover:bg-zinc-200 border-none cursor-pointer"
      >
        <ArrowSquareOut size={16} />
        {t("chat_window.vela_entities.insert_reference")}
      </button>
      <code className="text-xs text-zinc-500 break-all">{referenceString}</code>
    </div>
  );
}

function ReferenceBuilder() {
  const { t } = useTranslation();
  const {
    facetOptions,
    selectedFacets,
    toggleFacet,
    versionOptions,
    versionSelector,
    setVersionSelector,
    includeMedia,
    setIncludeMedia,
  } = useVelaEntitiesContext();

  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs text-zinc-400 uppercase">
        {t("chat_window.vela_entities.reference_builder")}
      </p>
      <div className="flex flex-wrap gap-1">
        {facetOptions.map((facet) => (
          <button
            key={facet}
            type="button"
            onClick={() => toggleFacet(facet)}
            className={`text-xs px-2 py-1 rounded border cursor-pointer ${
              selectedFacets.includes(facet)
                ? "border-white text-white"
                : "border-zinc-600 text-zinc-500"
            }`}
          >
            {facet}
          </button>
        ))}
      </div>
      <select
        value={versionSelector}
        onChange={(e) => setVersionSelector(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1.5 text-sm text-white"
      >
        <option value="">{t("chat_window.vela_entities.version_default")}</option>
        {versionOptions
          .filter(Boolean)
          .map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
      </select>
      <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
        <input
          type="checkbox"
          checked={includeMedia}
          onChange={(e) => setIncludeMedia(e.target.checked)}
          className="rounded"
        />
        {t("chat_window.vela_entities.include_media")}
      </label>
    </section>
  );
}

function ContextPreviewSection() {
  const { t } = useTranslation();
  const {
    loadContextPreview,
    contextPreviewText,
    previewLoading,
    contextPreview,
  } = useVelaEntitiesContext();

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400 uppercase">
          {t("chat_window.vela_entities.context_preview")}
        </p>
        <button
          type="button"
          onClick={loadContextPreview}
          disabled={previewLoading}
          className="text-xs text-zinc-300 hover:text-white underline border-none bg-transparent cursor-pointer disabled:opacity-50"
        >
          {previewLoading
            ? t("chat_window.vela_entities.loading")
            : t("chat_window.vela_entities.refresh_preview")}
        </button>
      </div>
      {contextPreview && (
        <pre className="text-xs text-zinc-400 bg-zinc-950 border border-zinc-700 rounded-lg p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">
          {contextPreviewText ||
            (contextPreview.no_active_project
              ? t("chat_window.vela_entities.no_active_project")
              : "")}
        </pre>
      )}
    </section>
  );
}

function PathPreviewSection() {
  const { t } = useTranslation();
  const {
    resolveTags,
    setResolveTags,
    loadPathPreview,
    pathPreview,
    pathLoading,
  } = useVelaEntitiesContext();

  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs text-zinc-400 uppercase">
        {t("chat_window.vela_entities.path_preview")}
      </p>
      <input
        value={resolveTags}
        onChange={(e) => setResolveTags(e.target.value)}
        placeholder="render, comp"
        className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-1.5 text-sm text-white"
      />
      <button
        type="button"
        onClick={loadPathPreview}
        disabled={pathLoading}
        className="text-xs text-left text-zinc-300 hover:text-white underline border-none bg-transparent cursor-pointer disabled:opacity-50"
      >
        {pathLoading
          ? t("chat_window.vela_entities.loading")
          : t("chat_window.vela_entities.run_path_resolve")}
      </button>
      {pathPreview && !pathPreview.error && (
        <pre className="text-xs text-zinc-400 bg-zinc-950 border border-zinc-700 rounded-lg p-3 whitespace-pre-wrap">
          {JSON.stringify(pathPreview, null, 2)}
        </pre>
      )}
      {pathPreview?.error && (
        <p className="text-xs text-red-400">{pathPreview.error}</p>
      )}
    </section>
  );
}

function PublishSection() {
  const { t } = useTranslation();
  const {
    publishRunId,
    setPublishRunId,
    runPublish,
    publishResult,
    publishLoading,
  } = useVelaEntitiesContext();

  return (
    <section className="flex flex-col gap-2 border-t border-zinc-700 pt-3">
      <p className="text-xs text-zinc-400 uppercase">
        {t("chat_window.vela_entities.publish_optional")}
      </p>
      <input
        value={publishRunId}
        onChange={(e) => setPublishRunId(e.target.value)}
        placeholder={t("chat_window.vela_entities.generation_run_id")}
        className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-1.5 text-sm text-white"
      />
      <button
        type="button"
        onClick={runPublish}
        disabled={publishLoading || !publishRunId.trim()}
        className="text-xs text-zinc-300 hover:text-white underline border-none bg-transparent cursor-pointer disabled:opacity-50 text-left"
      >
        {publishLoading
          ? t("chat_window.vela_entities.loading")
          : t("chat_window.vela_entities.run_publish")}
      </button>
      {publishResult && (
        <pre className="text-xs text-zinc-400 bg-zinc-950 border border-zinc-700 rounded-lg p-3 whitespace-pre-wrap max-h-32 overflow-y-auto">
          {JSON.stringify(publishResult, null, 2)}
        </pre>
      )}
    </section>
  );
}

function insertReference(reference) {
  const textarea = document.getElementById("primary-prompt-input");
  const suffix = `${reference} `;
  const needsSpace = textarea?.value && !textarea.value.endsWith(" ");
  window.dispatchEvent(
    new CustomEvent(PROMPT_INPUT_EVENT, {
      detail: {
        messageContent: needsSpace ? ` ${suffix}` : suffix,
        writeMode: textarea?.value ? "append" : "replace",
      },
    })
  );
  textarea?.focus();
}
