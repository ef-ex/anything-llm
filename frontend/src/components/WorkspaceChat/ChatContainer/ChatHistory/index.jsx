import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  forwardRef,
} from "react";
import HistoricalMessage from "./HistoricalMessage";
import PromptReply from "./PromptReply";
import StatusResponse from "./StatusResponse";
import ToolApprovalRequest from "./ToolApprovalRequest";
import ClarifyingQuestionCard from "./ClarifyingQuestion";
import FileDownloadCard from "./FileDownloadCard";
import { useManageWorkspaceModal } from "../../../Modals/ManageWorkspace";
import ManageWorkspace from "../../../Modals/ManageWorkspace";
import { ArrowDown } from "@phosphor-icons/react";
import debounce from "lodash.debounce";
import Chartable from "./Chartable";
import ModelRouteNotification from "./ModelRouteNotification";
import Workspace from "@/models/workspace";
import { useParams } from "react-router-dom";
import paths from "@/utils/paths";
import Appearance from "@/models/appearance";
import useTextSize from "@/hooks/useTextSize";
import useChatHistoryScrollHandle from "@/hooks/useChatHistoryScrollHandle";
import { ThoughtExpansionProvider } from "./ThoughtContainer";
import { MessageActionsProvider } from "./MessageActionsContext";
import OrchestratorRunCard from "../OrchestratorRunCard";
import VelaReasoningBlock from "../VelaReasoningBlock";
import {
  isActiveOrchestratorStatus,
  orchestratorRunForUserMessage,
  orchestratorRoutingReason,
  shouldShowOrchestratorRunCard,
} from "@/utils/orchestratorRuns";

