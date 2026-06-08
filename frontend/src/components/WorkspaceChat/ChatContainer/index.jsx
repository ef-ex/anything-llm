import { useState, useEffect, useContext, useRef } from "react";
import ChatHistory from "./ChatHistory";
import { CLEAR_ATTACHMENTS_EVENT, DndUploaderContext } from "./DnDWrapper";
import PromptInput, {
  PROMPT_INPUT_EVENT,
  PROMPT_INPUT_ID,
} from "./PromptInput";
import Workspace from "@/models/workspace";
import handleChat, { ABORT_STREAM_EVENT } from "@/utils/chat";
import { isMobile } from "react-device-detect";
import { SidebarMobileHeader } from "../../Sidebar";
import { useNavigate, useSearchParams } from "react-router-dom";
import { v4 } from "uuid";
import handleSocketResponse, {
  websocketURI,
  AGENT_SESSION_END,
  AGENT_SESSION_START,
  setAgentSessionActive,
} from "@/utils/chat/agent";
import DnDFileUploaderWrapper from "./DnDWrapper";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { ChatTooltips } from "./ChatTooltips";
import { MetricsProvider } from "./ChatHistory/HistoricalMessage/Actions/RenderMetrics";
import useChatContainerQuickScroll from "@/hooks/useChatContainerQuickScroll";
import { PENDING_HOME_MESSAGE } from "@/utils/constants";
import { clearPromptInputDraft } from "@/hooks/usePromptInputStorage";
import { safeJsonParse } from "@/utils/request";
import { useTranslation } from "react-i18next";
import paths from "@/utils/paths";
import QuickActions from "@/components/lib/QuickActions";
import SuggestedMessages from "@/components/lib/SuggestedMessages";
import ChatSettingsMenu from "./ChatSettingsMenu";
import ChatContextHeader from "./ChatContextHeader";
import { ChatSidebarProvider } from "./ChatSidebar";
import SourcesSidebar from "./SourcesSidebar";
import MemoriesSidebar from "./MemoriesSidebar";
import VelaEntitiesSidebar from "./VelaEntitiesSidebar";
import { useOrchestratorChatContext } from "@/contexts/OrchestratorChatContext";
import Vela from "@/models/vela";
import {
  findOpenClarificationRun,
  isTerminalStatus,
  orchestratorMainThreadReply,
  orchestratorLiveStatusText,
  orchestratorRoutingReason,
  populateWorkerThreadChat,
  resolveOrchestratorPromptTurn,
  loadOrchestratorChatDraft,
  mergeOrchestratorChatHistory,
  saveOrchestratorChatDraft,
  saveOrchestratorChatDraftFinal,
  ensureWorkerThread,
  VELA_ORCHESTRATOR_DRAFT_EVENT,
} from "@/utils/orchestratorRuns";
import {
  isStudioCodeEmbed,
  resolveStoredRoleId,
  useOrchestratorChatForWorkspace,
} from "@/utils/studioCodeRole";
import { useStudioCodeContext, emitStudioCodeContextRefresh } from "@/contexts/StudioCodeContext";
import { contextFillBorderClass } from "@/utils/studioCodeContext";

