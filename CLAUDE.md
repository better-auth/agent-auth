# CLAUDE.md

This file provides guidance to AI assistants (Claude Code, Cursor, etc.)
when working with code in this repository.

## Project Overview

Agent Auth is an AI agent authentication and authorization plugin for
[Better Auth](https://github.com/better-auth/better-auth). It provides
Ed25519 keypair-based identity, JWT authentication, scopes, roles, and
workgroups for AI agents.

## Repository Structure

This is a pnpm monorepo.

```
packages/agent-auth/        @better-auth/agent-auth - the plugin
packages/bank-mcp-server/   @better-auth/bank-mcp-server - demo MCP server
apps/agent-idp/             @better-auth/agent-idp - demo identity provider app
```

## Development Commands

```bash
pnpm install              # Install dependencies
pnpm build                # Build all packages
pnpm lint                 # Lint (Biome)
pnpm lint:fix             # Auto-fix lint
pnpm format:check         # Check formatting
pnpm typecheck            # Type check
```

Run specific tests with:
```bash
vitest packages/agent-auth/src/agent-auth.test.ts
```

## Architecture

### Agent Auth Plugin (`packages/agent-auth/`)

Core agent identity and authorization system:

- **Plugin entry** (`index.ts`): JWT middleware, session building,
  rate limiting
- **Crypto** (`crypto.ts`): Ed25519 keypair generation, JWT
  signing/verification
- **Schema** (`schema.ts`): DB tables — `agent`, `agentScopeRequest`,
  `agentWorkgroup`
- **Routes** (`routes/`): `create-agent`, `list-agents`, `get-agent`,
  `update-agent`, `revoke-agent`, `rotate-key`, `get-agent-session`,
  `cleanup-agents`, `request-scope`, `scope-request-status`,
  `approve-scope`, `workgroup` (CRUD)
- **Client** (`client.ts`): Browser client plugin for `createAuthClient`
- **Agent Client** (`agent-client.ts`): SDK for agent runtimes — keypair
  management, device auth flow, JWT-authenticated fetch
- **MCP Tools** (`mcp-tools.ts`): MCP server tool definitions for
  Cursor/Claude
- **Storage**: Memory and file-based agent connection storage

### Dependencies

`better-auth` and `@better-auth/core` are **peer dependencies** — users
install Better Auth separately and add this plugin.

## Code Style

* Formatter: Biome (tabs for code, 2-space for JSON)
* Avoid unsafe typecasts or types like `any`
* Avoid classes, use functions and objects
* Do not use runtime-specific features like `Buffer` in source code,
  use `Uint8Array` instead

## Git Workflow

* PRs should target the `agent-auth` branch
* Commit format: `feat(agent-auth): description` or
  `fix(agent-auth): description`

## After Everything is Done

**Unless the user asked for it or you are working on CI, DO NOT COMMIT**

* Make sure `pnpm format:check`, `pnpm lint` and `pnpm typecheck` pass
