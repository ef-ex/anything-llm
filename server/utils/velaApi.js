/**
 * Vela backend HTTP client for AnythingLLM proxy routes.
 *
 * Uses VELA_API_URL and VELA_TIMEOUT_MS (same as velaContext.js).
 */

const { VELA_API_URL } = require("./velaContext");

const VELA_TIMEOUT_MS = parseInt(process.env.VELA_TIMEOUT_MS || "5000", 10);

/**
 * @param {string} path — path after /api (e.g. "projects" or "entities/resolve")
 * @param {Object} [opts]
 * @param {string} [opts.method]
 * @param {Object} [opts.body]
 * @param {Record<string, string|undefined|null>} [opts.query]
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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VELA_TIMEOUT_MS);
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
      const detail =
        data && typeof data === "object" && data.detail
          ? data.detail
          : `HTTP ${resp.status}`;
      return { ok: false, status: resp.status, error: String(detail), data };
    }

    return { ok: true, status: resp.status, data };
  } catch (err) {
    if (err.name === "AbortError") {
      return { ok: false, status: 504, error: `Vela request timed out after ${VELA_TIMEOUT_MS}ms` };
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

module.exports = {
  velaApiRequest,
  sendVelaResult,
  velaUserId,
};
