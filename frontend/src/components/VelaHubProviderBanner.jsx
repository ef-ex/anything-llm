/**
 * M27 — points operators to the canonical Vela Hub provider control plane.
 */
export default function VelaHubProviderBanner({ section = "profiles" }) {
  const hubUrl =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_VELA_ADMIN_URL) ||
    "http://127.0.0.1:7001";
  const hash =
    section === "subscriptions"
      ? "#ai-providers/subscriptions"
      : "#ai-providers/profiles";

  return (
    <div className="mb-4 rounded-lg border border-amber-600/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-100">
      Configure providers in{" "}
      <a
        href={`${hubUrl}${hash}`}
        target="_blank"
        rel="noreferrer"
        className="underline text-primary-button"
      >
        Vela Hub → AI Providers
      </a>
      . Studio provider profiles and subscription connectors are managed there (M27).
    </div>
  );
}
