const { velaApiRequest } = require("../../velaApi");

function parseResponseData(record) {
  try {
    const data = JSON.parse(record.response);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function needsHubAgentReload(data) {
  const runId = data?.runId;
  if (!runId || typeof runId !== "string") return false;
  const events = data.agentEvents;
  if (!Array.isArray(events) || events.length === 0) return true;
  const hasTerminal = events.some(
    (e) => e?.type === "agent.completed" || e?.type === "agent.failed"
  );
  const hasTimeline = events.some(
    (e) =>
      e?.type === "reasoning.delta" ||
      e?.type === "message.delta" ||
      e?.type === "tool.call.started"
  );
  return !hasTerminal || !hasTimeline;
}

/**
 * Enrich saved chat rows with Hub agent_run_events when local agentEvents are missing.
 * @param {object[]} history
 * @returns {Promise<object[]>}
 */
async function enrichHistoryWithHubAgentEvents(history = []) {
  if (!Array.isArray(history) || history.length === 0) return history;

  const tasks = history.map(async (record) => {
    const data = parseResponseData(record);
    if (!data || !needsHubAgentReload(data)) return record;

    const result = await velaApiRequest(
      `agent/runs/${encodeURIComponent(data.runId)}/events`,
      { timeoutMs: 10000 }
    );
    if (
      !result.ok ||
      !Array.isArray(result.data?.events) ||
      result.data.events.length === 0
    ) {
      return record;
    }

    const merged = {
      ...data,
      agentEvents: result.data.events,
      runId: result.data.run_id || data.runId,
      velaAgent: true,
    };
    return { ...record, response: JSON.stringify(merged) };
  });

  return Promise.all(tasks);
}

module.exports = {
  enrichHistoryWithHubAgentEvents,
  needsHubAgentReload,
};
