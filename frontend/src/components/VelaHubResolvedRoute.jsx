import { useEffect, useState } from "react";
import Workspace from "@/models/workspace";

const hubControlsProviders =
  import.meta.env.VITE_VELA_HUB_CONTROLS_PROVIDERS !== "0" &&
  import.meta.env.VITE_VELA_HUB_CONTROLS_PROVIDERS !== "false";
const hubUrl =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_VELA_ADMIN_URL) ||
  "http://127.0.0.1:7001";

/**
 * M34 — read-only resolved provider route when Vela Hub controls providers.
 */
export default function VelaHubResolvedRoute({ workspace, roleId = null }) {
  const [route, setRoute] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hubControlsProviders || !workspace?.slug) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = roleId ? `?role_id=${encodeURIComponent(roleId)}` : "";
        const { route: data, error: err } = await Workspace.getVelaProviderRoute(
          workspace.slug,
          qs
        );
        if (cancelled) return;
        if (err) setError(err);
        else setRoute(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace?.slug, roleId]);

  if (!hubControlsProviders) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-theme-settings-input-bg px-4 py-3 text-sm">
      <p className="font-medium text-white mb-2">Resolved route (Vela Hub)</p>
      {loading && <p className="text-white/60">Loading…</p>}
      {error && <p className="text-red-300">{error}</p>}
      {!loading && !error && route && (
        <dl className="space-y-1 text-white/80">
          <div>
            <dt className="inline text-white/50">Offer: </dt>
            <dd className="inline font-mono">{route.offer_id || "—"}</dd>
          </div>
          <div>
            <dt className="inline text-white/50">Provider / model: </dt>
            <dd className="inline font-mono">
              {route.provider_profile_id || route.provider_id || "—"} /{" "}
              {route.native_model_id || route.model_id || "—"}
            </dd>
          </div>
          <div>
            <dt className="inline text-white/50">Reason: </dt>
            <dd className="inline">{route.selection_reason || "—"}</dd>
          </div>
        </dl>
      )}
      <p className="mt-3 text-white/50">
        <a
          href={`${hubUrl}#ai-providers/routing`}
          target="_blank"
          rel="noreferrer"
          className="underline text-primary-button"
        >
          Edit routing in Vela Hub
        </a>
      </p>
    </div>
  );
}

export { hubControlsProviders };
