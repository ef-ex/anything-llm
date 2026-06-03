/**
 * M35 — skip local RAG / embedding for vela-dispatch chat mode.
 */

function isVelaDispatchFastPath(workspace, chatMode = "automatic") {
  if (process.env.VELA_DISPATCH_SKIP_RAG === "0") return false;
  const effectiveProvider = workspace?.chatProvider || process.env.LLM_PROVIDER;
  if (effectiveProvider !== "vela-dispatch") return false;
  const mode = chatMode || "automatic";
  return mode !== "query";
}

function shouldIncludePinnedOnFastPath(attachments = []) {
  if (process.env.VELA_DISPATCH_INCLUDE_PINNED === "1") return true;
  return Array.isArray(attachments) && attachments.length > 0;
}

function emptyVectorSearchResult() {
  return { contextTexts: [], sources: [], message: null };
}

module.exports = {
  isVelaDispatchFastPath,
  shouldIncludePinnedOnFastPath,
  emptyVectorSearchResult,
};
