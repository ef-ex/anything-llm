import { THREAD_RENAME_EVENT } from "@/components/Sidebar/ActiveWorkspaces/ThreadContainer";
import { emitAssistantMessageCompleteEvent } from "@/components/contexts/TTSProvider";
import { applyAgentEvent, createAgentTimelineState } from "@/utils/agentEvents";
export const ABORT_STREAM_EVENT = "abort-chat-stream";

// For handling of chat responses in the frontend by their various types.
export default function handleChat(
  chatResult,
  setLoadingResponse,
  setChatHistory,
  remHistory,
  _chatHistory,
  setWebsocket
) {
  const {
    uuid: rawUuid,
    id: streamId,
    textResponse,
    type,
    sources = [],
    error,
    close,
    animate = false,
    chatId = null,
    action = null,
    metrics = {},
    routedTo = null,
    thought = null,
  } = chatResult;
  const uuid = rawUuid || streamId;

  if (type === "modelRouteNotification") {
    if (_chatHistory.some((chat) => chat.uuid === uuid && chat.velaAgent)) {
      return;
    }
    _chatHistory.push({
      type: "modelRouteNotification",
      uuid,
      routedTo,
      role: "assistant",
    });
    setChatHistory([..._chatHistory]);
    return;
  }

  if (type === "abort" || type === "statusResponse") {
    setLoadingResponse(false);
    setChatHistory([
      ...remHistory,
      {
        type,
        uuid,
        content: textResponse,
        role: "assistant",
        sources,
        closed: true,
        error,
        animate,
        pending: false,
        metrics,
      },
    ]);
    _chatHistory.push({
      type,
      uuid,
      content: textResponse,
      role: "assistant",
      sources,
      closed: true,
      error,
      animate,
      pending: false,
      metrics,
    });
  } else if (type === "textResponse") {
    setLoadingResponse(false);
    setChatHistory([
      ...remHistory,
      {
        uuid,
        content: textResponse,
        role: "assistant",
        sources,
        closed: close,
        error,
        animate: !close,
        pending: false,
        chatId,
        metrics,
      },
    ]);
    _chatHistory.push({
      uuid,
      content: textResponse,
      role: "assistant",
      sources,
      closed: close,
      error,
      animate: !close,
      pending: false,
      chatId,
      metrics,
    });
    emitAssistantMessageCompleteEvent(chatId);
  } else if (type === "agentEvent") {
    const hubEvent = chatResult.event;
    const chatIdx = _chatHistory.findIndex((chat) => chat.uuid === uuid);
    const base =
      chatIdx !== -1
        ? { ..._chatHistory[chatIdx] }
        : {
            uuid,
            role: "assistant",
            content: "",
            sources: [],
            closed: false,
            animate: true,
            pending: false,
            velaAgent: true,
            agentTimeline: createAgentTimelineState(),
          };
    const timeline = applyAgentEvent(
      base.agentTimeline || createAgentTimelineState(),
      hubEvent
    );
    if (
      hubEvent?.type === "message.delta" ||
      hubEvent?.type === "agent.completed"
    ) {
      base.content = timeline.message;
    }
    if (hubEvent?.type === "route.selected") {
      base.velaRoute = hubEvent.payload;
    }
    const updated = {
      ...base,
      velaAgent: true,
      agentTimeline: timeline,
      agentEvents: timeline.events,
      reasoning: timeline.reasoning,
      content: timeline.message || base.content || "",
    };
    if (chatIdx !== -1) {
      _chatHistory[chatIdx] = updated;
    } else {
      _chatHistory.push(updated);
    }
    setChatHistory([..._chatHistory]);
  } else if (type === "agentThought") {
    if (_chatHistory.some((chat) => chat.uuid === uuid && chat.velaAgent)) {
      return;
    }
    const thoughtText = thought || textResponse || "";
    const existingIdx = _chatHistory.findIndex(
      (chat) => chat.uuid === uuid && chat.type === "statusResponse"
    );
    if (existingIdx !== -1) {
      _chatHistory[existingIdx] = {
        ..._chatHistory[existingIdx],
        content: thoughtText,
        animate: animate !== false,
        pending: false,
      };
    } else {
      _chatHistory.push({
        uuid,
        type: "statusResponse",
        content: thoughtText,
        role: "assistant",
        sources: [],
        closed: false,
        error: null,
        animate: animate !== false,
        pending: false,
        metrics,
      });
    }
    setChatHistory([..._chatHistory]);
  } else if (
    type === "textResponseChunk" ||
    type === "finalizeResponseStream"
  ) {
    if (
      type === "textResponseChunk" &&
      _chatHistory.some((chat) => chat.uuid === uuid && chat.velaAgent)
    ) {
      return;
    }
    const chatIdx = _chatHistory.findIndex((chat) => chat.uuid === uuid);
    if (chatIdx !== -1) {
      const existingHistory = { ..._chatHistory[chatIdx] };
      let updatedHistory;

      // If the response is finalized, we can set the loading state to false.
      // and append the metrics to the history.
      if (type === "finalizeResponseStream") {
        updatedHistory = {
          ...existingHistory,
          closed: close,
          animate: !close,
          pending: false,
          chatId,
          metrics,
        };

        _chatHistory[chatIdx - 1] = { ..._chatHistory[chatIdx - 1], chatId }; // update prompt with chatID

        emitAssistantMessageCompleteEvent(chatId);
        setLoadingResponse(false);
      } else {
        updatedHistory = {
          ...existingHistory,
          content: existingHistory.content + textResponse,
          ...(sources && sources.length > 0 ? { sources } : {}),
          error,
          closed: close,
          animate: !close,
          pending: false,
          chatId,
          metrics,
        };
      }
      _chatHistory[chatIdx] = updatedHistory;
    } else {
      _chatHistory.push({
        uuid,
        sources,
        error,
        content: textResponse,
        role: "assistant",
        closed: close,
        animate: !close,
        pending: false,
        chatId,
        metrics,
      });
      if (type === "finalizeResponseStream") {
        setLoadingResponse(false);
      }
    }
    setChatHistory([..._chatHistory]);
  } else if (type === "agentInitWebsocketConnection") {
    setWebsocket(chatResult.websocketUUID);
  } else if (type === "stopGeneration") {
    const chatIdx = _chatHistory.length - 1;
    const existingHistory = { ..._chatHistory[chatIdx] };
    const updatedHistory = {
      ...existingHistory,
      sources: [],
      closed: true,
      error: null,
      animate: false,
      pending: false,
      metrics,
    };
    _chatHistory[chatIdx] = updatedHistory;

    setChatHistory([..._chatHistory]);
    setLoadingResponse(false);
  }

  // Action Handling via special 'action' attribute on response.
  if (action === "reset_chat") setChatHistory([]);

  // If thread was updated automatically based on chat prompt
  // then we can handle the updating of the thread here.
  if (action === "rename_thread") {
    if (!!chatResult?.thread?.slug && chatResult.thread.name) {
      window.dispatchEvent(
        new CustomEvent(THREAD_RENAME_EVENT, {
          detail: {
            threadSlug: chatResult.thread.slug,
            newName: chatResult.thread.name,
          },
        })
      );
    }
  }
}

export function isStreamTerminalChunk(chatResult) {
  if (!chatResult?.type) return false;
  return (
    chatResult.type === "finalizeResponseStream" ||
    chatResult.type === "abort" ||
    (chatResult.type === "textResponse" && chatResult.close)
  );
}

export function getWorkspaceSystemPrompt(workspace) {
  return (
    workspace?.openAiPrompt ??
    "Given the following conversation, relevant context, and a follow up question, reply with an answer to the current question the user is asking. Return only your response to the question given the above information following the users instructions as needed."
  );
}

export function chatQueryRefusalResponse(workspace) {
  return (
    workspace?.queryRefusalResponse ??
    "There is no relevant information in this workspace to answer your query."
  );
}
