/**
 * Vela workspace bind + entities smoke tests (M04/M12 integration).
 * Requires Vela on 7701 and AnythingLLM API on 3001 (launch-dev.ps1).
 */

const { velaApiRequest } = require("../../utils/velaApi");

describe("Vela workspace integration", () => {
  const VELA_URL = process.env.VELA_API_URL || "http://127.0.0.1:7701";
  const API = process.env.ANYTHINGLLM_API || "http://localhost:3001/api";

  beforeAll(() => {
    process.env.VELA_API_URL = VELA_URL;
  });

  async function getWorkspaceSlug() {
    const resp = await fetch(`${API}/workspaces`);
    const data = await resp.json();
    expect(data.workspaces?.length).toBeGreaterThan(0);
    return data.workspaces[0].slug;
  }

  async function getProjectId() {
    const resp = await fetch(`${VELA_URL}/api/projects`);
    const projects = await resp.json();
    expect(projects.length).toBeGreaterThan(0);
    return projects[0].id;
  }

  it("binds workspace project without Method Not Allowed", async () => {
    const slug = await getWorkspaceSlug();
    const projectId = await getProjectId();
    const resp = await fetch(`${API}/workspace/${slug}/vela/workspace-project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ velaProjectId: projectId }),
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.workspace?.velaProjectId).toBe(projectId);
    expect(String(data.error || "")).not.toMatch(/method not allowed/i);
  });

  it("lists entities after bind without project not accessible", async () => {
    const slug = await getWorkspaceSlug();
    const projectId = await getProjectId();
    await fetch(`${API}/workspace/${slug}/vela/workspace-project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ velaProjectId: projectId }),
    });
    const resp = await fetch(`${API}/workspace/${slug}/vela/entities`);
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(String(data.error || "")).not.toMatch(/project not accessible/i);
  });

  it("role-preset apply persists velaRolePresetId", async () => {
    const slug = await getWorkspaceSlug();
    const resp = await fetch(`${API}/workspace/${slug}/vela/role-preset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: "producer-coordinator" }),
    });
    const data = await resp.json();
    expect(resp.status).toBe(200);
    expect(data.workspace?.velaRolePresetId).toBe("producer-coordinator");
    expect(data.workspace?.chatProvider).toBe("vela-dispatch");
  });
});
