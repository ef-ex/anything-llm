# Vela fork of AnythingLLM

This repository is **not** stock AnythingLLM. It is the Vela Hub chat/control fork hosted at [ef-ex/anything-llm](https://github.com/ef-ex/anything-llm).

## Maintainers

- **Push** Vela changes to `origin` (`ef-ex/anything-llm`) only.
- **Do not push** to [Mintplex-Labs/anything-llm](https://github.com/Mintplex-Labs/anything-llm).
- Fetch and merge from upstream read-only when updating the base.

Full workflow, fork ledger, merge runbooks, and conflict hotspots:

**[velaHub/docs/blueprint/ANYTHINGLLM_FORK_MAINTENANCE.md](../docs/blueprint/ANYTHINGLLM_FORK_MAINTENANCE.md)**

(When this tree is checked out only as the submodule inside velaHub, that path is relative to the parent repo root.)

## Quick commands (from velaHub root)

```powershell
.\scripts\check-chat-ui-fork.ps1 -FetchUpstream
.\scripts\setup-chat-ui-upstream-remote.ps1
.\scripts\launch-dev.ps1
```

## Vela-specific env

See `server/.env.vela.example` — typically `VELA_API_URL` pointing at the Vela candidate API (e.g. `http://127.0.0.1:7701`).
