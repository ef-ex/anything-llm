const {
  isVelaAgentWorkspace,
  streamVelaAgent,
} = require("./velaAgentRuntime");
const { shouldUseCodeAgentLoop } = require("./velaCodeWorkspace");

/**
 * @deprecated Use streamVelaAgent from velaAgentRuntime.js directly.
 * Kept as a thin compatibility export for existing imports.
 */
async function streamCodeAgent(params) {
  return streamVelaAgent({
    ...params,
    options: {
      ...params.options,
      studioCodeAgent: true,
      mode: "code",
    },
  });
}

module.exports = {
  shouldUseCodeAgentLoop,
  streamCodeAgent,
};
