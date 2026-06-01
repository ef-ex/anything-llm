import React, { useEffect, useMemo, useRef, useState } from "react";
import { CircleNotch, X } from "@phosphor-icons/react";
import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import { useTranslation } from "react-i18next";
import ModalWrapper from "@/components/ModalWrapper";
import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const noop = () => false;

async function fetchLinkableProjects() {
  const resp = await fetch(`${API_BASE}/vela/projects/linkable`, {
    headers: baseHeaders(),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      projects: [],
      error: data.error || data.message || `HTTP ${resp.status}`,
      velaConfigured: resp.status !== 503,
    };
  }
  return { projects: data.projects || [], error: null, velaConfigured: true };
}

export default function NewWorkspaceModal({ hideModal = noop }) {
  const formEl = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [velaConfigured, setVelaConfigured] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await fetchLinkableProjects();
      if (cancelled) return;
      setProjects(result.projects);
      setVelaConfigured(result.velaConfigured);
      if (result.error) setError(result.error);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const hay = `${p.name || ""} ${p.id || ""} ${p.root_path || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [projects, filter]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);

    if (velaConfigured) {
      if (!selectedId) {
        setError("Select a Vela project.");
        return;
      }
      const picked = projects.find((p) => p.id === selectedId);
      if (picked?.has_workspace) {
        setError("That project already has a chat workspace.");
        return;
      }
      setCreating(true);
      const { workspace, message } = await Workspace.new({
        velaProjectId: selectedId,
      });
      setCreating(false);
      if (workspace) {
        const { thread, error: threadError } = await Workspace.threads.new(
          workspace.slug
        );
        if (thread) {
          window.location.href = paths.workspace.thread(
            workspace.slug,
            thread.slug
          );
          return;
        }
        setError(threadError || "Workspace created but thread failed.");
        return;
      }
      setError(message);
      return;
    }

    const data = {};
    const form = new FormData(formEl.current);
    for (const [key, value] of form.entries()) data[key] = value;
    setCreating(true);
    const { workspace, message } = await Workspace.new(data);
    setCreating(false);
    if (workspace) {
      window.location.href = paths.workspace.chat(workspace.slug);
      return;
    }
    setError(message);
  };

  return (
    <ModalWrapper isOpen={true}>
      <div className="w-full max-w-2xl bg-theme-bg-secondary rounded-lg shadow border-2 border-theme-modal-border overflow-hidden">
        <div className="relative p-6 border-b rounded-t border-theme-modal-border">
          <div className="w-full flex gap-x-2 items-center">
            <h3 className="text-xl font-semibold text-white overflow-hidden overflow-ellipsis whitespace-nowrap">
              {velaConfigured ? "Open Vela project in chat" : t("new-workspace.title")}
            </h3>
          </div>
          <button
            onClick={hideModal}
            type="button"
            className="absolute top-4 right-4 transition-all duration-300 bg-transparent rounded-lg text-sm p-1 inline-flex items-center hover:bg-theme-modal-border hover:border-theme-modal-border hover:border-opacity-50 border-transparent border"
          >
            <X size={24} weight="bold" className="text-white" />
          </button>
        </div>
        <div
          className="h-full w-full overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 200px)" }}
        >
          <form ref={formEl} onSubmit={handleCreate}>
            <div className="py-7 px-9 space-y-4 flex-col">
              {velaConfigured ? (
                <>
                  <p className="text-sm text-theme-text-secondary">
                    Each Vela project can have one chat workspace. Create projects
                    in Vela Hub, then open them here.
                  </p>
                  <div>
                    <label
                      htmlFor="project-filter"
                      className="block mb-2 text-sm font-medium text-white"
                    >
                      Filter projects
                    </label>
                    <input
                      id="project-filter"
                      type="text"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="border-none bg-theme-settings-input-bg w-full text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                      placeholder="Search by name or path…"
                      autoComplete="off"
                      autoFocus={true}
                    />
                  </div>
                  {loading ? (
                    <div className="flex items-center gap-2 text-sm text-white">
                      <CircleNotch className="animate-spin" size={18} />
                      Loading projects…
                    </div>
                  ) : (
                    <div
                      className="border border-theme-modal-border rounded-lg max-h-[280px] overflow-y-auto"
                      role="listbox"
                      aria-label="Vela projects"
                    >
                      {filtered.length === 0 ? (
                        <p className="p-4 text-sm text-theme-text-secondary">
                          {projects.length === 0
                            ? "No active projects in Vela Hub. Create one on port 7001 first."
                            : "No projects match your filter."}
                        </p>
                      ) : (
                        filtered.map((project) => {
                          const disabled = !!project.has_workspace;
                          const selected = selectedId === project.id;
                          return (
                            <button
                              key={project.id}
                              type="button"
                              disabled={disabled}
                              onClick={() => setSelectedId(project.id)}
                              className={`w-full text-left px-4 py-3 border-b border-theme-modal-border last:border-b-0 ${
                                disabled
                                  ? "opacity-50 cursor-not-allowed"
                                  : "hover:bg-theme-sidebar-subitem-hover cursor-pointer"
                              } ${selected ? "bg-[var(--theme-sidebar-thread-selected)]" : ""}`}
                            >
                              <p className="text-sm font-medium text-white">
                                {project.name}
                              </p>
                              <p className="text-xs text-theme-text-secondary truncate">
                                {project.root_path || project.id}
                                {disabled ? " · already in chat" : ""}
                              </p>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full flex flex-col gap-y-4">
                  <p className="text-sm text-theme-text-secondary">
                    Vela Hub is not configured. Enter a workspace name (legacy mode).
                  </p>
                  <div>
                    <label
                      htmlFor="name"
                      className="block mb-2 text-sm font-medium text-white"
                    >
                      {t("common.workspaces-name")}
                    </label>
                    <input
                      name="name"
                      type="text"
                      id="name"
                      className="border-none bg-theme-settings-input-bg w-full text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
                      placeholder={t("new-workspace.placeholder")}
                      required={true}
                      autoComplete="off"
                      autoFocus={true}
                    />
                  </div>
                </div>
              )}
              {error && (
                <p className="text-red-400 text-sm">Error: {error}</p>
              )}
            </div>
            <div className="flex w-full justify-end items-center p-6 space-x-2 border-t border-theme-modal-border rounded-b">
              <button
                type="submit"
                disabled={creating || (velaConfigured && loading)}
                className="transition-all duration-300 bg-white text-black hover:opacity-60 px-4 py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {creating ? "Opening…" : "Open in chat"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalWrapper>
  );
}

export function useNewWorkspaceModal() {
  const [showing, setShowing] = useState(false);
  const showModal = () => {
    setShowing(true);
  };
  const hideModal = () => {
    setShowing(false);
  };

  return { showing, showModal, hideModal };
}
