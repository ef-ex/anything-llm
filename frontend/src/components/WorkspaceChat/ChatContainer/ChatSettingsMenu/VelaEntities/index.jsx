import { useTranslation } from "react-i18next";
import {
  useVelaEntitiesSidebar,
  useMemoriesSidebar,
  useSourcesSidebar,
} from "../../ChatSidebar";

export default function VelaEntitiesRow({ onClose }) {
  const { t } = useTranslation();
  const { toggleSidebar } = useVelaEntitiesSidebar();
  const { closeSidebar: closeMemories } = useMemoriesSidebar();
  const { closeSidebar: closeSources } = useSourcesSidebar();

  function handleClick() {
    closeMemories();
    closeSources();
    toggleSidebar();
    onClose();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center w-full px-2 py-1 rounded cursor-pointer hover:bg-zinc-700 light:hover:bg-slate-200 border-none bg-transparent text-left"
    >
      <span className="text-sm font-normal text-white light:text-slate-800">
        {t("chat_window.vela_entities.title")}
      </span>
    </button>
  );
}
