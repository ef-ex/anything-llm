import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import { Plus, CircleNotch, Trash } from "@phosphor-icons/react";
import { useEffect, useState, useCallback } from "react";
import ThreadItem from "./ThreadItem";
import { useParams, useSearchParams } from "react-router-dom";
import {
  isWorkerThreadSlug,
  repairWorkerThreadParentsAsync,
  sortThreadsWithWorkerChildren,
  VELA_WORKER_THREAD_EVENT,
} from "@/utils/orchestratorRuns";
import { isStudioCodeEmbed, studioCodeThreadPath } from "@/utils/studioCodeRole";
import { MAX_STUDIO_CODE_SPLIT_PANES } from "@/utils/studioCodeSplit";
export const THREAD_RENAME_EVENT = "renameThread";

export default function ThreadContainer({
  workspace,
  splitThreadSlugs = null,
  onSplitToggle = null,
}) {
  const { threadSlug = null } = useParams();
  const [searchParams] = useSearchParams();
  const studioCode = isStudioCodeEmbed(searchParams);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ctrlPressed, setCtrlPressed] = useState(false);

  useEffect(() => {
    const chatHandler = (event) => {
      const { threadSlug, newName } = event.detail;
      setThreads((prevThreads) =>
        prevThreads.map((thread) => {
          if (thread.slug === threadSlug) {
            return { ...thread, name: newName };
          }
          return thread;
        })
      );
    };

    window.addEventListener(THREAD_RENAME_EVENT, chatHandler);

    return () => {
      window.removeEventListener(THREAD_RENAME_EVENT, chatHandler);
    };
  }, []);

  const fetchThreads = useCallback(async () => {
    if (!workspace.slug) return;
    if (!studioCode) {
      await repairWorkerThreadParentsAsync(workspace.slug);
    }
    const { threads } = await Workspace.threads.all(workspace.slug);
    setLoading(false);
    const visible = studioCode
      ? (threads || []).filter(
          (t) => !isWorkerThreadSlug(workspace.slug, t.slug)
        )
      : threads;
    setThreads(
      studioCode ? visible : sortThreadsWithWorkerChildren(visible, workspace.slug)
    );
  }, [workspace.slug, studioCode]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    const onWorkerThread = (event) => {
      if (event.detail?.workspaceSlug === workspace.slug) {
        fetchThreads();
      }
    };
    window.addEventListener(VELA_WORKER_THREAD_EVENT, onWorkerThread);
    return () => window.removeEventListener(VELA_WORKER_THREAD_EVENT, onWorkerThread);
  }, [workspace.slug, fetchThreads]);

  // Enable toggling of bulk-deletion by holding meta-key (ctrl on win and cmd/fn on others)
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (["Control", "Meta"].includes(event.key)) {
        setCtrlPressed(true);
      }
    };

    const handleKeyUp = (event) => {
      if (["Control", "Meta"].includes(event.key)) {
        setCtrlPressed(false);
        // when toggling, unset bulk progress so
        // previously marked threads that were never deleted
        // come back to life.
        setThreads((prev) =>
          prev.map((t) => {
            return { ...t, deleted: false };
          })
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const toggleForDeletion = (id) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return { ...t, deleted: !t.deleted };
      })
    );
  };

  const handleDeleteAll = async () => {
    const slugs = threads.filter((t) => t.deleted === true).map((t) => t.slug);
    await Workspace.threads.deleteBulk(workspace.slug, slugs);
    setThreads((prev) => prev.filter((t) => !t.deleted));

    if (slugs.includes(threadSlug)) {
      const remaining = threads.filter(
        (t) => !t.deleted && !slugs.includes(t.slug)
      );
      if (remaining.length > 0) {
        window.location.href = studioCodeThreadPath(
          workspace.slug,
          remaining[0].slug
        );
        return;
      }
      const { thread, error } = await Workspace.threads.new(workspace.slug);
      if (thread) {
        window.location.href = studioCodeThreadPath(workspace.slug, thread.slug);
      } else {
        console.warn("[vela] thread recreate after delete failed:", error);
        window.location.href = paths.home();
      }
    }
  };

  function removeThread(threadId) {
    setThreads((prev) =>
      prev.map((_t) => {
        if (_t.id !== threadId) return _t;
        return { ..._t, deleted: true };
      })
    );

    // Show thread was deleted, but then remove from threads entirely so it will
    // not appear in bulk-selection.
    setTimeout(() => {
      setThreads((prev) => prev.filter((t) => !t.deleted));
    }, 500);
  }

  function getActiveThreadIdx() {
    return threads.findIndex((t) => t?.slug === threadSlug);
  }

  if (loading) {
    return (
      <div className="flex flex-col bg-pulse w-full h-10 items-center justify-center">
        <p className="text-xs text-white animate-pulse">loading threads....</p>
      </div>
    );
  }

  const activeThreadIdx = getActiveThreadIdx();
  const splitSet = new Set(splitThreadSlugs || []);
  const splitAtCap = splitSet.size >= MAX_STUDIO_CODE_SPLIT_PANES;

  return (
    <div className="flex flex-col" role="list" aria-label="Threads">
      {studioCode && onSplitToggle && (
        <p className="text-[10px] text-zinc-400 light:text-slate-500 px-3 pb-2 leading-snug">
          Check sessions to show side by side (up to {MAX_STUDIO_CODE_SPLIT_PANES}).
        </p>
      )}
      {threads.map((thread, i) => (
        <ThreadItem
          key={thread.slug}
          idx={i}
          ctrlPressed={ctrlPressed}
          toggleMarkForDeletion={toggleForDeletion}
          activeIdx={activeThreadIdx}
          isActive={activeThreadIdx === i}
          workspace={workspace}
          onRemove={removeThread}
          thread={thread}
          isWorkerChild={
            !studioCode && isWorkerThreadSlug(workspace.slug, thread.slug)
          }
          hasNext={i !== threads.length - 1}
          showSplitCheckbox={studioCode && !!onSplitToggle}
          splitChecked={splitSet.has(thread.slug)}
          splitCheckboxDisabled={
            splitAtCap && !splitSet.has(thread.slug)
          }
          onSplitCheckboxChange={(checked) =>
            onSplitToggle?.(thread.slug, checked)
          }
        />
      ))}
      <DeleteAllThreadButton
        ctrlPressed={ctrlPressed}
        threads={threads}
        onDelete={handleDeleteAll}
      />
      <NewThreadButton workspace={workspace} studioCode={studioCode} />
    </div>
  );
}