export default forwardRef(function (
  {
    history = [],
    workspace,
    sendCommand,
    updateHistory,
    regenerateAssistantMessage,
    websocket = null,
    orchestratorRuns = {},
    onOrchestratorResume = null,
    resumingRunId = null,
    threadSlug: threadSlugProp = null,
    embedded = false,
  },
  ref
) {
  const lastScrollTopRef = useRef(0);
  const chatHistoryRef = useRef(null);
  const { threadSlug: routeThreadSlug = null } = useParams();
  const threadSlug = threadSlugProp ?? routeThreadSlug;
  const { showing, hideModal } = useManageWorkspaceModal();
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const isStreaming = history[history.length - 1]?.animate;
  const { showScrollbar } = Appearance.getSettings();
  const { textSizeClass } = useTextSize();

  useEffect(() => {
    if (!isUserScrolling && (isAtBottom || isStreaming)) {
      scrollToBottom(false); // Use instant scroll for auto-scrolling
    }
  }, [history, isAtBottom, isStreaming, isUserScrolling]);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const isBottom = scrollHeight - scrollTop - clientHeight < 2;

    // Detect if this is a user-initiated scroll
    if (Math.abs(scrollTop - lastScrollTopRef.current) > 10) {
      setIsUserScrolling(!isBottom);
    }

    setIsAtBottom(isBottom);
    lastScrollTopRef.current = scrollTop;
  };

  const debouncedScroll = debounce(handleScroll, 100);

  useEffect(() => {
    const chatHistoryElement = chatHistoryRef.current;
    if (chatHistoryElement) {
      chatHistoryElement.addEventListener("scroll", debouncedScroll);
      return () =>
        chatHistoryElement.removeEventListener("scroll", debouncedScroll);
    }
  }, []);

  const scrollToBottom = (smooth = false) => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTo({
        top: chatHistoryRef.current.scrollHeight,

        // Smooth is on when user clicks the button but disabled during auto scroll
        // We must disable this during auto scroll because it causes issues with
        // detecting when we are at the bottom of the chat.
        ...(smooth ? { behavior: "smooth" } : {}),
      });
    }
  };

  useChatHistoryScrollHandle(ref, chatHistoryRef, {
    setIsUserScrolling,
    isStreaming,
    scrollToBottom,
  });

  const saveEditedMessage = async ({
    editedMessage,
    chatId,
    role,
    attachments = [],
    saveOnly = false,
  }) => {
    if (!editedMessage) return; // Don't save empty edits.

    // "Save" on a user message: update the prompt text without regenerating
    if (role === "user" && saveOnly) {
      const updatedHistory = [...history];
      const targetIdx = history.findIndex((msg) => msg.chatId === chatId);
      if (targetIdx < 0) return;
      updatedHistory[targetIdx].content = editedMessage;
      updateHistory(updatedHistory);
      await Workspace.updateChat(
        workspace.slug,
        threadSlug,
        chatId,
        editedMessage,
        "user"
      );
      return;
    }

    // "Submit" on a user message: auto-regenerate the response and delete all
    // messages post modified message
    if (role === "user") {
      // remove all messages after the edited message
      // technically there are two chatIds per-message pair, this will split the first.
      const updatedHistory = history.slice(
        0,
        history.findIndex((msg) => msg.chatId === chatId) + 1
      );

      // update last message in history to edited message
      updatedHistory[updatedHistory.length - 1].content = editedMessage;
      // remove all edited messages after the edited message in backend
      await Workspace.deleteEditedChats(workspace.slug, threadSlug, chatId);
      sendCommand({
        text: editedMessage,
        autoSubmit: true,
        history: updatedHistory,
        attachments,
      });
      return;
    }

    // If role is an assistant we simply want to update the comment and save on the backend as an edit.
    if (role === "assistant") {
      const updatedHistory = [...history];
      const targetIdx = history.findIndex(
        (msg) => msg.chatId === chatId && msg.role === role
      );
      if (targetIdx < 0) return;
      updatedHistory[targetIdx].content = editedMessage;
      updateHistory(updatedHistory);
      await Workspace.updateChat(
        workspace.slug,
        threadSlug,
        chatId,
        editedMessage
      );
      return;
    }
  };

  const forkThread = async (chatId) => {
    const newThreadSlug = await Workspace.forkThread(
      workspace.slug,
      threadSlug,
      chatId
    );
    window.location.href = paths.workspace.thread(
      workspace.slug,
      newThreadSlug
    );
  };

  const compiledHistory = useMemo(
    () =>
      buildMessages({
        workspace,
        history,
        regenerateAssistantMessage,
        saveEditedMessage,
        forkThread,
        websocket,
        orchestratorRuns,
        onOrchestratorResume,
        resumingRunId,
        threadSlug,
      }),
    [
      workspace,
      history,
      regenerateAssistantMessage,
      saveEditedMessage,
      forkThread,
      websocket,
      orchestratorRuns,
      onOrchestratorResume,
      resumingRunId,
      threadSlug,
    ]
  );
  const lastMessageInfo = useMemo(() => getLastMessageInfo(history), [history]);
  const renderStatusResponse = useCallback(
    (item, index) => {
      const hasSubsequentMessages = index < compiledHistory.length - 1;
      return (
        <StatusResponse
          key={`status-group-${index}`}
          messages={item}
          isThinking={!hasSubsequentMessages && lastMessageInfo.isAnimating}
        />
      );
    },
    [compiledHistory.length, lastMessageInfo]
  );

  return (
    <MessageActionsProvider>
      <ThoughtExpansionProvider>
        <div
          className={`markdown text-white/80 light:text-theme-text-primary font-light ${textSizeClass} ${embedded ? "h-full min-h-0" : "h-full md:h-[83%]"} pb-[100px] pt-6 md:pt-0 md:pb-20 md:mx-0 overflow-y-scroll flex flex-col items-center justify-start ${showScrollbar ? "show-scrollbar" : "no-scroll"}`}
          id="chat-history"
          ref={chatHistoryRef}
          onScroll={handleScroll}
        >
          <div className="w-full max-w-[750px]">
            {compiledHistory.map((item, index) =>
              Array.isArray(item) ? renderStatusResponse(item, index) : item
            )}
          </div>
          {showing && (
            <ManageWorkspace
              hideModal={hideModal}
              providedSlug={workspace.slug}
            />
          )}
        </div>
        {!isAtBottom && (
          <div className="absolute bottom-40 right-10 z-50 cursor-pointer animate-pulse">
            <div className="flex flex-col items-center">
              <div
                className="p-1 rounded-full border border-white/10 bg-white/10 hover:bg-white/20 hover:text-white"
                onClick={() => {
                  scrollToBottom(isStreaming ? false : true);
                  setIsUserScrolling(false);
                }}
              >
                <ArrowDown weight="bold" className="text-white/60 w-5 h-5" />
              </div>
            </div>
          </div>
        )}
      </ThoughtExpansionProvider>
    </MessageActionsProvider>
  );
});

const getLastMessageInfo = (history) => {
  const lastMessage = history?.[history.length - 1] || {};
  return {
    isAnimating: lastMessage?.animate,
    isStatusResponse: lastMessage?.type === "statusResponse",
  };
};

/**
 * Builds the history of messages for the chat.
 * This is mostly useful for rendering the history in a way that is easy to understand.
 * as well as compensating for agent thinking and other messages that are not part of the history, but
 * are still part of the chat.
 *
 * @param {Object} param0 - The parameters for building the messages.
 * @param {Array} param0.history - The history of messages.
 * @param {Object} param0.workspace - The workspace object.
 * @param {Function} param0.regenerateAssistantMessage - The function to regenerate the assistant message.
 * @param {Function} param0.saveEditedMessage - The function to save the edited message.
 * @param {Function} param0.forkThread - The function to fork the thread.
 * @param {WebSocket} param0.websocket - The active websocket connection for agent communication.
 * @returns {Array} The compiled history of messages.
 */
