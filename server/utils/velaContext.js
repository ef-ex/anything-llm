/**
 * Vela Context Integration for AnythingLLM
 *
 * Fetches project-aware context from the Vela backend (POST /api/context)
 * and prepends it to the AnythingLLM system prompt.
 *
 * Controlled by environment variables:
 *   VELA_API_URL — base URL of the Vela backend (e.g., http://127.0.0.1:7700)
 *   VELA_PROJECT_ID — optional project ID to scope context to
 */

const VELA_API_URL = process.env.VELA_API_URL || null;
const VELA_PROJECT_ID = process.env.VELA_PROJECT_ID || null;
const VELA_TIMEOUT_MS = parseInt(process.env.VELA_TIMEOUT_MS || "5000", 10);

let velaAvailable = null; // null = unchecked, true/false after first attempt

/**
 * Check if the Vela backend is reachable.
 * Caches the result so we don't hammer the health endpoint.
 * @returns {Promise<boolean>}
 */
async function isVelaAvailable() {
  if (velaAvailable !== null) return velaAvailable;
  if (!VELA_API_URL) {
    velaAvailable = false;
    return false;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VELA_TIMEOUT_MS);
    const resp = await fetch(`${VELA_API_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    velaAvailable = resp.ok;
    return velaAvailable;
  } catch {
    velaAvailable = false;
    return false;
  }
}

/**
 * Reset the availability cache (e.g., after config change).
 */
function resetVelaAvailability() {
  velaAvailable = null;
}

/**
 * Fetch context from the Vela backend.
 *
 * @param {Object} [opts]
 * @param {string} [opts.projectId] — project ID override
 * @param {string} [opts.userId] — user ID for permission resolution
 * @param {string} [opts.sessionId] — chat session ID
 * @param {boolean} [opts.includeRules=true] — include rules in context
 * @param {boolean} [opts.includeProject=true] — include project info
 * @param {boolean} [opts.includePermissions=true] — include permission boundary
 * @returns {Promise<Object|null>} Context response or null on failure
 */
async function fetchVelaContext(opts = {}) {
  if (!VELA_API_URL) return null;

  const available = await isVelaAvailable();
  if (!available) return null;

  const body = {
    project_id: opts.projectId || VELA_PROJECT_ID || null,
    user_id: opts.userId || null,
    session_id: opts.sessionId || null,
    include_rules: opts.includeRules !== false,
    include_project: opts.includeProject !== false,
    include_permissions: opts.includePermissions !== false,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VELA_TIMEOUT_MS);
    const resp = await fetch(`${VELA_API_URL}/api/context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.warn(`[vela] context fetch failed: HTTP ${resp.status}`);
      return null;
    }

    return await resp.json();
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn(`[vela] context fetch timed out after ${VELA_TIMEOUT_MS}ms`);
    } else {
      console.warn(`[vela] context fetch error: ${err.message}`);
    }
    return null;
  }
}

/**
 * Build a Vela context prefix string for injection into the system prompt.
 *
 * @param {Object} context — the raw context response from fetchVelaContext()
 * @returns {string} formatted context prefix
 */
function buildContextPrefix(context) {
  if (!context) return "";

  const parts = [];

  // Permission boundary (always include if available)
  if (context.permission_scope?.boundary_summary) {
    parts.push(`[Vela Permission Boundary]\n${context.permission_scope.boundary_summary}`);
  }

  // Project info
  if (context.project_info) {
    const p = context.project_info;
    parts.push(
      `[Vela Project]\nName: ${p.name}\nStatus: ${p.status}\nRoot: ${p.root_path || "not set"}`
    );
  }

  // Rules hierarchy
  if (context.rules && context.rules.length > 0) {
    const rulesText = context.rules
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .map((r) => `- [${r.scope}] ${r.name}: ${r.content}`)
      .join("\n");
    parts.push(`[Vela Rules]\n${rulesText}`);
  }

  // Full system context as fallback
  if (parts.length === 0 && context.system_context) {
    parts.push(context.system_context);
  }

  return parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "";
}

module.exports = {
  VELA_API_URL,
  VELA_PROJECT_ID,
  isVelaAvailable,
  resetVelaAvailability,
  fetchVelaContext,
  buildContextPrefix,
};