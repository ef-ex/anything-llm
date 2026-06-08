const { buildAgentSystemRole } = require("../velaCodeAgentRole");
const {
  toolOverridesFromBindings,
  shouldUseCodeAgentLoop,
} = require("../velaCodeWorkspace");

describe("velaCodeAgent", () => {
  test("buildAgentSystemRole always appends model identity guard", () => {
    const role = buildAgentSystemRole({
      roleId: "studio-assistant",
      displayName: "Studio Assistant",
      instructions: "You are the Studio Assistant.",
    });
    expect(role).toContain("Active Hub role: Studio Assistant (id: studio-assistant)");
    expect(role).toContain("You are the Studio Assistant.");
    expect(role).toContain("not Claude, GPT, Anthropic");
    expect(role).toContain("Identity (mandatory)");
  });

  test("toolOverridesFromBindings maps mcp servers", () => {
    expect(
      toolOverridesFromBindings({
        mcp_servers: [{ id: "vela-code" }, { id: "vela-studio" }],
      })
    ).toEqual(["@@mcp_vela-code", "@@mcp_vela-studio"]);
  });

  test("toolOverridesFromBindings requires Hub mcp_servers (no client fallback)", () => {
    expect(
      toolOverridesFromBindings({ allowed_tool_classes: ["research"] })
    ).toEqual([]);
    expect(toolOverridesFromBindings({})).toEqual([]);
  });

  test("shouldUseCodeAgentLoop for code workspace", () => {
    const workspace = {
      velaProjectId: "proj-1",
      chatProvider: "vela-dispatch",
      velaRolePresetId: "project-coder",
    };
    expect(shouldUseCodeAgentLoop(workspace, {})).toBe(true);
    expect(
      shouldUseCodeAgentLoop(workspace, { studioCodeAgent: false })
    ).toBe(false);
    expect(
      shouldUseCodeAgentLoop(
        { ...workspace, velaRolePresetId: "studio-assistant" },
        {}
      )
    ).toBe(true);
    expect(
      shouldUseCodeAgentLoop(
        { ...workspace, velaRolePresetId: "studio-assistant" },
        { studioCodeAgent: true, roleId: "studio-assistant" }
      )
    ).toBe(true);
  });
});
