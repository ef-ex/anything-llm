import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Vela from "@/models/vela";
import Workspace from "@/models/workspace";

const COMPOSER_STANDARD = "cursor-acp/composer-2.5";
const COMPOSER_FAST = "cursor-acp/composer-2.5-fast";
const CURSOR_DEVELOPER_ROLE = "cursor-developer";

function isComposerModel(chatModel) {
  if (!chatModel || typeof chatModel !== "string") return false;
  return chatModel.includes("composer-2.5");
}

function isFastComposer(chatModel) {
  return chatModel === COMPOSER_FAST || chatModel.endsWith("/composer-2.5-fast");
}

export default function CursorComposerFastRow({ workspaceSlug = null, onClose }) {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadWorkspace = useCallback(async () => {
    if (!workspaceSlug) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ws = await Workspace.bySlug(workspaceSlug);
      setWorkspace(ws);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const showRow =
    workspace?.velaRolePresetId === CURSOR_DEVELOPER_ROLE ||
    isComposerModel(workspace?.chatModel);

  if (loading || !showRow) return null;

  const fastEnabled = isFastComposer(workspace?.chatModel);

  async function handleToggle() {
    if (!workspaceSlug || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await Vela.setCursorComposerMode(workspaceSlug, {
        fast: !fastEnabled,
      });
      setWorkspace(data.workspace);
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 border-t border-zinc-700 light:border-slate-300 pt-2">
      <label className="flex items-center justify-between gap-2 px-2 py-1 cursor-pointer">
        <div className="flex flex-col min-w-0">
          <span className="text-sm text-white light:text-slate-800">
            {t("chat_window.vela_cursor_composer.fast_mode")}
          </span>
          <span className="text-[11px] text-zinc-400 light:text-slate-500 leading-snug">
            {fastEnabled
              ? t("chat_window.vela_cursor_composer.fast_on")
              : t("chat_window.vela_cursor_composer.fast_off")}
          </span>
        </div>
        <input
          type="checkbox"
          checked={fastEnabled}
          disabled={busy}
          onChange={handleToggle}
          className="shrink-0"
          aria-label={t("chat_window.vela_cursor_composer.fast_mode")}
        />
      </label>
      {error && (
        <p className="px-2 text-[11px] text-red-400 light:text-red-600">{error}</p>
      )}
    </div>
  );
}