export default function ChatContainer({
  workspace,
  threadSlug = null,
  knownHistory = [],
  embedded = false,
  showPromptInput = true,
  compactHeader: _compactHeader = false,
  hideContextHeader = false,
  layoutMode = null,
  onLayoutModeChange = null,
  showLayoutToggle = false,
  studioCodeResolvedRoleId = null,
  hideStudioCodeRolePicker = false,
  studioCodeSplitPaneIndex = null,
  studioCodeSplitPaneCount = 0,
  studioCodeAssistantRoleId = "",
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const studioCodeEmbed = isStudioCodeEmbed(searchParams);
  const orchestratorUx = useOrchestratorChatForWorkspace(searchParams, workspace);
  const studioCtx = useStudioCodeContext();
  const { t } = useTranslation();
  const [activeWorkspace, setActiveWorkspace] = useState(workspace);
  useEffect(() => {
    setActiveWorkspace(workspace);
  }, [workspace]);
  const [loadingResponse, setLoadingResponse] = useState(false);
  const [chatHistory, setChatHistory] = useState(() => {
    if (knownHistory?.length > 0) return knownHistory;
    if (embedded && orchestratorUx && workspace?.slug) {
      const draft = loadOrchestratorChatDraft(workspace.slug, threadSlug);
      if (Array.isArray(draft) && draft.length > 0) return draft;
    }
    return knownHistory ?? [];
  });
  const embeddedHistoryLoadedRef = useRef(!embedded);
  const studioCodeRolesRef = useRef({
    roles: [],
    defaultRoleId: "",
    assistantRoleId: "",
  });
  const orchestratorMode = !!workspace?.velaProjectId;

  useEffect(() => {
    setChatHistory(knownHistory);
    if (embedded && knownHistory?.length > 0) {
      embeddedHistoryLoadedRef.current = true;
    }
  }, [knownHistory, embedded]);

  useEffect(() => {
    if (!studioCodeEmbed || !workspace?.slug || !workspace?.velaProjectId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await Vela.listStudioCodeRoles(workspace.slug, {
          projectId: workspace.velaProjectId,
        });
        if (cancelled) return;
        studioCodeRolesRef.current = {
          roles: data?.roles || [],
          defaultRoleId: data?.default_role_id || "",
          assistantRoleId: data?.assistant_role_id || "",
        };
      } catch {
        /* optional preload */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studioCodeEmbed, workspace?.slug, workspace?.velaProjectId]);

  useEffect(() => {
    if (!embedded || !workspace?.slug) return;
    let cancelled = false;
    (async () => {
      const draft =
        orchestratorUx && workspace?.slug
          ? loadOrchestratorChatDraft(workspace.slug, threadSlug)
          : null;
      const serverHistory = threadSlug
        ? await Workspace.threads.chatHistory(workspace.slug, threadSlug)
        : await Workspace.chatHistory(workspace.slug);
      if (cancelled) return;
      const merged = mergeOrchestratorChatHistory(serverHistory, draft);
      setChatHistory((prev) => {
        if (prev.length > merged.length) return prev;
        return merged.length > 0 ? merged : prev;
      });
      embeddedHistoryLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [embedded, workspace?.slug, threadSlug, orchestratorUx]);

  useEffect(() => {
    if (!orchestratorUx || !workspace?.slug) return;
    if (embedded && !embeddedHistoryLoadedRef.current && chatHistory.length === 0) {
      return;
    }
    saveOrchestratorChatDraft(workspace.slug, threadSlug, chatHistory);
  }, [chatHistory, orchestratorUx, workspace?.slug, threadSlug, embedded]);

  useEffect(() => {
    if (!orchestratorUx || !workspace?.slug) return;
    const onDraft = (event) => {
      const { workspaceSlug, threadSlug: slug } = event.detail || {};
      if (workspaceSlug !== workspace.slug || slug !== threadSlug) return;
      const draft = loadOrchestratorChatDraft(workspace.slug, threadSlug);
      if (!Array.isArray(draft) || draft.length === 0) return;
      setChatHistory((prev) => mergeOrchestratorChatHistory(prev, draft));
    };
    window.addEventListener(VELA_ORCHESTRATOR_DRAFT_EVENT, onDraft);
    return () =>
      window.removeEventListener(VELA_ORCHESTRATOR_DRAFT_EVENT, onDraft);
  }, [orchestratorUx, workspace?.slug, threadSlug]);

  useEffect(() => {
    return () => {
      if (orchestratorUx && workspace?.slug) {
        saveOrchestratorChatDraft(
          workspace.slug,
          threadSlug,
          chatHistoryForReplyRef.current
        );
      }
    };
  }, [orchestratorUx, workspace?.slug, threadSlug]);

  const [socketId, setSocketId] = useState(null);
  const [websocket, setWebsocket] = useState(null);
  const { files, parseAttachments } = useContext(DndUploaderContext);
  const { chatHistoryRef } = useChatContainerQuickScroll();
  const pendingMessageChecked = useRef(false);
  const pendingResetRef = useRef(false);
  const orchestratorReplyInFlight = useRef(false);
  const chatHistoryForReplyRef = useRef(chatHistory);
  const runsByParentIdRef = useRef({});
  chatHistoryForReplyRef.current = chatHistory;
  const orchestratorApi = useOrchestratorChatContext();
  const runsByParentId = orchestratorApi?.runsByParentId ?? {};
  const resumingRunId = orchestratorApi?.resumingRunId ?? null;
  const submitOrchestratorPrompt =
    orchestratorApi?.submitOrchestratorPrompt ?? (async () => null);
  const resumeRun = orchestratorApi?.resumeRun ?? (async () => null);
  runsByParentIdRef.current = runsByParentId;

  useEffect(() => {
    if (!orchestratorUx) return;
    const activeRun = Object.values(runsByParentId).find(
      (r) =>
        r &&
        (r.status === "classifying" ||
          r.status === "queued" ||
          r.status === "running")
    );
    if (!activeRun) return;
    const reason =
      orchestratorLiveStatusText(activeRun) ||
      (activeRun.status === "queued" || activeRun.status === "running"
        ? "Vela is thinking…"
        : "");
    setChatHistory((prev) => {
      if (!prev.some((m) => m.velaOrchestratorPending)) return prev;
      return prev.map((m) =>
        m.velaOrchestratorPending
          ? {
              ...m,
              velaRoutingReason: reason,
              velaOrchestratorRunId: activeRun.run_id,
              pending: true,
            }
          : m
      );
    });
  }, [runsByParentId, orchestratorUx]);

  useEffect(() => {
    if (!studioCodeEmbed || !workspace?.slug || !threadSlug) return;
    studioCtx?.refreshThread(threadSlug);
  }, [
    studioCodeEmbed,
    workspace?.slug,
    threadSlug,
    chatHistory,
    studioCtx,
  ]);

  useEffect(() => {
    if (!studioCodeEmbed || !workspace?.slug || !threadSlug) return;
    emitStudioCodeContextRefresh(workspace.slug, threadSlug);
  }, [studioCodeEmbed, workspace?.slug, threadSlug, chatHistory]);

  const contextPaneBorder =
    studioCodeEmbed && threadSlug && studioCtx?.enabled
      ? contextFillBorderClass(studioCtx.getFill(threadSlug).level)
      : "";

  const isEmpty =
    chatHistory.length === 0 && !sessionStorage.getItem(PENDING_HOME_MESSAGE);

  /**
   * Keep chat history bottom-padding in sync with the prompt input's
   * actual rendered height so expanding input never covers messages.
   */
  useEffect(() => {
    if (isEmpty) return;
    const wrapper = document.getElementById("prompt-input-wrapper");
    const chatEl = document.getElementById("chat-history");
    if (!wrapper || !chatEl) return;

    const observer = new ResizeObserver(([entry]) => {
      const inputHeight =
        entry.borderBoxSize?.[0]?.blockSize ?? entry.target.offsetHeight;
      chatEl.style.paddingBottom = `${inputHeight}px`;
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [isEmpty]);

  const { listening, resetTranscript } = useSpeechRecognition({
    clearTranscriptOnListen: true,
  });

  /**
   * Emit an update to the state of the prompt input without directly
   * passing a prop in so that it does not re-render constantly.
   * @param {string} messageContent - The message content to set
   * @param {'replace' | 'append'} writeMode - Replace current text or append to existing text (default: replace)
   */
  function setMessageEmit(messageContent = "", writeMode = "replace") {
    window.dispatchEvent(
      new CustomEvent(PROMPT_INPUT_EVENT, {
        detail: { messageContent, writeMode },
      })
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const currentMessage =
      document.getElementById(PROMPT_INPUT_ID)?.value || "";
    if (!currentMessage) return false;

    // Clear the localStorage draft for this thread/workspace so that if the
    // PromptInput remounts (empty→chat transition), it won't restore stale text
    clearPromptInputDraft(threadSlug ?? workspace.slug);

    const userEntry = {
      uuid: v4(),
      content: currentMessage,
      role: "user",
      attachments: parseAttachments(),
    };
    const prevChatHistory = orchestratorUx
      ? [
          ...chatHistory,
          userEntry,
          {
            uuid: v4(),
            role: "assistant",
            content: "",
            pending: true,
            velaOrchestratorPending: true,
            velaRoutingReason: "",
            closed: false,
          },
        ]
      : [
          ...chatHistory,
          userEntry,
          {
            content: "",
            role: "assistant",
            pending: true,
            userMessage: currentMessage,
            animate: true,
          },
        ];

    if (listening) {
      // Stop the mic if the send button is clicked
      endSTTSession();
    }
    setChatHistory(prevChatHistory);
    if (orchestratorUx) {
      saveOrchestratorChatDraft(workspace.slug, threadSlug, prevChatHistory);
    }
    setMessageEmit("");
    setLoadingResponse(true);
  };

  function endSTTSession() {
    SpeechRecognition.stopListening();
    resetTranscript();
  }

  const regenerateAssistantMessage = (chatId) => {
    const filteredHistory = chatHistory.slice(0, -1);
    const lastUserMessage = filteredHistory.findLast(
      (msg) => msg.role === "user"
    );
    Workspace.deleteChats(workspace.slug, [chatId])
      .then(() =>
        sendCommand({
          text: lastUserMessage.content,
          autoSubmit: true,
          history: filteredHistory,
          attachments: lastUserMessage?.attachments,
        })
      )
      .catch((e) => console.error(e));
  };

  /**
   * Send a command to the LLM prompt input.
   * @param {Object} options - Arguments to send to the LLM
   * @param {string} options.text - The text to send to the LLM
   * @param {boolean} options.autoSubmit - Determines if the text should be sent immediately or if it should be added to the message state (default: false)
   * @param {Object[]} options.history - The history of the chat prior to this message for overriding the current chat history
   * @param {Object[import("./DnDWrapper").Attachment]} options.attachments - The attachments to send to the LLM for this message
   * @param {'replace' | 'append' | 'prepend'} options.writeMode - Replace current text or append to existing text (default: replace)
   * @returns {void}
   */
  const sendCommand = async ({
    text = "",
    autoSubmit = false,
    history = [],
    attachments = [],
    writeMode = "replace",
  } = {}) => {
    // If we are not auto-submitting, we can just emit the text to the prompt input.
    if (!autoSubmit) {
      setMessageEmit(text, writeMode);
      return;
    }

    if (writeMode === "prepend") {
      const currentText = document.getElementById(PROMPT_INPUT_ID)?.value ?? "";
      text = currentText + " " + text;
    }

    // If we are auto-submitting in append mode
    // than we need to update text with whatever is in the prompt input + the text we are sending.
    // @note: `message` will not work here since it is not updated yet.
    // If text is still empty, after this, then we should just return.
    if (writeMode === "append") {
      const currentText = document.getElementById(PROMPT_INPUT_ID)?.value ?? "";
      text = currentText + text;
    }

    if (!text || text === "") return false;

    // Clear the localStorage draft so that if the PromptInput remounts
    // (e.g. /reset causing empty→chat or chat→empty transitions),
    // it won't restore stale text.
    clearPromptInputDraft(threadSlug ?? workspace.slug);

    // If we are auto-submitting
    // Then we can replace the current text since this is not accumulating.
    let prevChatHistory;
    if (history.length > 0) {
      // use pre-determined history chain.
      prevChatHistory = [
        ...history,
        {
          content: "",
          role: "assistant",
          pending: true,
          userMessage: text,
          attachments,
          animate: true,
        },
      ];
    } else {
      const userEntry = {
        uuid: v4(),
        content: text,
        role: "user",
        attachments,
      };
      prevChatHistory = orchestratorUx
        ? [
            ...chatHistory,
            userEntry,
            {
              uuid: v4(),
              role: "assistant",
              content: "",
              pending: true,
              velaOrchestratorPending: true,
              velaRoutingReason: "",
              closed: false,
            },
          ]
        : [
            ...chatHistory,
            userEntry,
            {
              content: "",
              role: "assistant",
              pending: true,
              userMessage: text,
              attachments,
              animate: true,
            },
          ];
    }

    setChatHistory(prevChatHistory);
    if (orchestratorUx) {
      saveOrchestratorChatDraft(workspace.slug, threadSlug, prevChatHistory);
    }
    setMessageEmit("");
    setLoadingResponse(true);
  };

  useEffect(() => {
    if (pendingMessageChecked.current || !workspace?.slug) return;
    pendingMessageChecked.current = true;

    const pending = safeJsonParse(sessionStorage.getItem(PENDING_HOME_MESSAGE));
    if (pending?.message) {
      setTimeout(() => {
        sessionStorage.removeItem(PENDING_HOME_MESSAGE);
        sendCommand({
          text: pending.message,
          attachments: pending.attachments || [],
          autoSubmit: true,
        });
      }, 100);
    }
  }, [workspace?.slug]);

  useEffect(() => {
    if (!loadingResponse) {
      orchestratorReplyInFlight.current = false;
      return;
    }

    async function fetchReply() {
      const history = chatHistoryForReplyRef.current;
      const { promptMessage, remHistory } = orchestratorUx
        ? resolveOrchestratorPromptTurn(history)
        : {
            promptMessage:
              history.length > 0 ? history[history.length - 1] : null,
            remHistory: history.length > 0 ? history.slice(0, -1) : [],
          };
      var _chatHistory = [...remHistory];

      if (orchestratorUx) {
        if (!promptMessage?.content?.trim()) {
          setLoadingResponse(false);
          return;
        }
      } else if (!promptMessage || !promptMessage?.userMessage) {
        setLoadingResponse(false);
        return;
      }

      if (orchestratorUx && promptMessage?.content) {
        if (orchestratorReplyInFlight.current) return;
        orchestratorReplyInFlight.current = true;
        saveOrchestratorChatDraft(
          workspace.slug,
          threadSlug,
          chatHistoryForReplyRef.current
        );

        const parentId =
          promptMessage.uuid || String(promptMessage.chatId || v4());
        const userText = promptMessage.content;
        const attachments = promptMessage.attachments ?? parseAttachments();
        const openClarification = findOpenClarificationRun(
          runsByParentIdRef.current
        );
        try {
          const finalRun = openClarification
            ? await resumeRun(openClarification, userText, {
                parentMessageId: parentId,
              })
            : await submitOrchestratorPrompt({
                userText,
                parentMessageId: parentId,
                history: remHistory,
                attachments,
                roleId: null,
                workflowId: null,
              });
          const assistantText = orchestratorMainThreadReply(finalRun);
          const routingReason =
            orchestratorRoutingReason(finalRun) || undefined;
          if (
            !studioCodeEmbed &&
            finalRun?.role_id &&
            finalRun.role_id !== "orchestrator" &&
            isTerminalStatus(finalRun.status)
          ) {
            await ensureWorkerThread(workspace.slug, {
              run: finalRun,
              parentThreadSlug: threadSlug,
            }).catch(() => {});
            if (finalRun.status === "completed") {
              await populateWorkerThreadChat(workspace.slug, finalRun).catch(
                (err) => console.warn("[vela] worker thread populate", err)
              );
            }
          }
          if (assistantText) {
            const writeback = await Vela.writebackOrchestratorChat(
              workspace.slug,
              {
                userMessage: userText,
                assistantMessage: assistantText,
                threadSlug,
                attachments,
              }
            );
            setChatHistory((prev) => {
              const last = prev[prev.length - 1];
              if (
                last?.role === "assistant" &&
                !last?.pending &&
                last?.content === assistantText
              ) {
                return prev;
              }
              const kept = prev.filter(
                (m) => !m.pending && !m.velaOrchestratorPending
              );
              const withRunId = kept.map((m, i) =>
                i === kept.length - 1 && m.role === "user"
                  ? {
                      ...m,
                      velaOrchestratorRunId: finalRun.run_id,
                      velaRoutingReason: routingReason || m.velaRoutingReason,
                    }
                  : m
              );
              const next = [
                ...withRunId,
                {
                  uuid: v4(),
                  role: "assistant",
                  content: assistantText,
                  chatId: writeback?.chatId,
                  closed: true,
                  pending: false,
                  velaOrchestratorRunId: finalRun.run_id,
                },
              ];
              saveOrchestratorChatDraftFinal(workspace.slug, threadSlug, next);
              return next;
            });
          } else {
            setChatHistory((prev) => prev.filter((m) => !m.pending));
          }
        } catch (err) {
          console.error(err);
          setChatHistory((prev) => [
            ...prev.filter((m) => !m.pending),
            {
              uuid: v4(),
              type: "abort",
              role: "assistant",
              content: err.message || "Orchestrator request failed.",
              closed: true,
              error: err.message,
              pending: false,
            },
          ]);
        } finally {
          orchestratorReplyInFlight.current = false;
          setLoadingResponse(false);
        }
        return;
      }

      // Override hook for new messages to now go to agents until the connection closes
      if (!!websocket) {
        if (!promptMessage || !promptMessage?.userMessage) return false;
        const attachments = promptMessage?.attachments ?? parseAttachments();
        window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));
        websocket.send(
          JSON.stringify({
            type: "awaitingFeedback",
            feedback: promptMessage?.userMessage,
            attachments,
          })
        );

        // /reset during an active agent session should end the session AND
        // clear the chat in a single action. The send above triggers the
        // server to abort the agent and close the socket; fall through to the
        // /reset flow below which resets memory + clears chat history.
        if (promptMessage.userMessage.trim() !== "/reset") return;
        pendingResetRef.current = true;
      }

      if (!promptMessage || !promptMessage?.userMessage) return false;

      // If running and edit or regeneration, this history will already have attachments
      // so no need to parse the current state.
      const attachments = promptMessage?.attachments ?? parseAttachments();
      window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));

      let studioCodeRoleId = null;
      if (studioCodeEmbed) {
        if (studioCodeResolvedRoleId) {
          studioCodeRoleId = studioCodeResolvedRoleId;
        } else {
          let { roles, defaultRoleId, assistantRoleId } =
            studioCodeRolesRef.current;
          if (!roles.length && workspace?.velaProjectId) {
            try {
              const data = await Vela.listStudioCodeRoles(workspace.slug, {
                projectId: workspace.velaProjectId,
              });
              roles = data?.roles || [];
              defaultRoleId = data?.default_role_id || "";
              assistantRoleId = data?.assistant_role_id || "";
              studioCodeRolesRef.current = {
                roles,
                defaultRoleId,
                assistantRoleId,
              };
            } catch {
              /* fall through */
            }
          }
          studioCodeRoleId =
            resolveStoredRoleId(
              workspace.slug,
              roles,
              defaultRoleId,
              threadSlug,
              {
                assistantRoleId:
                  studioCodeAssistantRoleId || assistantRoleId,
                splitPaneIndex: studioCodeSplitPaneIndex,
                splitPaneCount: studioCodeSplitPaneCount,
              }
            ) || null;
        }
      }

      await Workspace.multiplexStream({
        workspaceSlug: workspace.slug,
        threadSlug,
        prompt: promptMessage.userMessage,
        chatHandler: (chatResult) =>
          handleChat(
            chatResult,
            setLoadingResponse,
            setChatHistory,
            remHistory,
            _chatHistory,
            setSocketId
          ),
        attachments,
        roleId: studioCodeRoleId,
        studioCodeAgent: studioCodeEmbed,
      });
      return;
    }
    fetchReply();
  }, [
    loadingResponse,
    workspace,
    orchestratorUx,
    studioCodeEmbed,
    studioCodeResolvedRoleId,
    studioCodeAssistantRoleId,
    studioCodeSplitPaneIndex,
    studioCodeSplitPaneCount,
    submitOrchestratorPrompt,
    resumeRun,
    threadSlug,
    websocket,
  ]);

  // TODO: Simplify this WSS stuff
  useEffect(() => {
    let socket = null;

    function handleWSS() {
      try {
        if (!socketId || !!websocket) return;
        socket = new WebSocket(
          `${websocketURI()}/api/agent-invocation/${socketId}`
        );
        socket.supportsAgentStreaming = false;

        window.addEventListener(ABORT_STREAM_EVENT, () => {
          setAgentSessionActive(false);
          window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
          socket?.close();
        });

        socket.addEventListener("message", (event) => {
          setLoadingResponse(true);
          try {
            handleSocketResponse(socket, event, setChatHistory);
          } catch {
            console.error("Failed to parse data");
            setAgentSessionActive(false);
            window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
            socket.close();
          }
          setLoadingResponse(false);
        });

        socket.addEventListener("close", (_event) => {
          setAgentSessionActive(false);
          window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
          // When the close was triggered by /reset, skip the "Agent session
          // complete." status - the pending /reset flow will clear history.
          if (pendingResetRef.current) {
            pendingResetRef.current = false;
          } else {
            setChatHistory((prev) => [
              ...prev.filter((msg) => !!msg.content),
              {
                uuid: v4(),
                type: "statusResponse",
                content: "Agent session complete.",
                role: "assistant",
                sources: [],
                closed: true,
                error: null,
                animate: false,
                pending: false,
              },
            ]);
          }
          setLoadingResponse(false);
          setWebsocket(null);
          setSocketId(null);
        });
        setWebsocket(socket);
        setAgentSessionActive(true);
        window.dispatchEvent(new CustomEvent(AGENT_SESSION_START));
        window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));
      } catch (e) {
        setChatHistory((prev) => [
          ...prev.filter((msg) => !!msg.content),
          {
            uuid: v4(),
            type: "abort",
            content: e.message,
            role: "assistant",
            sources: [],
            closed: true,
            error: e.message,
            animate: false,
            pending: false,
          },
        ]);
        setLoadingResponse(false);
        setWebsocket(null);
        setSocketId(null);
      }
    }
    handleWSS();

    return () => {
      if (socket) {
        setAgentSessionActive(false);
        window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
        socket.close();
      }
    };
  }, [socketId]);

  const outerClass = embedded
    ? "relative flex w-full h-full z-[1]"
    : "relative flex md:ml-[2px] md:mr-[16px] md:my-[16px] w-full h-full z-[2]";
  const innerClass = embedded
    ? `flex-1 min-w-0 relative w-full h-full overflow-hidden bg-zinc-900 light:bg-white ${contextPaneBorder}`
    : `flex-1 min-w-0 transition-all duration-500 relative md:rounded-[16px] bg-zinc-900 light:bg-white w-full h-full overflow-hidden border-none light:border-solid light:border light:border-theme-modal-border ${contextPaneBorder}`;
  const heightStyle = embedded
    ? { height: "100%" }
    : { height: isMobile ? "100%" : "calc(100% - 32px)" };

  if (isEmpty) {
    return (
      <ChatSidebarProvider>
        <div style={heightStyle} className={outerClass}>
          {!embedded && <ChatSettingsMenu workspaceSlug={workspace.slug} />}
          <div className={innerClass}>
            {isMobile && !embedded && <SidebarMobileHeader />}
            {!hideContextHeader && (
              <ChatContextHeader
                workspace={activeWorkspace}
                threadSlug={threadSlug}
                layoutMode={layoutMode}
                onLayoutModeChange={onLayoutModeChange}
                showLayoutToggle={showLayoutToggle}
              />
            )}
            <DnDFileUploaderWrapper>
              <div className="flex flex-col h-full w-full items-center justify-center">
                <div className="flex flex-col items-center w-full max-w-[750px]">
                  <h1 className="text-white text-xl md:text-2xl mb-11 text-center">
                    {t("main-page.greeting")}
                  </h1>
                  {showPromptInput && (
                    <PromptInput
                      workspace={workspace}
                      submit={handleSubmit}
                      isStreaming={loadingResponse}
                      sendCommand={sendCommand}
                      attachments={files}
                      centered={true}
                      hideStudioCodeRolePicker={hideStudioCodeRolePicker}
                    />
                  )}
                  {!studioCodeEmbed && (
                    <QuickActions
                      hasAvailableWorkspace={!!workspace}
                      onCreateAgent={() =>
                        navigate(paths.settings.agentSkills())
                      }
                      onEditWorkspace={() =>
                        navigate(
                          paths.workspace.settings.generalAppearance(
                            workspace.slug
                          )
                        )
                      }
                      onUploadDocument={() =>
                        document.getElementById("dnd-chat-file-uploader")?.click()
                      }
                    />
                  )}
                </div>
                {!studioCodeEmbed && (
                  <SuggestedMessages
                    suggestedMessages={workspace?.suggestedMessages}
                    sendCommand={sendCommand}
                  />
                )}
              </div>
            </DnDFileUploaderWrapper>
            <ChatTooltips />
          </div>
          {!embedded && <MemoriesSidebar workspace={workspace} />}
          {!embedded && (
            <VelaEntitiesSidebar
              workspace={activeWorkspace}
              onWorkspaceUpdate={setActiveWorkspace}
            />
          )}
        </div>
      </ChatSidebarProvider>
    );
  }

  return (
    <ChatSidebarProvider>
      <div style={heightStyle} className={outerClass}>
        {!embedded && <ChatSettingsMenu workspaceSlug={workspace.slug} />}
        <div className={`${innerClass} text-white light:text-slate-900`}>
          {isMobile && !embedded && <SidebarMobileHeader />}
          {!hideContextHeader && (
            <ChatContextHeader
              workspace={activeWorkspace}
              threadSlug={threadSlug}
              layoutMode={layoutMode}
              onLayoutModeChange={onLayoutModeChange}
              showLayoutToggle={showLayoutToggle}
            />
          )}
          <DnDFileUploaderWrapper>
            <div className="flex flex-col h-full w-full pb-20 md:pb-0">
              <div className="contents">
                <MetricsProvider>
                  <ChatHistory
                    ref={chatHistoryRef}
                    history={chatHistory}
                    workspace={workspace}
                    sendCommand={sendCommand}
                    updateHistory={setChatHistory}
                    regenerateAssistantMessage={regenerateAssistantMessage}
                    websocket={websocket}
                    threadSlug={threadSlug}
                    embedded={embedded}
                    orchestratorRuns={orchestratorUx ? runsByParentId : {}}
                    hideOrchestratorChrome={studioCodeEmbed}
                    onOrchestratorResume={async (run, answer) => {
                      if (!orchestratorUx) return;
                      setLoadingResponse(true);
                      try {
                        const finalRun = await resumeRun(run, answer);
                        const assistantText =
                          orchestratorMainThreadReply(finalRun);
                        if (assistantText) {
                          const writeback =
                            await Vela.writebackOrchestratorChat(
                              workspace.slug,
                              {
                                userMessage: answer,
                                assistantMessage: assistantText,
                                threadSlug,
                              }
                            );
                          setChatHistory((prev) => [
                            ...prev.filter((m) => !m.pending),
                            {
                              uuid: v4(),
                              role: "assistant",
                              content: assistantText,
                              chatId: writeback?.chatId,
                              closed: true,
                              pending: false,
                            },
                          ]);
                        }
                      } catch (err) {
                        console.error(err);
                      }
                      setLoadingResponse(false);
                    }}
                    resumingRunId={resumingRunId}
                  />
                </MetricsProvider>
                {showPromptInput && (
                  <PromptInput
                    workspace={workspace}
                    submit={handleSubmit}
                    isStreaming={loadingResponse}
                    sendCommand={sendCommand}
                    attachments={files}
                    centered={false}
                    hideStudioCodeRolePicker={hideStudioCodeRolePicker}
                  />
                )}
              </div>
            </div>
          </DnDFileUploaderWrapper>
          <ChatTooltips />
        </div>
        {!embedded && <SourcesSidebar />}
        {!embedded && <MemoriesSidebar workspace={workspace} />}
        {!embedded && (
          <VelaEntitiesSidebar
            workspace={activeWorkspace}
            onWorkspaceUpdate={setActiveWorkspace}
          />
        )}
      </div>
    </ChatSidebarProvider>
  );
}
