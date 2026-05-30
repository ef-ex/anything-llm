# AnythingLLM fork — Vela Hub chat UI

This repository is a **fork of [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm)** maintained for **[Vela Hub](https://github.com/ef-ex/vela)**. It is the **chat and control frontend** for the Vela system—not a standalone product distribution.

Upstream AnythingLLM provides workspaces, chat, agents, MCP, document RAG, and multi-user UI. Vela Hub adds project binding, entity context, role presets, provider dispatch, and studio settings by talking to the **Vela Python backend**.

```text
Vela Hub (vela)                    This repo (chat-ui)
─────────────────                  ───────────────────
Projects, entities, credentials  →  Chat UI, workspaces
Provider dispatch, permissions      Vela proxy routes (/vela/*)
Policy & domain logic                 vela-dispatch LLM connector
```

When checked out inside velaHub, this tree is the **`chat-ui/` git submodule** pinned to [ef-ex/anything-llm](https://github.com/ef-ex/anything-llm).

## Repositories and remotes

| Remote | Repository | Use |
|--------|------------|-----|
| `origin` | `ef-ex/anything-llm` | Push all Vela fork changes here |
| `upstream` | `Mintplex-Labs/anything-llm` | Fetch/merge only — **never push** |

Fork maintenance (ledger, upstream merges, conflict hotspots): see **[`docs/blueprint/ANYTHINGLLM_FORK_MAINTENANCE.md`](../docs/blueprint/ANYTHINGLLM_FORK_MAINTENANCE.md)** in the parent velaHub repo when this directory is `chat-ui/`.

## Local development

**Recommended:** run from the velaHub root so Vela candidate and AnythingLLM start together:

```powershell
# From velaHub repository root
.\scripts\launch-dev.ps1
```

- Vela API (candidate): `http://127.0.0.1:7701`
- AnythingLLM UI: `http://localhost:3000`
- AnythingLLM API: `http://localhost:3001`

`launch-dev.ps1` sets `VELA_API_URL` in `server/.env.development`. See also `server/.env.vela.example`.

**Fork-only setup** (without velaHub):

```powershell
yarn setup
# Fill server/.env.development and add Vela vars from .env.vela.example
yarn dev:server    # terminal 1
yarn dev:frontend  # terminal 2
yarn dev:collector # terminal 3 if you need document ingestion
```

Fork status vs upstream:

```powershell
# From velaHub root
.\scripts\setup-chat-ui-upstream-remote.ps1
.\scripts\check-chat-ui-fork.ps1 -FetchUpstream
```

## Vela-specific integration (overview)

| Area | Location |
|------|----------|
| Vela API proxy | `server/endpoints/vela.js`, `server/utils/velaApi.js` |
| Context in chat | `server/utils/velaContext.js` |
| Provider dispatch | `server/utils/AiProviders/velaDispatch/` |
| Workspace bindings | `velaProjectId`, `velaRolePresetId` on workspaces |
| Frontend client | `frontend/src/models/vela.js` |
| Studio roles UI | `frontend/src/pages/GeneralSettings/RolePresets/` |
| Subscription access | `frontend/src/pages/GeneralSettings/SubscriptionAccess/` |

Product behavior and secrets live in **Vela** (`src/vela/`). Do not treat this fork as the source of truth for projects, credentials, or provider policy.

## Monorepo layout (unchanged from upstream)

- `frontend/` — React + Vite UI
- `server/` — Node/Express API
- `collector/` — document processing
- `docker/` — upstream Docker assets (optional; Vela dev stack uses `launch-dev.ps1`)

For upstream feature docs (LLM providers, vector DBs, agents), see [docs.anythingllm.com](https://docs.anythingllm.com).

## Contributing on this fork

1. Branch from `master` (e.g. `feat/vela-…`), merge back to `master`, push to **`origin`** only.
2. Prefix commits: `feat(vela):`, `fix(vela):`, `docs(vela):`, `chore(vela):`.
3. Update the fork change ledger in velaHub when touching core AnythingLLM files.
4. Bump the `chat-ui` submodule pointer in velaHub after pushing fork `master`.

PR checklist (velaHub): [`docs/blueprint/CHAT_UI_PR_CHECKLIST.md`](../docs/blueprint/CHAT_UI_PR_CHECKLIST.md).

## License

Based on AnythingLLM (MIT). See [LICENSE](./LICENSE). Original project © Mintplex Labs.
