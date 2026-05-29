import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

async function parseJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const Vela = {
  status: async function (workspaceSlug) {
    const res = await fetch(`${API_BASE}/workspace/${workspaceSlug}/vela/status`, {
      headers: baseHeaders(),
    });
    return parseJson(res);
  },

  listProjects: async function (workspaceSlug) {
    const res = await fetch(`${API_BASE}/workspace/${workspaceSlug}/vela/projects`, {
      headers: baseHeaders(),
    });
    return parseJson(res);
  },

  getActiveProject: async function (workspaceSlug) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/active-project`,
      { headers: baseHeaders() }
    );
    return parseJson(res);
  },

  setUserDefaultProject: async function (workspaceSlug, projectId) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/active-project`,
      {
        method: "PUT",
        headers: baseHeaders(),
        body: JSON.stringify({ project_id: projectId }),
      }
    );
    return parseJson(res);
  },

  setWorkspaceProject: async function (workspaceSlug, velaProjectId) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/workspace-project`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ velaProjectId }),
      }
    );
    return parseJson(res);
  },

  listEntities: async function (workspaceSlug, type = null) {
    const qs = type ? `?type=${encodeURIComponent(type)}` : "";
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/entities${qs}`,
      { headers: baseHeaders() }
    );
    return parseJson(res);
  },

  getEntity: async function (workspaceSlug, entityId) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/entities/${entityId}`,
      { headers: baseHeaders() }
    );
    return parseJson(res);
  },

  listEntityFiles: async function (workspaceSlug, entityId) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/entities/${entityId}/files`,
      { headers: baseHeaders() }
    );
    return parseJson(res);
  },

  pinEntity: async function (workspaceSlug, entityId, { version = null, file_ref_id = null } = {}) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/entities/${entityId}/pin`,
      {
        method: "PUT",
        headers: baseHeaders(),
        body: JSON.stringify({ version, file_ref_id }),
      }
    );
    return parseJson(res);
  },

  resolveReferences: async function (
    workspaceSlug,
    {
      references,
      include_media = false,
      default_facet = "brief",
      role_preset_id = null,
    } = {}
  ) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/entities/resolve`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({
          references,
          include_media,
          default_facet,
          role_preset_id,
        }),
      }
    );
    return parseJson(res);
  },

  listRolePresets: async function (workspaceSlug) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/role-presets`,
      { headers: baseHeaders() }
    );
    return parseJson(res);
  },

  listRolePresetsAdmin: async function () {
    const res = await fetch(`${API_BASE}/vela/admin/role-presets`, {
      headers: baseHeaders(),
    });
    return parseJson(res);
  },

  getRolePresetAdmin: async function (id) {
    const res = await fetch(`${API_BASE}/vela/admin/role-presets/${encodeURIComponent(id)}`, {
      headers: baseHeaders(),
    });
    return parseJson(res);
  },

  createRolePresetAdmin: async function (payload) {
    const res = await fetch(`${API_BASE}/vela/admin/role-presets`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  updateRolePresetAdmin: async function (id, payload) {
    const res = await fetch(`${API_BASE}/vela/admin/role-presets/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: baseHeaders(),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  deleteRolePresetAdmin: async function (id) {
    const res = await fetch(`${API_BASE}/vela/admin/role-presets/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: baseHeaders(),
    });
    if (res.status === 204) return { ok: true };
    return parseJson(res);
  },

  listProviderProfilesAdmin: async function () {
    const res = await fetch(`${API_BASE}/vela/admin/provider-profiles`, {
      headers: baseHeaders(),
    });
    return parseJson(res);
  },

  resolveRolePreset: async function (workspaceSlug, roleId, requiredCapabilities = []) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/role-presets/resolve`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({
          role_id: roleId,
          required_capabilities: requiredCapabilities,
        }),
      }
    );
    return parseJson(res);
  },

  setCursorComposerMode: async function (workspaceSlug, { fast = false } = {}) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/cursor-composer-mode`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ fast: !!fast }),
      }
    );
    return parseJson(res);
  },

  applyRolePreset: async function (workspaceSlug, roleId) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/role-preset`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ role_id: roleId }),
      }
    );
    const data = await parseJson(res);
    if (!data?.workspace?.velaRolePresetId) {
      throw new Error(
        data?.error ||
          data?.message ||
          "Role was not saved on the workspace. Try restarting AnythingLLM after running launch-dev migrations."
      );
    }
    return data;
  },

  resolveFilePath: async function (
    workspaceSlug,
    { tags, entity_name, run_id, version, external_path } = {}
  ) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/files/resolve`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({
          tags,
          entity_name,
          run_id,
          version,
          external_path,
        }),
      }
    );
    return parseJson(res);
  },

  publish: async function (workspaceSlug, payload) {
    const res = await fetch(`${API_BASE}/workspace/${workspaceSlug}/vela/publish`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(payload),
    });
    return parseJson(res);
  },

  cursorSubscriptionStatus: async function (workspaceSlug, { projectId = null } = {}) {
    const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/subscriptions/cursor/status${qs}`,
      { headers: baseHeaders() }
    );
    return parseJson(res);
  },

  cursorRefreshModels: async function (
    workspaceSlug,
    { projectId = null, force = true } = {}
  ) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/subscriptions/cursor/refresh-models`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({ project_id: projectId, force }),
      }
    );
    return parseJson(res);
  },

  cursorConnect: async function (workspaceSlug) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/subscriptions/cursor/connect`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({}),
      }
    );
    return parseJson(res);
  },

  cursorTestDispatch: async function (
    workspaceSlug,
    { projectId = null, roleId = "cursor-developer", message } = {}
  ) {
    const res = await fetch(
      `${API_BASE}/workspace/${workspaceSlug}/vela/subscriptions/cursor/test-dispatch`,
      {
        method: "POST",
        headers: baseHeaders(),
        body: JSON.stringify({
          project_id: projectId,
          role_id: roleId,
          message,
        }),
      }
    );
    return parseJson(res);
  },
};

/** Build @-reference string from entity type, name, version, and facets. */
export function buildEntityReference(entity, { version, facets = ["brief"] } = {}) {
  const type = entity.type || "asset";
  let ref = `@${type}:${entity.name}`;
  if (version) ref += `.${version}`;
  for (const facet of facets) {
    ref += `.${facet}`;
  }
  return ref;
}

/** Human-readable preview of a resolved context card. */
export function formatContextCard(card) {
  if (!card) return "";
  const lines = [];
  lines.push(`Reference: ${card.reference}`);
  if (!card.resolved) {
    lines.push(`Error: ${card.error || "unresolved"}`);
    return lines.join("\n");
  }
  lines.push(`Summary: ${card.summary || ""}`);
  if (card.version) lines.push(`Version: ${card.version} (${card.version_source || ""})`);
  if (card.description) lines.push(`Description: ${card.description}`);
  if (card.facet_data?.brief) lines.push(`Brief: ${card.facet_data.brief}`);
  if (card.facet_data?.notes) lines.push(`Notes: ${card.facet_data.notes}`);
  if (card.facet_data?.refs?.length) {
    lines.push("Refs:");
    for (const f of card.facet_data.refs) {
      lines.push(`  - ${f.path} (${f.version || "—"})`);
    }
  }
  if (card.media?.length) {
    lines.push("Media:");
    for (const m of card.media) {
      lines.push(`  - ${m.path} (${m.mime_type})`);
    }
  }
  if (card.media_omitted) lines.push(`Media omitted: ${card.media_omitted}`);
  return lines.join("\n");
}

export default Vela;
