const { Workspace } = require("../models/workspace");
const {
  reqBody,
  multiUserMode,
  userFromSession,
} = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { validWorkspaceSlug } = require("../utils/middleware/validWorkspace");
const { isVelaAvailable } = require("../utils/velaContext");
const {
  velaApiRequest,
  sendVelaResult,
  velaUserId,
} = require("../utils/velaApi");

function velaEndpoints(app) {
  if (!app) return;

  app.get(
    "/workspace/:slug/vela/status",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (_request, response) => {
      const available = await isVelaAvailable();
      response.status(200).json({ available, configured: !!process.env.VELA_API_URL });
    }
  );

  app.get(
    "/workspace/:slug/vela/projects",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (_request, response) => {
      const result = await velaApiRequest("projects");
      sendVelaResult(response, result);
    }
  );

  app.get(
    "/workspace/:slug/vela/active-project",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const user = await userFromSession(request, response);
      const workspace = response.locals.workspace;
      const result = await velaApiRequest("me/active-project", {
        query: {
          user_id: velaUserId(user),
          workspace_project_id: workspace.velaProjectId || undefined,
        },
      });
      sendVelaResult(response, result);
    }
  );

  app.put(
    "/workspace/:slug/vela/active-project",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const user = await userFromSession(request, response);
      const { project_id } = reqBody(request);
      const result = await velaApiRequest("me/active-project", {
        method: "PUT",
        body: {
          user_id: velaUserId(user),
          project_id,
        },
      });
      sendVelaResult(response, result);
    }
  );

  app.post(
    "/workspace/:slug/vela/workspace-project",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const { velaProjectId = null } = reqBody(request);

        await Workspace.trackChange(workspace, { velaProjectId }, user);
        const { workspace: updated, message } = await Workspace.update(workspace.id, {
          velaProjectId,
        });
        response.status(200).json({ workspace: updated, message });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/workspace/:slug/vela/entities",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const user = await userFromSession(request, response);
      const workspace = response.locals.workspace;
      const projectId = workspace.velaProjectId;
      if (!projectId) {
        return response.status(400).json({ error: "No Vela project bound to workspace" });
      }
      const result = await velaApiRequest(`projects/${projectId}/entities`, {
        query: {
          user_id: velaUserId(user),
          type: request.query.type || undefined,
        },
      });
      sendVelaResult(response, result);
    }
  );

  app.get(
    "/workspace/:slug/vela/entities/:entityId",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const user = await userFromSession(request, response);
      const workspace = response.locals.workspace;
      const { entityId } = request.params;
      const projectId = workspace.velaProjectId;
      if (!projectId) {
        return response.status(400).json({ error: "No Vela project bound to workspace" });
      }
      const result = await velaApiRequest(
        `projects/${projectId}/entities/${entityId}`,
        { query: { user_id: velaUserId(user) } }
      );
      sendVelaResult(response, result);
    }
  );

  app.get(
    "/workspace/:slug/vela/entities/:entityId/files",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const user = await userFromSession(request, response);
      const workspace = response.locals.workspace;
      const { entityId } = request.params;
      const projectId = workspace.velaProjectId;
      if (!projectId) {
        return response.status(400).json({ error: "No Vela project bound to workspace" });
      }
      const result = await velaApiRequest(
        `projects/${projectId}/entities/${entityId}/files`,
        { query: { user_id: velaUserId(user) } }
      );
      sendVelaResult(response, result);
    }
  );

  app.put(
    "/workspace/:slug/vela/entities/:entityId/pin",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const user = await userFromSession(request, response);
      const workspace = response.locals.workspace;
      const { entityId } = request.params;
      const projectId = workspace.velaProjectId;
      if (!projectId) {
        return response.status(400).json({ error: "No Vela project bound to workspace" });
      }
      const body = reqBody(request);
      const result = await velaApiRequest(
        `projects/${projectId}/entities/${entityId}/pin`,
        {
          method: "PUT",
          query: { user_id: velaUserId(user) },
          body: {
            version: body.version ?? null,
            file_ref_id: body.file_ref_id ?? null,
          },
        }
      );
      sendVelaResult(response, result);
    }
  );

  app.post(
    "/workspace/:slug/vela/entities/resolve",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const user = await userFromSession(request, response);
      const workspace = response.locals.workspace;
      const body = reqBody(request);
      const result = await velaApiRequest("entities/resolve", {
        method: "POST",
        body: {
          user_id: velaUserId(user),
          references: body.references || [],
          workspace_project_id: workspace.velaProjectId || null,
          include_media: !!body.include_media,
          default_facet: body.default_facet || "brief",
          role_preset_id:
            body.role_preset_id || workspace.velaRolePresetId || null,
        },
      });
      sendVelaResult(response, result);
    }
  );

  app.post(
    "/workspace/:slug/vela/files/resolve",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const user = await userFromSession(request, response);
      const workspace = response.locals.workspace;
      const body = reqBody(request);
      const projectId = workspace.velaProjectId;
      if (!projectId) {
        return response.status(400).json({ error: "No Vela project bound to workspace" });
      }
      const result = await velaApiRequest("files/resolve", {
        method: "POST",
        body: {
          user_id: velaUserId(user),
          project_id: projectId,
          tags: body.tags || [],
          entity_name: body.entity_name || "default",
          run_id: body.run_id || "default",
          version: body.version ?? null,
          external_path: body.external_path ?? null,
        },
      });
      sendVelaResult(response, result);
    }
  );

  app.post(
    "/workspace/:slug/vela/publish",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const user = await userFromSession(request, response);
      const workspace = response.locals.workspace;
      const body = reqBody(request);
      const result = await velaApiRequest("publish", {
        method: "POST",
        body: {
          user_id: velaUserId(user),
          project_id: workspace.velaProjectId || body.project_id || null,
          workspace_project_id: workspace.velaProjectId || null,
          generation_run_id: body.generation_run_id ?? null,
          entity: body.entity ?? null,
          tags: body.tags || [],
          version_policy: body.version_policy ?? null,
          sources: body.sources || [],
          task_id: body.task_id ?? null,
          comment: body.comment ?? null,
        },
      });
      sendVelaResult(response, result);
    }
  );

  app.get(
    "/workspace/:slug/vela/role-presets",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (_request, response) => {
      const result = await velaApiRequest("role-presets");
      sendVelaResult(response, result);
    }
  );

  app.post(
    "/workspace/:slug/vela/role-presets/resolve",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const body = reqBody(request);
      const result = await velaApiRequest("role-presets/resolve", {
        method: "POST",
        body: {
          role_id: body.role_id,
          required_capabilities: body.required_capabilities || [],
        },
      });
      sendVelaResult(response, result);
    }
  );

  app.post(
    "/workspace/:slug/vela/role-preset",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const { role_id: roleId } = reqBody(request);
        if (!roleId) {
          return response.status(400).json({ error: "role_id is required" });
        }

        const routeResult = await velaApiRequest("role-presets/resolve", {
          method: "POST",
          body: { role_id: roleId },
        });
        if (!routeResult.ok) {
          return sendVelaResult(response, routeResult);
        }

        const route = routeResult.data;
        await Workspace.trackChange(
          workspace,
          {
            velaRolePresetId: roleId,
            chatProvider: route.chat_provider,
            chatModel: route.model_id,
            router_id: null,
          },
          user
        );
        const { workspace: updated, message } = await Workspace.update(workspace.id, {
          velaRolePresetId: roleId,
          chatProvider: route.chat_provider,
          chatModel: route.model_id,
          router_id: null,
        });

        response.status(200).json({
          workspace: updated,
          message,
          ...route,
        });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { velaEndpoints };
