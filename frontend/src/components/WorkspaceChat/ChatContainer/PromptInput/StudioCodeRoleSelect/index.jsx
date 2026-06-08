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
export default function StudioCodeRoleSelect({
  workspaceSlug,
  projectId,
  threadSlug = null,
}) {
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
          data?.default_role_id,
          threadSlug
        );
        setRoles(list);
        setRoleId(resolved);
        if (resolved && list.some((r) => r.id === resolved)) {
          saveStudioCodeRole(workspaceSlug, resolved, threadSlug);
          Vela.applyRolePreset(workspaceSlug, resolved).catch((err) =>
            console.warn("[vela] studio code default role", err)
          );
        }
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
  }, [searchParams, workspaceSlug, projectId, threadSlug]);

  if (!isStudioCodeEmbed(searchParams) || !workspaceSlug) return null;

  const selected = roles.find((r) => r.id === roleId);
  const label = selected?.display_name || "Role";
  const roleHint = roleId ? `Hub role: ${roleId}` : "No role selected";

  return (
    <div
      className="flex items-center shrink-0 mr-1"
      title={selected?.description ? `${roleHint} — ${selected.description}` : roleHint}
    >
      <label htmlFor="studio-code-role-select" className="sr-only">
        Coding role
      </label>
      <select
        id="studio-code-role-select"
        className="studio-code-role-select text-xs rounded-lg border border-white/10 light:border-slate-300 bg-zinc-800 light:bg-white text-white light:text-slate-800 px-2 py-1 max-w-[11rem] truncate cursor-pointer disabled:opacity-50"
        value={roleId}
        disabled={loading || roles.length === 0}
        title={roleHint}
        aria-label={`Coding role: ${label} (${roleId || "none"})`}
        onChange={(e) => {
          const next = e.target.value;
          setRoleId(next);
          saveStudioCodeRole(workspaceSlug, next, threadSlug);
          Vela.applyRolePreset(workspaceSlug, next).catch((err) =>
            console.warn("[vela] studio code role change", err)
          );
        }}
      >
        {loading && <option value="">Loading…</option>}
        {!loading && roles.length === 0 && (
          <option value="">{loadError ? "Unavailable" : "No roles"}</option>
        )}
        {roles.map((role) => (
          <option
            key={role.id}
            value={role.id}
            title={`${role.id}${role.description ? ` — ${role.description}` : ""}`}
          >
            {role.display_name}
          </option>
        ))}
      </select>
    </div>
  );
}
