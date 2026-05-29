import { useEffect, useMemo, useState } from "react";
import { CircleNotch, X } from "@phosphor-icons/react";
import ModalWrapper from "@/components/ModalWrapper";
import Vela from "@/models/vela";

const CONTEXT_DEPTHS = ["minimal", "compact", "standard", "deep"];
const REASONING_LEVELS = ["off", "low", "medium", "high"];
const COST_POLICIES = ["prefer_local", "prefer_cheap", "balanced", "prefer_quality"];
const ENTITY_FACETS = ["brief", "refs", "notes", "technical", "lineage"];

const emptyForm = () => ({
  id: "",
  display_name: "",
  description: "",
  default_route: { provider_id: "", model_id: "" },
  context_depth: "compact",
  reasoning_level: "off",
  cost_policy: "balanced",
  default_entity_facet: "brief",
  include_media_by_default: false,
  fallback_routes: [],
  required_capabilities: [],
  allowed_tool_classes: [],
});

function presetToForm(preset) {
  if (!preset) return emptyForm();
  return {
    id: preset.id,
    display_name: preset.display_name,
    description: preset.description || "",
    default_route: { ...preset.default_route },
    context_depth: preset.context_depth,
    reasoning_level: preset.reasoning_level,
    cost_policy: preset.cost_policy,
    default_entity_facet: preset.default_entity_facet,
    include_media_by_default: !!preset.include_media_by_default,
    fallback_routes: preset.fallback_routes || [],
    required_capabilities: preset.required_capabilities || [],
    allowed_tool_classes: preset.allowed_tool_classes || [],
  };
}

export default function RolePresetModal({
  isOpen,
  closeModal,
  onSuccess,
  preset = null,
  providerProfiles = [],
}) {
  const isEdit = !!preset;
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setForm(presetToForm(preset));
      setError(null);
    }
  }, [isOpen, preset]);

  const modelsForProvider = useMemo(() => {
    const profile = providerProfiles.find((p) => p.id === form.default_route.provider_id);
    return profile?.models || [];
  }, [providerProfiles, form.default_route.provider_id]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        ...form,
        id: form.id.trim(),
        display_name: form.display_name.trim(),
      };
      if (!payload.id || !payload.display_name) {
        throw new Error("Id and display name are required.");
      }
      if (!payload.default_route.provider_id || !payload.default_route.model_id) {
        throw new Error("Default provider and model are required.");
      }
      if (isEdit) {
        await Vela.updateRolePresetAdmin(preset.id, payload);
      } else {
        await Vela.createRolePresetAdmin(payload);
      }
      onSuccess();
      closeModal();
    } catch (err) {
      setError(err.message || "Failed to save role preset.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper isOpen={isOpen}>
      <div className="relative w-full max-w-2xl bg-zinc-900 light:bg-white rounded-lg shadow border border-zinc-700 light:border-slate-300 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-4 p-6">
          <div className="flex items-start justify-between">
            <h3 className="text-base font-semibold text-white light:text-slate-950">
              {isEdit ? `Edit role: ${preset.display_name}` : "New studio role"}
            </h3>
            <button
              type="button"
              onClick={closeModal}
              className="border-none text-zinc-400 hover:text-white"
            >
              <X size={16} weight="bold" />
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 rounded px-3 py-2">{error}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-300 light:text-slate-700">Role id</span>
              <input
                type="text"
                value={form.id}
                disabled={isEdit}
                onChange={(e) => setField("id", e.target.value)}
                placeholder="concept-artist"
                className="bg-zinc-800 light:bg-white border border-zinc-600 rounded px-3 py-2 text-white light:text-slate-900 disabled:opacity-60"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-300 light:text-slate-700">Display name</span>
              <input
                type="text"
                value={form.display_name}
                onChange={(e) => setField("display_name", e.target.value)}
                className="bg-zinc-800 light:bg-white border border-zinc-600 rounded px-3 py-2 text-white light:text-slate-900"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-300 light:text-slate-700">Description</span>
            <textarea
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              rows={2}
              className="bg-zinc-800 light:bg-white border border-zinc-600 rounded px-3 py-2 text-white light:text-slate-900"
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-300 light:text-slate-700">Default provider</span>
              <select
                value={form.default_route.provider_id}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    default_route: { provider_id: e.target.value, model_id: "" },
                  }))
                }
                className="bg-zinc-800 light:bg-white border border-zinc-600 rounded px-3 py-2 text-white light:text-slate-900"
              >
                <option value="">Select provider</option>
                {providerProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-300 light:text-slate-700">Default model</span>
              <select
                value={form.default_route.model_id}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    default_route: { ...prev.default_route, model_id: e.target.value },
                  }))
                }
                disabled={!form.default_route.provider_id}
                className="bg-zinc-800 light:bg-white border border-zinc-600 rounded px-3 py-2 text-white light:text-slate-900 disabled:opacity-60"
              >
                <option value="">Select model</option>
                {modelsForProvider.map((m) => (
                  <option key={m.model_id} value={m.model_id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-300">Context depth</span>
              <select
                value={form.context_depth}
                onChange={(e) => setField("context_depth", e.target.value)}
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-2 text-white text-sm"
              >
                {CONTEXT_DEPTHS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-300">Reasoning</span>
              <select
                value={form.reasoning_level}
                onChange={(e) => setField("reasoning_level", e.target.value)}
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-2 text-white text-sm"
              >
                {REASONING_LEVELS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-300">Cost policy</span>
              <select
                value={form.cost_policy}
                onChange={(e) => setField("cost_policy", e.target.value)}
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-2 text-white text-sm"
              >
                {COST_POLICIES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-300">Entity facet</span>
              <select
                value={form.default_entity_facet}
                onChange={(e) => setField("default_entity_facet", e.target.value)}
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-2 text-white text-sm"
              >
                {ENTITY_FACETS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={form.include_media_by_default}
              onChange={(e) => setField("include_media_by_default", e.target.checked)}
            />
            Include media by default
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 text-sm text-zinc-300 border border-zinc-600 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-50 text-zinc-950 disabled:opacity-60 flex items-center gap-2"
            >
              {loading && <CircleNotch className="animate-spin h-4 w-4" />}
              {isEdit ? "Save changes" : "Create role"}
            </button>
          </div>
        </form>
      </div>
    </ModalWrapper>
  );
}
