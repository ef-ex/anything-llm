import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useVelaEntitiesSidebar } from "../ChatSidebar";
import Vela, { buildEntityReference, formatContextCard } from "@/models/vela";
const ENTITY_TYPES = ["", "asset", "shot", "sequence"];
const FACET_OPTIONS = ["brief", "refs", "notes", "technical", "lineage"];
const VERSION_OPTIONS = ["", "pinned", "current", "latest", "wip"];

const VelaEntitiesContext = createContext(null);

export function useVelaEntitiesContext() {
  const ctx = useContext(VelaEntitiesContext);
  if (!ctx) {
    throw new Error("useVelaEntitiesContext must be used within VelaEntitiesProvider");
  }
  return ctx;
}

export function VelaEntitiesProvider({ workspace, onWorkspaceUpdate, children }) {
  const { sidebarOpen, closeSidebar } = useVelaEntitiesSidebar();
  const slug = workspace?.slug;

  const [velaAvailable, setVelaAvailable] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeResolution, setActiveResolution] = useState(null);
  const [boundProjectId, setBoundProjectId] = useState(workspace?.velaProjectId || null);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [entities, setEntities] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [entityDetail, setEntityDetail] = useState(null);
  const [entityFiles, setEntityFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedFacets, setSelectedFacets] = useState(["brief"]);
  const [versionSelector, setVersionSelector] = useState("");
  const [includeMedia, setIncludeMedia] = useState(false);
  const [contextPreview, setContextPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [resolveTags, setResolveTags] = useState("render");
  const [pathPreview, setPathPreview] = useState(null);
  const [pathLoading, setPathLoading] = useState(false);

  const [publishRunId, setPublishRunId] = useState("");
  const [publishResult, setPublishResult] = useState(null);
  const [publishLoading, setPublishLoading] = useState(false);

  useEffect(() => {
    setBoundProjectId(workspace?.velaProjectId || null);
  }, [workspace?.velaProjectId]);

  const refreshProjects = useCallback(async () => {
    if (!slug) return;
    try {
      const [status, projectList, active] = await Promise.all([
        Vela.status(slug),
        Vela.listProjects(slug),
        Vela.getActiveProject(slug),
      ]);
      setVelaAvailable(status.available);
      setProjects(projectList);
      setActiveResolution(active);
    } catch (e) {
      setVelaAvailable(false);
      setError(e.message);
    }
  }, [slug]);

  const refreshEntities = useCallback(async () => {
    if (!slug || !boundProjectId) {
      setEntities([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await Vela.listEntities(slug, typeFilter || null);
      setEntities(list);
    } catch (e) {
      setEntities([]);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [slug, boundProjectId, typeFilter]);

  const loadEntityDetail = useCallback(
    async (entityId) => {
      if (!slug || !entityId) return;
      setLoading(true);
      setError(null);
      try {
        const [entity, files] = await Promise.all([
          Vela.getEntity(slug, entityId),
          Vela.listEntityFiles(slug, entityId),
        ]);
        setEntityDetail(entity);
        setEntityFiles(files);
        const pinned = entity.metadata?.pinned_version;
        if (pinned) setVersionSelector("");
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    if (!sidebarOpen) return;
    refreshProjects();
  }, [sidebarOpen, refreshProjects]);

  useEffect(() => {
    if (!sidebarOpen) return;
    refreshEntities();
  }, [sidebarOpen, refreshEntities]);

  useEffect(() => {
    if (selectedId) loadEntityDetail(selectedId);
    else {
      setEntityDetail(null);
      setEntityFiles([]);
      setContextPreview(null);
      setPathPreview(null);
    }
  }, [selectedId, loadEntityDetail]);

  const filteredEntities = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entities;
    return entities.filter(
      (e) =>
        e.name?.toLowerCase().includes(q) ||
        e.type?.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q)
    );
  }, [entities, search]);

  const referenceString = useMemo(() => {
    if (!entityDetail) return "";
    return buildEntityReference(entityDetail, {
      version: versionSelector || undefined,
      facets: selectedFacets.length ? selectedFacets : ["brief"],
    });
  }, [entityDetail, versionSelector, selectedFacets]);

  const fileVersions = useMemo(() => {
    const versions = new Set();
    for (const f of entityFiles) {
      if (f.version) versions.add(f.version);
    }
    return Array.from(versions).sort();
  }, [entityFiles]);

  async function bindWorkspaceProject(projectId) {
    if (!slug) return;
    setError(null);
    try {
      const { workspace: updated } = await Vela.setWorkspaceProject(slug, projectId);
      setBoundProjectId(projectId);
      onWorkspaceUpdate?.(updated);
      await refreshProjects();
      await refreshEntities();
      setSelectedId(null);
    } catch (e) {
      setError(e.message);
    }
  }

  async function setUserDefault(projectId) {
    if (!slug) return;
    try {
      await Vela.setUserDefaultProject(slug, projectId);
      await refreshProjects();
    } catch (e) {
      setError(e.message);
    }
  }

  async function pinVersion(version) {
    if (!slug || !selectedId) return;
    try {
      const updated = await Vela.pinEntity(slug, selectedId, { version });
      setEntityDetail(updated);
      await loadEntityDetail(selectedId);
    } catch (e) {
      setError(e.message);
    }
  }

  async function pinFile(fileRefId) {
    if (!slug || !selectedId) return;
    try {
      const updated = await Vela.pinEntity(slug, selectedId, { file_ref_id: fileRefId });
      setEntityDetail(updated);
      await loadEntityDetail(selectedId);
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadContextPreview() {
    if (!slug || !referenceString) return;
    setPreviewLoading(true);
    setContextPreview(null);
    try {
      const result = await Vela.resolveReferences(slug, {
        references: [referenceString],
        include_media: includeMedia,
      });
      setContextPreview(result);
    } catch (e) {
      setContextPreview({ cards: [{ reference: referenceString, resolved: false, error: e.message, summary: "" }] });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function loadPathPreview() {
    if (!slug || !entityDetail) return;
    setPathLoading(true);
    setPathPreview(null);
    try {
      const tags = resolveTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const result = await Vela.resolveFilePath(slug, {
        tags,
        entity_name: entityDetail.name,
        version: versionSelector || entityDetail.metadata?.pinned_version || null,
      });
      setPathPreview(result);
    } catch (e) {
      setPathPreview({ error: e.message });
    } finally {
      setPathLoading(false);
    }
  }

  async function runPublish() {
    if (!slug || !publishRunId.trim()) return;
    setPublishLoading(true);
    setPublishResult(null);
    try {
      const result = await Vela.publish(slug, {
        generation_run_id: publishRunId.trim(),
        entity: entityDetail
          ? { type: entityDetail.type, name: entityDetail.name, id: entityDetail.id }
          : null,
      });
      setPublishResult(result);
    } catch (e) {
      setPublishResult({ ok: false, errors: [{ message: e.message }] });
    } finally {
      setPublishLoading(false);
    }
  }

  function toggleFacet(facet) {
    setSelectedFacets((prev) => {
      if (prev.includes(facet)) {
        const next = prev.filter((f) => f !== facet);
        return next.length ? next : ["brief"];
      }
      return [...prev, facet];
    });
  }

  const contextPreviewText = useMemo(() => {
    if (!contextPreview?.cards?.length) return "";
    return contextPreview.cards.map(formatContextCard).join("\n\n---\n\n");
  }, [contextPreview]);

  const value = {
    sidebarOpen,
    closeSidebar,
    velaAvailable,
    projects,
    activeResolution,
    boundProjectId,
    typeFilter,
    setTypeFilter,
    search,
    setSearch,
    filteredEntities,
    selectedId,
    setSelectedId,
    entityDetail,
    entityFiles,
    fileVersions,
    loading,
    error,
    entityTypes: ENTITY_TYPES,
    facetOptions: FACET_OPTIONS,
    versionOptions: VERSION_OPTIONS,
    selectedFacets,
    toggleFacet,
    versionSelector,
    setVersionSelector,
    includeMedia,
    setIncludeMedia,
    referenceString,
    loadContextPreview,
    contextPreview,
    contextPreviewText,
    previewLoading,
    resolveTags,
    setResolveTags,
    loadPathPreview,
    pathPreview,
    pathLoading,
    bindWorkspaceProject,
    setUserDefault,
    pinVersion,
    pinFile,
    publishRunId,
    setPublishRunId,
    runPublish,
    publishResult,
    publishLoading,
  };

  return (
    <VelaEntitiesContext.Provider value={value}>{children}</VelaEntitiesContext.Provider>
  );
}
