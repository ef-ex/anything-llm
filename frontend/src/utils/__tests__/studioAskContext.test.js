import { describe, expect, test } from "vitest";
import {
  attachmentsToActionRefs,
  formatAskMessageWithContext,
} from "../studioAskContext";

describe("studioAskContext", () => {
  test("formats ask message with structured context block", () => {
    const message = formatAskMessageWithContext(
      [{ id: "t1", type: "task", label: "Rig character" }],
      "How do I finish this?"
    );
    expect(message).toContain("How do I finish this?");
    expect(message).toContain("Structured project context");
    expect(message).toContain('"type": "task"');
  });

  test("maps attachments to action refs", () => {
    const refs = attachmentsToActionRefs([
      {
        id: "task-1",
        type: "task",
        label: "Task A",
      },
      {
        id: "file-1",
        type: "file",
        label: "scene.blend",
        metadata: { path_ref: "assets/scene.blend" },
      },
    ]);
    expect(refs).toEqual([
      { type: "task", id: "task-1", label: "Task A" },
      { type: "file", id: "assets/scene.blend", label: "scene.blend" },
    ]);
  });
});
