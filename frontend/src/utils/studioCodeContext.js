/** Studio Code — per-agent context window fill (M49.5). */

import Workspace from "@/models/workspace";

export const STUDIO_CODE_CONTEXT_WARN_RATIO = 0.5;
export const STUDIO_CODE_CONTEXT_DANGER_RATIO = 0.8;

/** Rough token estimate from chat message text (matches server tiktoken ballpark). */
export function estimateTokensFromMessages(history) {
  if (!Array.isArray(history)) return 0;
  let tokens = 0;
  for (const item of history) {
    const text =
      typeof item?.content === "string"
        ? item.content
        : typeof item?.userMessage === "string"
          ? item.userMessage
          : "";
    if (text) tokens += Math.ceil(text.length / 4);
  }
  return tokens;
}

export function contextFillRatio(currentTokens, contextWindow) {
  if (!contextWindow || !Number.isFinite(contextWindow) || contextWindow <= 0) {
    return 0;
  }
  const used = Number(currentTokens) || 0;
  return Math.min(1, used / contextWindow);
}

export function contextFillLevel(ratio) {
  if (ratio >= STUDIO_CODE_CONTEXT_DANGER_RATIO) return "danger";
  if (ratio >= STUDIO_CODE_CONTEXT_WARN_RATIO) return "warn";
  return "normal";
}

export function contextFillBorderClass(level) {
  if (level === "danger") {
    return "border-l-4 border-l-red-500";
  }
  if (level === "warn") {
    return "border-l-4 border-l-amber-400";
  }
  return "";
}

export async function fetchThreadContextFill(workspaceSlug, threadSlug) {
  if (!workspaceSlug || !threadSlug) {
    return { ratio: 0, level: "normal", currentTokens: 0, contextWindow: 0 };
  }
  try {
    const [parsed, history] = await Promise.all([
      Workspace.getParsedFiles(workspaceSlug, threadSlug),
      Workspace.threads.chatHistory(workspaceSlug, threadSlug),
    ]);
    const contextWindow = parsed?.contextWindow || 0;
    const fileTokens = parsed?.currentContextTokenCount || 0;
    const chatTokens = estimateTokensFromMessages(history);
    const currentTokens = fileTokens + chatTokens;
    const ratio = contextFillRatio(currentTokens, contextWindow);
    return {
      ratio,
      level: contextFillLevel(ratio),
      currentTokens,
      contextWindow,
    };
  } catch {
    return { ratio: 0, level: "normal", currentTokens: 0, contextWindow: 0 };
  }
}
