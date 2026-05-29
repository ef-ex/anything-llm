import React, { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import PreLoader from "@/components/Preloader";
import { isMobile } from "react-device-detect";
import Vela from "@/models/vela";
import showToast from "@/utils/toast";
import paths from "@/utils/paths";
import { Link } from "react-router-dom";
import {
  ArrowsClockwise,
  Plugs,
  PlugsConnected,
  Pulse,
  Robot,
} from "@phosphor-icons/react";
import useUser from "@/hooks/useUser";
import Workspace from "@/models/workspace";

function StatusBadge({ ok, label }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full ${
        ok
          ? "bg-green-900/40 text-green-300"
          : "bg-zinc-700 text-zinc-300"
      }`}
    >
      {label}
    </span>
  );
}

function CursorSubscriptionCard({ workspaceSlug, velaAdminUrl }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [testResult, setTestResult] = useState(null);

  const loadStatus = useCallback(async () => {
    if (!workspaceSlug) return;
    setLoading(true);
    try {
      const data = await Vela.cursorSubscriptionStatus(workspaceSlug);
      setStatus(data);
    } catch (e) {
      showToast(e.message, "error");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const runAction = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
      await loadStatus();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-700 p-6 flex justify-center">
        <PreLoader />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="rounded-xl border border-zinc-700 p-6 text-sm text-zinc-400">
        Could not load Cursor subscription status. Check VELA_API_URL and that Vela is running on the candidate port.
      </div>
    );
  }

  const authOk = status.auth_status === "authenticated";
  const proxyOk = status.proxy_reachable;

  return (
    <div className="rounded-xl border border-zinc-700 p-6 flex flex-col gap-4 max-w-[720px]">
      <div className="flex items-start gap-3">
        <Robot className="h-8 w-8 text-white shrink-0" weight="duotone" />
        <div>
          <h3 className="text-white font-semibold text-base">Cursor Subscription</h3>
          <p className="text-xs text-zinc-400 mt-1">
            Starts automatically with the Vela candidate dev stack. You only sign in to Cursor once; nothing goes into AnythingLLM .env.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusBadge ok={status.configured} label={status.configured ? "Configured" : "Unconfigured"} />
        <StatusBadge ok={proxyOk} label={proxyOk ? "Proxy reachable" : "Proxy unreachable"} />
        <StatusBadge
          ok={authOk}
          label={
            status.auth_status === "authenticated"
              ? "Authenticated"
              : status.auth_status === "unauthenticated"
                ? "Not logged in"
                : "Auth unknown"
          }
        />
        <span className="text-xs text-zinc-500 px-2 py-0.5">
          Scope: {status.scope || "studio"}
          {status.project_id ? ` · project ${status.project_id.slice(0, 8)}…` : ""}
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-2 text-sm">
        <div>
          <dt className="text-zinc-500 text-xs">Proxy URL</dt>
          <dd className="text-zinc-200 font-mono text-xs break-all">{status.proxy_url}</dd>
        </div>
        <div>
          <dt className="text-zinc-500 text-xs">Models</dt>
          <dd className="text-zinc-200">
            {status.model_count} known
            {status.last_refresh ? ` · refreshed ${status.last_refresh}` : ""}
          </dd>
        </div>
        {status.models?.length > 0 && (
          <dd className="text-zinc-400 text-xs font-mono">
            {status.models.slice(0, 6).join(", ")}
            {status.models.length > 6 ? "…" : ""}
          </dd>
        )}
      </dl>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() =>
            runAction("refresh", () =>
              Vela.cursorRefreshModels(workspaceSlug, { force: true })
            )
          }
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white border-none cursor-pointer disabled:opacity-50"
        >
          <ArrowsClockwise size={16} className={busy === "refresh" ? "animate-spin" : ""} />
          Refresh models
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() =>
            runAction("connect", async () => {
              const data = await Vela.cursorConnect(workspaceSlug);
              const steps = (data.instructions || []).join("\n");
              showToast(data.message || "See connect instructions below", "info");
              if (steps) window.alert(steps);
            })
          }
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white border-none cursor-pointer disabled:opacity-50"
        >
          <PlugsConnected size={16} />
          Connect instructions
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() =>
            runAction("test", async () => {
              const data = await Vela.cursorTestDispatch(workspaceSlug);
              setTestResult(data);
              if (data.ok) {
                showToast(`Dispatch OK: ${data.content?.slice(0, 80) || "success"}`, "success");
              } else {
                showToast(data.error || "Dispatch failed", "error");
              }
            })
          }
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-white text-zinc-900 hover:bg-zinc-200 border-none cursor-pointer disabled:opacity-50"
        >
          <Pulse size={16} />
          Test dispatch
        </button>
      </div>

      {testResult && !testResult.ok && (
        <p className="text-xs text-orange-300 bg-orange-950/30 rounded p-2">
          {testResult.error}
          {testResult.category ? ` (${testResult.category})` : ""}
        </p>
      )}

      {status.instructions?.length > 0 && (
        <ol className="text-xs text-zinc-400 list-decimal list-inside space-y-1 border-t border-zinc-700 pt-3">
          {status.instructions.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}

      {velaAdminUrl && (
        <p className="text-xs text-zinc-500">
          <Link
            to={paths.settings.llmPreference()}
            className="text-primary-button underline mr-2"
          >
            LLM preferences
          </Link>
          · Project Cursor proxy overrides:{" "}
          <a
            href={`${velaAdminUrl}/projects`}
            target="_blank"
            rel="noreferrer"
            className="text-primary-button underline"
          >
            Vela admin
          </a>
        </p>
      )}
    </div>
  );
}

export default function SubscriptionAccess() {
  const [workspaceSlug, setWorkspaceSlug] = useState(null);
  const [velaAvailable, setVelaAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  useEffect(() => {
    async function init() {
      try {
        const workspaces = await Workspace.all();
        const slug = workspaces?.[0]?.slug;
        setWorkspaceSlug(slug || null);
        if (slug) {
          const st = await Vela.status(slug);
          setVelaAvailable(!!st.available);
        }
      } catch {
        setVelaAvailable(false);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const velaAdminUrl =
    typeof window !== "undefined" && import.meta.env.VITE_VELA_ADMIN_URL
      ? import.meta.env.VITE_VELA_ADMIN_URL
      : "http://127.0.0.1:7701";

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        {loading ? (
          <div className="w-full h-full flex justify-center items-center">
            <PreLoader />
          </div>
        ) : (
          <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16 max-w-3xl">
            <div className="w-full flex flex-col gap-y-1 pb-6 border-white light:border-theme-sidebar-border border-b-2 border-opacity-10">
              <div className="flex gap-x-2 items-center">
                <Plugs className="h-6 w-6 text-white" />
                <p className="text-lg leading-6 font-bold text-white">Subscription Access</p>
              </div>
              <p className="text-xs leading-[18px] text-white text-opacity-60">
                Configure subscription-backed models routed through Vela dispatch. Cursor is the first provider; credentials never go into AnythingLLM .env.
              </p>
            </div>

            {!velaAvailable && (
              <p className="text-sm text-orange-300 mb-4">
                Vela API is not reachable. Start the dev stack with scripts/launch-dev.ps1 (candidate on port 7701).
              </p>
            )}

            {!workspaceSlug ? (
              <p className="text-sm text-zinc-400">
                Open a workspace first so subscription status can use your bound Vela project.
              </p>
            ) : (
              <CursorSubscriptionCard
                workspaceSlug={workspaceSlug}
                velaAdminUrl={velaAdminUrl}
              />
            )}

            {user?.role === "admin" && workspaceSlug && (
              <p className="text-xs text-zinc-500 mt-6">
                To chat with Cursor models, bind a Vela project in the workspace, select the{" "}
                <strong className="text-zinc-300">Cursor Developer</strong> role preset, and ensure chat provider is vela-dispatch.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