function buildMessages({
  history,
  workspace,
  regenerateAssistantMessage,
  saveEditedMessage,
  forkThread,
  websocket,
  orchestratorRuns = {},
  onOrchestratorResume = null,
  resumingRunId = null,
  threadSlug = null,
}) {
  return history.reduce((acc, props, index) => {
    const isLastBotReply =
      index === history.length - 1 && props.role === "assistant";

    if (props?.type === "statusResponse" && !!props.content) {
      if (acc.length > 0 && Array.isArray(acc[acc.length - 1])) {
        acc[acc.length - 1].push(props);
      } else {
        acc.push([props]);
      }
      return acc;
    }

    if (props.type === "modelRouteNotification") {
      const lastMsg = history[history.length - 1];
      const isLast =
        index === history.length - 1 ||
        (index === history.length - 2 &&
          (lastMsg?.animate || lastMsg?.pending));
      const isStreaming =
        isLast &&
        (index === history.length - 1 || lastMsg?.animate || lastMsg?.pending);
      acc.push(
        <ModelRouteNotification
          key={`route-${props.uuid}`}
          routedTo={props.routedTo}
          isStreaming={isStreaming}
        />
      );
      return acc;
    }

    if (props.type === "toolApprovalRequest") {
      acc.push(
        <ToolApprovalRequest
          key={`tool-approval-${props.requestId}`}
          requestId={props.requestId}
          skillName={props.skillName}
          payload={props.payload}
          description={props.description}
          timeoutMs={props.timeoutMs}
          websocket={websocket}
        />
      );
      return acc;
    }

    if (props.type === "clarifyingQuestion") {
      acc.push(
        <ClarifyingQuestionCard
          key={`clarify-${props.requestId}`}
          requestId={props.requestId}
          questions={props.questions}
          allowSkip={props.allowSkip}
          timeoutMs={props.timeoutMs}
          websocket={websocket}
        />
      );
      return acc;
    }

    if (props.type === "rechartVisualize" && !!props.content) {
      acc.push(<Chartable key={props.uuid} props={props} />);
    } else if (props.type === "fileDownloadCard" && !!props.content) {
      acc.push(<FileDownloadCard key={props.uuid} props={props} />);
    } else if (props.velaOrchestratorPending && props.pending) {
      acc.push(
        <div key={`vela-pending-${props.uuid || index}`} className="w-full flex justify-start px-4 py-2">
          <div className="w-full max-w-[85%]">
            <VelaReasoningBlock
              reason={props.velaRoutingReason || "Vela is thinking…"}
              isThinking
              messageId={props.uuid}
            />
          </div>
        </div>
      );
      return acc;
    } else if (isLastBotReply && props.animate) {
      acc.push(
        <PromptReply
          key={`prompt-reply-${props.uuid || index}`}
          uuid={props.uuid}
          reply={props.content}
          pending={props.pending}
          sources={props.sources}
          error={props.error}
          closed={props.closed}
        />
      );
    } else {
      let resolvedRoutingReason = props.velaRoutingReason;
      const userMsgForRun =
        props.role === "assistant"
          ? history
              .slice(0, index)
              .reverse()
              .find((m) => m?.role === "user")
          : null;
      const runForTurn =
        props.role === "user"
          ? orchestratorRunForUserMessage(orchestratorRuns, props)
          : orchestratorRunForUserMessage(orchestratorRuns, userMsgForRun);
      if (props.role === "assistant" && runForTurn) {
        resolvedRoutingReason = undefined;
      }
      acc.push(
        <HistoricalMessage
          key={index}
          uuid={props.uuid}
          message={props.content}
          role={props.role}
          workspace={workspace}
          sources={props.sources}
          feedbackScore={props.feedbackScore}
          chatId={props.chatId}
          error={props.error}
          attachments={props.attachments}
          regenerateMessage={regenerateAssistantMessage}
          isLastMessage={isLastBotReply}
          saveEditedMessage={saveEditedMessage}
          forkThread={forkThread}
          metrics={props.metrics}
          outputs={props.outputs}
          clarifyingQuestions={props.clarifyingQuestions}
          velaRoutingReason={resolvedRoutingReason}
        />
      );
      if (props.role === "user") {
        const run = runForTurn;
        const routing = run
          ? orchestratorRoutingReason(run)
          : (props.velaRoutingReason ? String(props.velaRoutingReason).trim() : "");
        if (routing && (!run || !isActiveOrchestratorStatus(run.status))) {
          acc.push(
            <VelaReasoningBlock
              key={`vela-reasoning-${run.run_id}`}
              reason={routing}
              isThinking={false}
              messageId={props.uuid}
            />
          );
        }
        if (run && shouldShowOrchestratorRunCard(run)) {
          acc.push(
            <OrchestratorRunCard
              key={`orch-${run.run_id}`}
              run={run}
              workspaceSlug={workspace.slug}
              parentThreadSlug={threadSlug}
            />
          );
        }
      }
    }
    return acc;
  }, []);
}
