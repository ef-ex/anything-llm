/**
 * Vela backend HTTP client for AnythingLLM proxy routes.
 *
 * Uses VELA_API_URL and VELA_TIMEOUT_MS (same as velaContext.js).
 */

const { VELA_API_URL } = require("./velaContext");

const VELA_TIMEOUT_MS = parseInt(process.env.VELA_TIMEOUT_MS || "5000", 10);
/** Orchestrator create/resume runs LLM routing synchronously; needs a longer proxy timeout. */
const VELA_ORCHESTRATOR_TIMEOUT_MS = parseInt(
  process.env.VELA_ORCHESTRATOR_TIMEOUT_MS || "120000",
  10
);

/**
 * @param {unknown} detail
 * @returns {string}
 */
function formatVelaErrorDetail(detail) {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  if (typeof detail !== "object") return String(detail);
  const body = /** @type {Record<string, unknown>} */ (detail);
  if (typeof body.error === "string" && body.error.trim()) return body.error;
  if (typeof body.message === "string" && body.message.trim()) return body.message;
  const category =
    typeof body.category === "string" && body.category.trim()
      ? body.category
      : null;
  const metadata =
    body.metadata && typeof body.metadata === "object"
      ? /** @type {Record<string, unknown>} */ (body.metadata)
      : null;
  if (metadata) {
    const providerId =
      typeof metadata.provider_id === "string" ? metadata.provider_id : null;
    const modelId =
      typeof metadata.model_id === "string" ? metadata.model_id : null;
    if (providerId && modelId) {
      const prefix = category ? `${category}: ` : "";
      return `${prefix}${providerId}/${modelId}`;
    }
  }
  try {
    return JSON.stringify(body);
  } catch {
    return "unknown error";
  }
}

function timeoutMsForPath(path, overrideMs) {
  if (overrideMs != null) return overrideMs;
  const normalized = String(path || "").replace(/^\//, "");
  if (
    normalized.startsWith("orchestrator/") ||
    normalized.startsWith("orchestration/")
  ) {
    return VELA_ORCHESTRATOR_TIMEOUT_MS;
  }
  return VELA_TIMEOUT_MS;
}

/**
 * @param {string} path — path after /api (e.g. "projects" or "entities/resolve")
 * @param {Object} [opts]
 * @param {string} [opts.method]
 * @param {Object} [opts.body]
 * @param {Record<string, string|undefined|null>} [opts.query]
 * @param {number} [opts.timeoutMs] — override default timeout for this request
 * @returns {Promise<{ok: boolean, status: number, data?: unknown, error?: string}>}
 */
async function velaApiRequest(path, opts = {}) {
  if (!VELA_API_URL) {
    return { ok: false, status: 503, error: "Vela backend not configured (VELA_API_URL)" };
  }

  const method = opts.method || "GET";
  const url = new URL(`${VELA_API_URL}/api/${path.replace(/^\//, "")}`);
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const timeoutMs = timeoutMsForPath(path, opts.timeoutMs);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const init = {
      method,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    };
    if (opts.body !== undefined) {
      init.body = JSON.stringify(opts.body);
    }

    const resp = await fetch(url.toString(), init);
    clearTimeout(timeout);

    const text = await resp.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!resp.ok) {
      const rawDetail =
        data && typeof data === "object" && data.detail
          ? data.detail
          : `HTTP ${resp.status}`;
      return {
        ok: false,
        status: resp.status,
        error: formatVelaErrorDetail(rawDetail),
        data,
      };
    }

    return { ok: true, status: resp.status, data };
  } catch (err) {
    if (err.name === "AbortError") {
      return { ok: false, status: 504, error: `Vela request timed out after ${timeoutMs}ms` };
    }
    return { ok: false, status: 502, error: err.message };
  }
}

/**
 * @param {import("express").Response} response
 * @param {{ok: boolean, status: number, data?: unknown, error?: string}} result
 */
function sendVelaResult(response, result) {
  if (result.ok) {
    if (result.status === 204) {
      response.status(204).end();
      return;
    }
    response.status(result.status).json(result.data ?? {});
    return;
  }
  const detail =
    result.data && typeof result.data === "object" && result.data.detail
      ? result.data.detail
      : result.data;
  response.status(result.status).json({ error: result.error, detail });
}

/**
 * @param {object|null|undefined} user
 * @returns {string}
 */
function velaUserId(user) {
  if (user?.id !== undefined && user?.id !== null) return String(user.id);
  return "anonymous";
}

/**
 * AnythingLLM Prisma user ids are integers — Hub user ids (e.g. admin-user) are not.
 * @param {unknown} value
 * @returns {number|null}
 */
function parsePrismaUserId(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = {
  VELA_TIMEOUT_MS,
  VELA_ORCHESTRATOR_TIMEOUT_MS,
  formatVelaErrorDetail,
  velaApiRequest,
  sendVelaResult,
  velaUserId,
  parsePrismaUserId,
};
