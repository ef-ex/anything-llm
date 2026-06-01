import { useEffect, useRef, useState } from "react";
import { ThoughtChainComponent } from "../ChatHistory/ThoughtContainer";

/**
 * Vela orchestrator routing / planning — uses the same visual treatment as
 * AnythingLLM's built-in thought chain (not a separate yellow panel).
 */
export default function VelaReasoningBlock({
  reason,
  isThinking = false,
  messageId = null,
}) {
  const thinkingStartedAt = useRef(null);
  const [showAsThinking, setShowAsThinking] = useState(isThinking);

  useEffect(() => {
    if (isThinking) {
      thinkingStartedAt.current = Date.now();
      setShowAsThinking(true);
      return;
    }
    if (!thinkingStartedAt.current) {
      setShowAsThinking(false);
      return;
    }
    const minVisibleMs = 1200;
    const elapsed = Date.now() - thinkingStartedAt.current;
    if (elapsed >= minVisibleMs) {
      setShowAsThinking(false);
      return;
    }
    const timer = setTimeout(() => setShowAsThinking(false), minVisibleMs - elapsed);
    return () => clearTimeout(timer);
  }, [isThinking]);

  const visiblyThinking = isThinking || showAsThinking;
  const text = (reason || "").trim() || (visiblyThinking ? "Vela is thinking…" : "");
  if (!text) return null;

  const content = visiblyThinking
    ? `<thinking>${text}`
    : `<thinking>${text}</thinking>`;

  return (
    <div className="w-full mb-2">
      <ThoughtChainComponent content={content} messageId={messageId} />
    </div>
  );
}
