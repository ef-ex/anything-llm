import { Link } from "react-router-dom";
import paths from "@/utils/paths";

/**
 * Vela chat sidebar wordmark (replaces AnythingLLM logo in the fork).
 */
export default function VelaSidebarBrand({
  className = "",
  linkClassName = "",
  showSidebar = true,
}) {
  return (
    <Link
      to={paths.home()}
      aria-label="Vela home"
      className={`inline-flex items-center ${linkClassName}`}
    >
      <span
        className={`font-bold tracking-[0.22em] text-white light:text-slate-900 text-lg leading-none select-none transition-opacity duration-500 ${
          showSidebar ? "opacity-100" : "opacity-0"
        } ${className}`}
      >
        VELA
      </span>
    </Link>
  );
}
