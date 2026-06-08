import { describe, expect, test } from "vitest";
import {
  isStudioAskEmbed,
  isStudioCodeEmbed,
  isStudioEmbed,
  STUDIO_ASSISTANT_ROLE_ID,
  useOrchestratorChatForWorkspace,
} from "../studioCodeRole";

function params(studio) {
  return new URLSearchParams(studio ? { studio } : {});
}

describe("studio embed mode helpers", () => {
  test("detects code and ask embed modes", () => {
    expect(isStudioCodeEmbed(params("code"))).toBe(true);
    expect(isStudioAskEmbed(params("ask"))).toBe(true);
    expect(isStudioEmbed(params("code"))).toBe(true);
    expect(isStudioEmbed(params("ask"))).toBe(true);
    expect(isStudioEmbed(params())).toBe(false);
  });

  test("studio embeds skip orchestrator chat UX", () => {
    const workspace = { velaProjectId: "proj-1" };
    expect(useOrchestratorChatForWorkspace(params("code"), workspace)).toBe(
      false
    );
    expect(useOrchestratorChatForWorkspace(params("ask"), workspace)).toBe(
      false
    );
    expect(useOrchestratorChatForWorkspace(params(), workspace)).toBe(true);
  });

  test("assistant role id is stable", () => {
    expect(STUDIO_ASSISTANT_ROLE_ID).toBe("studio-assistant");
  });
});
