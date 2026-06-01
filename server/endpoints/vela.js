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
    "/vela/projects/linkable",
    [validatedRequest, flexUserRoleValid([ROLES.all])],
    async (_request, response) => {
      if (!process.env.VELA_API_URL) {
        return response.status(503).json({
          error: "Vela backend not configured (VELA_API_URL)",
          projects: [],
        });
      }

      const result = await velaApiRequest("projects", {
        query: { include_archived: "false" },
      });
      if (!result.ok) {
        return sendVelaResult(response, result);
      }

      const linked = new Set(await Workspace.linkedVelaProjectIds());
      const projects = (Array.isArray(result.data) ? result.data : []).map(
        (project) => ({
          ...project,
          has_workspace: linked.has(project.id),
        })
      );
      return response.status(200).json({ projects });
    }
  );

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
      const result = await velaApiRequest("projects", {
        query: { include_archived: "false" },
      });
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
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const { velaProjectId = null } = reqBody(request);

        await Workspace.trackChange(workspace, { velaProjectId }, user);
        const { workspace: updated, message } = await Workspace.update(workspace.id, {
          velaProjectId,
        });
        if (!updated) {
          return response.status(500).json({
            error:
              message ||
              "Failed to save project on workspace. Run database migrations (see launch-dev.ps1).",
          });
        }

        if (velaProjectId) {
          const grantResult = await velaApiRequest(
            `projects/${velaProjectId}/grant-access`,
            {
              method: "POST",
              query: { user_id: velaUserId(user) },
            }
          );
          if (!grantResult.ok) {
            console.warn(
              `[vela] grant-access skipped for project ${velaProjectId}: ${grantResult.error}`
            );
          }
        }

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

  app.get(
    "/vela/admin/role-presets",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      const result = await velaApiRequest("role-presets/manage");
      sendVelaResult(response, result);
    }
  );

  app.get(
    "/vela/admin/role-presets/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      const { id } = request.params;
      const result = await velaApiRequest(`role-presets/${encodeURIComponent(id)}`);
      sendVelaResult(response, result);
    }
  );

  app.post(
    "/vela/admin/role-presets",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      const result = await velaApiRequest("role-presets", {
        method: "POST",
        body: reqBody(request),
      });
      sendVelaResult(response, result);
    }
  );

  app.put(
    "/vela/admin/role-presets/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      const { id } = request.params;
      const result = await velaApiRequest(`role-presets/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: reqBody(request),
      });
      sendVelaResult(response, result);
    }
  );

  app.delete(
    "/vela/admin/role-presets/:id",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      const { id } = request.params;
      const result = await velaApiRequest(`role-presets/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      sendVelaResult(response, result);
    }
  );

  app.get(
    "/vela/admin/provider-profiles",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_request, response) => {
      const result = await velaApiRequest("provider-profiles");
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

  app.get(
    "/workspace/:slug/vela/subscriptions/cursor/status",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const workspace = response.locals.workspace;
      const projectId = request.query.project_id || workspace.velaProjectId;
      const result = await velaApiRequest("subscriptions/cursor/status", {
        query: projectId ? { project_id: projectId } : {},
      });
      sendVelaResult(response, result);
    }
  );

  app.post(
    "/workspace/:slug/vela/subscriptions/cursor/refresh-models",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const workspace = response.locals.workspace;
      const body = reqBody(request);
      const result = await velaApiRequest("subscriptions/cursor/refresh-models", {
        method: "POST",
        body: {
          project_id: body.project_id || workspace.velaProjectId || null,
          force: body.force !== false,
        },
      });
      sendVelaResult(response, result);
    }
  );

  app.post(
    "/workspace/:slug/vela/subscriptions/cursor/connect",
    [validatedRequest, flexUserRoleValid([ROLES.admin]), validWorkspaceSlug],
    async (_request, response) => {
      const result = await velaApiRequest("subscriptions/cursor/connect", {
        method: "POST",
        body: {},
      });
      sendVelaResult(response, result);
    }
  );

  app.post(
    "/workspace/:slug/vela/subscriptions/cursor/disconnect",
    [validatedRequest, flexUserRoleValid([ROLES.admin]), validWorkspaceSlug],
    async (_request, response) => {
      const result = await velaApiRequest("subscriptions/cursor/disconnect", {
        method: "POST",
        body: {},
      });
      sendVelaResult(response, result);
    }
  );

  app.post(
    "/workspace/:slug/vela/subscriptions/cursor/test-dispatch",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const workspace = response.locals.workspace;
      const body = reqBody(request);
      const projectId = body.project_id || workspace.velaProjectId;
      if (!projectId) {
        return response.status(400).json({ error: "No Vela project bound to workspace" });
      }
      const result = await velaApiRequest("subscriptions/cursor/test-dispatch", {
        method: "POST",
        body: {
          project_id: projectId,
          role_id: body.role_id || "cursor-developer",
          message: body.message || "Reply with exactly: cursor-ok",
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
            chatProvider: "vela-dispatch",
            chatModel: route.model_id,
            router_id: null,
          },
          user
        );
        const { workspace: updated, message } = await Workspace.update(workspace.id, {
          velaRolePresetId: roleId,
          chatProvider: "vela-dispatch",
          chatModel: route.model_id,
          router_id: null,
        });

        if (!updated) {
          return response.status(500).json({
            error:
              message ||
              "Failed to save role on workspace. Run database migrations (see launch-dev.ps1).",
          });
        }

        if (workspace.velaProjectId) {
          const grantResult = await velaApiRequest(
            `projects/${workspace.velaProjectId}/grant-access`,
            {
              method: "POST",
              query: { user_id: velaUserId(user) },
            }
          );
          if (!grantResult.ok) {
            console.warn(
              `[vela] grant-access skipped for project ${workspace.velaProjectId}: ${grantResult.error}`
            );
          }
        }

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

  const CURSOR_COMPOSER_STANDARD = "cursor-acp/composer-2.5";
  const CURSOR_COMPOSER_FAST = "cursor-acp/composer-2.5-fast";

  app.post(
    "/workspace/:slug/vela/orchestrator/runs",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const workspace = response.locals.workspace;
      const body = reqBody(request);
      const projectId = body.project_id || workspace.velaProjectId;
      if (!projectId) {
        return response.status(400).json({ error: "No Vela project bound to workspace" });
      }
      const result = await velaApiRequest("orchestrator/runs", {
        method: "POST",
        body: {
          ...body,
          project_id: projectId,
          workspace_id: body.workspace_id || workspace.slug,
        },
      });
      return sendVelaResult(response, result);
    }
  );

  app.get(
    "/workspace/:slug/vela/orchestrator/runs",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const workspace = response.locals.workspace;
      const projectId = request.query.project_id || workspace.velaProjectId;
      if (!projectId) {
        return response.status(400).json({ error: "No Vela project bound to workspace" });
      }
      const result = await velaApiRequest("orchestrator/runs", {
        query: {
          project_id: projectId,
          workspace_id: request.query.workspace_id || workspace.slug,
          session_id: request.query.session_id || undefined,
          limit: request.query.limit || undefined,
        },
      });
      return sendVelaResult(response, result);
    }
  );

  app.get(
    "/workspace/:slug/vela/orchestrator/runs/:runId",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const { runId } = request.params;
      const result = await velaApiRequest(`orchestrator/runs/${encodeURIComponent(runId)}`, {
        query: {
          include_events: request.query.include_events ?? "true",
        },
      });
      return sendVelaResult(response, result);
    }
  );

  app.post(
    "/workspace/:slug/vela/orchestrator/runs/:runId/resume",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const { runId } = request.params;
      const body = reqBody(request);
      const result = await velaApiRequest(
        `orchestrator/runs/${encodeURIComponent(runId)}/resume`,
        { method: "POST", body }
      );
      return sendVelaResult(response, result);
    }
  );

  app.get(
    "/workspace/:slug/vela/orchestration/roles/:roleId/artist-preview",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const workspace = response.locals.workspace;
      const { roleId } = request.params;
      const projectId = request.query.project_id || workspace.velaProjectId;
      if (!projectId) {
        return response.status(400).json({ error: "project_id is required" });
      }
      const result = await velaApiRequest(
        `orchestration/roles/${encodeURIComponent(roleId)}/artist-preview`,
        {
          query: {
            project_id: projectId,
            workspace_id: request.query.workspace_id || workspace.slug,
          },
        }
      );
      return sendVelaResult(response, result);
    }
  );

  app.get(
    "/workspace/:slug/vela/orchestration/runtime-bindings",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      const workspace = response.locals.workspace;
      const projectId = request.query.project_id || workspace.velaProjectId;
      const roleId = request.query.role_id;
      if (!projectId || !roleId) {
        return response.status(400).json({ error: "project_id and role_id are required" });
      }
      const result = await velaApiRequest("orchestration/runtime-bindings", {
        query: {
          role_id: roleId,
          project_id: projectId,
          workspace_id: request.query.workspace_id || workspace.slug,
          run_id: request.query.run_id || undefined,
        },
      });
      return sendVelaResult(response, result);
    }
  );

  app.post(
    "/workspace/:slug/vela/orchestrator/writeback",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const body = reqBody(request);
        const prompt = String(body.user_message || "").trim();
        const assistantText = String(body.assistant_message || "").trim();
        if (!prompt || !assistantText) {
          return response.status(400).json({ error: "user_message and assistant_message are required" });
        }

        const { WorkspaceChats } = require("../models/workspaceChats");
        const { WorkspaceThread } = require("../models/workspaceThread");
        let threadId = null;
        if (body.thread_slug) {
          const thread = await WorkspaceThread.get({
            slug: body.thread_slug,
            workspace_id: workspace.id,
          });
          threadId = thread?.id ?? null;
        }

        const { chat, message } = await WorkspaceChats.new({
          workspaceId: workspace.id,
          prompt,
          response: {
            text: assistantText,
            sources: [],
            type: workspace.chatMode || "chat",
            metrics: body.metrics || {},
            attachments: body.attachments || [],
          },
          user,
          threadId,
        });

        if (!chat) {
          return response.status(500).json({ error: message || "Failed to save chat" });
        }

        return response.status(201).json({
          chatId: chat.id,
          prompt,
          assistant_message: assistantText,
        });
      } catch (e) {
        console.error(e);
        return response.sendStatus(500);
      }
    }
  );

  app.post(
    "/workspace/:slug/vela/cursor-composer-mode",
    [validatedRequest, flexUserRoleValid([ROLES.all]), validWorkspaceSlug],
    async (request, response) => {
      try {
        const user = await userFromSession(request, response);
        const workspace = response.locals.workspace;
        const body = reqBody(request);
        const fast = body.fast === true || body.fast === "true";
        const chatModel = fast ? CURSOR_COMPOSER_FAST : CURSOR_COMPOSER_STANDARD;

        await Workspace.trackChange(
          workspace,
          { chatModel },
          user
        );
        const { workspace: updated, message } = await Workspace.update(workspace.id, {
          chatModel,
        });

        if (!updated) {
          return response.status(500).json({
            error: message || "Failed to save Composer model preference.",
          });
        }

        return response.status(200).json({
          workspace: updated,
          chatModel,
          fast,
        });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { velaEndpoints };
