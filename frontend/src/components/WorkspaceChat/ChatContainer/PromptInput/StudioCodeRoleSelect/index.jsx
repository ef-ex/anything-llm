import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Vela from "@/models/vela";
import {
  isStudioCodeEmbed,
  resolveStoredRoleId,
  saveStudioCodeRole,
} from "@/utils/studioCodeRole";

/**
 * Hub role picker for Studio Code embed (?studio=code).
 */
export default function StudioCodeRoleSelect({ workspaceSlug, projectId }) {
  const [searchParams] = useSearchParams();
  const [roles, setRoles] = useState([]);
  const [roleId, setRoleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!isStudioCodeEmbed(searchParams) || !workspaceSlug || !projectId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await Vela.listStudioCodeRoles(workspaceSlug, { projectId });
        if (cancelled) return;
        const list = Array.isArray(data?.roles) ? data.roles : [];
        const resolved = resolveStoredRoleId(
          workspaceSlug,
          list,
          data?.default_role_id
        );
        setRoles(list);
        setRoleId(resolved);
        saveStudioCodeRole(workspaceSlug, resolved);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err?.message || "Could not load coding roles.");
          setRoles([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, workspaceSlug, projectId]);

  if (!isStudioCodeEmbed(searchParams) || !workspaceSlug) return null;

  const label = roles.find((r) => r.id === roleId)?.display_name || "Role";

  return (
    <div
      className="flex items-center shrink-0 mr-1"
      title="Which coding assistant handles this thread."
    >
      <label htmlFor="studio-code-role-select" className="sr-only">
        Coding role
      </label>
      <select
        id="studio-code-role-select"
        className="studio-code-role-select text-xs rounded-lg border border-white/10 light:border-slate-300 bg-zinc-800 light:bg-white text-white light:text-slate-800 px-2 py-1 max-w-[11rem] truncate cursor-pointer disabled:opacity-50"
        value={roleId}
        disabled={loading || roles.length === 0}
        title="Which coding assistant handles this thread."
        aria-label={`Coding role: ${label}`}
        onChange={(e) => {
          const next = e.target.value;
          setRoleId(next);
          saveStudioCodeRole(workspaceSlug, next);
        }}
      >
        {loading && <option value="">Loading…</option>}
        {!loading && roles.length === 0 && (
          <option value="">{loadError ? "Unavailable" : "No roles"}</option>
        )}
        {roles.map((role) => (
          <option key={role.id} value={role.id} title={role.description || role.display_name}>
            {role.display_name}
          </option>
        ))}
      </select>
    </div>
  );
}
