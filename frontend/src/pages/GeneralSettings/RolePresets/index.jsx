import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import { CircleNotch, PencilSimple, Plus, Trash, UserCircleGear } from "@phosphor-icons/react";
import Vela from "@/models/vela";
import showToast from "@/utils/toast";
import { useModal } from "@/hooks/useModal";
import RolePresetModal from "./RolePresetModal";

function SourceBadge({ source }) {
  const colors = {
    bundled: "bg-zinc-700 text-zinc-300",
    custom: "bg-blue-900/40 text-blue-300",
    override: "bg-amber-900/40 text-amber-300",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[source] || colors.bundled}`}>
      {source}
    </span>
  );
}

export default function RolePresetsSettings() {
  const { t } = useTranslation();
  const { isOpen, openModal, closeModal } = useModal();
  const [loading, setLoading] = useState(true);
  const [presets, setPresets] = useState([]);
  const [providerProfiles, setProviderProfiles] = useState([]);
  const [editingPreset, setEditingPreset] = useState(null);
  const [velaError, setVelaError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setVelaError(null);
    try {
      const [list, profiles] = await Promise.all([
        Vela.listRolePresetsAdmin(),
        Vela.listProviderProfilesAdmin(),
      ]);
      setPresets(list);
      setProviderProfiles(profiles);
    } catch (e) {
      setVelaError(e.message);
      setPresets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingPreset(null);
    openModal();
  };

  const openEdit = (preset) => {
    setEditingPreset(preset);
    openModal();
  };

  const handleDelete = async (preset) => {
    if (!preset.deletable) {
      showToast(t("role_presets_admin.cannot_delete_bundled"), "error");
      return;
    }
    if (!window.confirm(t("role_presets_admin.delete_confirm", { name: preset.display_name }))) {
      return;
    }
    try {
      await Vela.deleteRolePresetAdmin(preset.id);
      showToast(t("role_presets_admin.deleted"), "success");
      load();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const handleModalClose = () => {
    closeModal();
    setEditingPreset(null);
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-zinc-950 light:bg-slate-50 flex md:mt-0 mt-6">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-2xl bg-zinc-900 light:bg-white light:border light:border-slate-300 w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-0 py-16">
          <div className="flex items-end justify-between pr-8 py-6 border-b border-white/20 light:border-slate-300">
            <div className="flex flex-col gap-y-2">
              <div className="flex items-center gap-2">
                <UserCircleGear className="h-6 w-6 text-white light:text-slate-900" weight="duotone" />
                <p className="text-lg font-semibold text-white light:text-slate-900">
                  {t("role_presets_admin.title")}
                </p>
              </div>
              <p className="text-xs text-zinc-400 light:text-slate-600 max-w-[700px]">
                {t("role_presets_admin.description")}
              </p>
            </div>
            <button
              onClick={openCreate}
              disabled={!!velaError}
              className="border-none shrink-0 flex items-center gap-1.5 h-9 px-5 rounded-lg bg-slate-50 text-zinc-950 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <Plus size={16} weight="bold" />
              {t("role_presets_admin.new_button")}
            </button>
          </div>

          {velaError && (
            <p className="mt-4 text-sm text-orange-300">{t("role_presets_admin.vela_unreachable")}</p>
          )}

          {loading ? (
            <div className="flex justify-center py-20">
              <CircleNotch className="h-8 w-8 text-zinc-400 animate-spin" />
            </div>
          ) : presets.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-16">{t("role_presets_admin.empty")}</p>
          ) : (
            <div className="mt-6 flex flex-col">
              <div className="grid grid-cols-[1.5fr_2fr_1.2fr_1fr_88px] gap-x-4 px-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <span>{t("role_presets_admin.col_name")}</span>
                <span>{t("role_presets_admin.col_route")}</span>
                <span>{t("role_presets_admin.col_context")}</span>
                <span>{t("role_presets_admin.col_source")}</span>
                <span aria-hidden="true" />
              </div>
              <div className="mt-4 border-t border-white/20 light:border-slate-300" />
              {presets.map((preset, idx) => (
                <div
                  key={preset.id}
                  className={`grid grid-cols-[1.5fr_2fr_1.2fr_1fr_88px] gap-x-4 items-center px-4 py-4 ${
                    idx < presets.length - 1 ? "border-b border-white/10 light:border-slate-200" : ""
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-white light:text-slate-900">
                      {preset.display_name}
                    </p>
                    <p className="text-xs text-zinc-500">{preset.id}</p>
                  </div>
                  <p className="text-sm text-zinc-300 light:text-slate-600 truncate">
                    {preset.default_route.provider_id} / {preset.default_route.model_id}
                  </p>
                  <p className="text-sm text-zinc-400">{preset.context_depth}</p>
                  <SourceBadge source={preset.source} />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(preset)}
                      className="p-1.5 text-zinc-400 hover:text-white border-none bg-transparent cursor-pointer"
                      title={t("role_presets_admin.edit")}
                    >
                      <PencilSimple size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(preset)}
                      disabled={!preset.deletable}
                      className="p-1.5 text-zinc-400 hover:text-red-400 border-none bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      title={t("role_presets_admin.delete")}
                    >
                      <Trash size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <RolePresetModal
        isOpen={isOpen}
        closeModal={handleModalClose}
        onSuccess={load}
        preset={editingPreset}
        providerProfiles={providerProfiles}
      />
    </div>
  );
}