function NewThreadButton({ workspace, studioCode = false }) {
  const [loading, setLoading] = useState(false);
  const onClick = async () => {
    setLoading(true);
    const { thread, error } = await Workspace.threads.new(workspace.slug);
    if (!!error) {
      showToast(`Could not create thread - ${error}`, "error", { clear: true });
      setLoading(false);
      return;
    }
    window.location.replace(
      studioCode
        ? studioCodeThreadPath(workspace.slug, thread.slug)
        : paths.workspace.thread(workspace.slug, thread.slug)
    );
  };

  return (
    <button
      onClick={onClick}
      className="w-full relative flex h-[40px] items-center border-none hover:bg-[var(--theme-sidebar-thread-selected)] light:hover:bg-slate-300 hover:light:bg-theme-sidebar-subitem-hover rounded-lg"
    >
      <div className="flex w-full gap-x-2 items-center pl-4">
        <div className="bg-zinc-800 light:bg-slate-50 p-2 rounded-lg h-[24px] w-[24px] flex items-center justify-center">
          {loading ? (
            <CircleNotch
              weight="bold"
              size={14}
              className="shrink-0 animate-spin text-white light:text-theme-text-primary"
            />
          ) : (
            <Plus
              weight="bold"
              size={14}
              className="shrink-0 text-white light:text-theme-text-primary"
            />
          )}
        </div>

        {loading ? (
          <p className="text-left text-white light:text-theme-text-primary text-sm">
            Starting Thread...
          </p>
        ) : (
          <p className="text-left text-white light:text-theme-text-primary text-sm font-semibold">
            New Thread
          </p>
        )}
      </div>
    </button>
  );
}

function DeleteAllThreadButton({ ctrlPressed, threads, onDelete }) {
  if (!ctrlPressed || threads.filter((t) => t.deleted).length === 0)
    return null;
  return (
    <button
      type="button"
      onClick={onDelete}
      className="w-full relative flex h-[40px] items-center border-none hover:bg-red-400/20 rounded-lg group"
    >
      <div className="flex w-full gap-x-2 items-center pl-4">
        <div className="bg-transparent p-2 rounded-lg h-[24px] w-[24px] flex items-center justify-center">
          <Trash
            weight="bold"
            size={14}
            className="shrink-0 text-white light:text-red-500/50 group-hover:text-red-400"
          />
        </div>
        <p className="text-white light:text-theme-text-secondary text-left text-sm group-hover:text-red-400">
          Delete Selected
        </p>
      </div>
    </button>
  );
}
