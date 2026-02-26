# Agent Auth

AI agent authentication and authorization plugin for [Better Auth](https://github.com/better-auth/better-auth).

Agents are tools we hire, not users we pretend to be. Instead of sharing user tokens, each agent gets its own Ed25519 keypair, scopes, and role — following the [IETF Agent Authorization Profile](https://datatracker.ietf.org/doc/draft-ietf-oauth-agent-authorization/) (AAP).

## Features

- **Ed25519 Keypair Identity** — agents and enrollments authenticate with asymmetric keys; private keys never touch the server
- **Three-State Lifecycle** — agents and enrollments transition through `active` → `expired` → `revoked`, with proof-of-possession reactivation
- **Enrollments** — persistent app-level consent that enables silent agent creation without user interaction
- **Transparent Reactivation** — expired agents auto-reactivate when a valid JWT is presented (no extra round-trip)
- **JWT Authentication** — short-lived JWTs signed by agents, verified by the server, with JTI replay detection
- **Scopes & Roles** — fine-grained access control with wildcard matching (`github.*`), blocked scopes, and fresh session enforcement
- **Scope Escalation** — agents can request additional scopes with user approval
- **Three Lifetime Clocks** — `agentSessionTTL` (sliding), `agentMaxLifetime` (per-activation), `absoluteLifetime` (permanent)
- **Device Auth Flow** — OAuth device authorization for agent onboarding (like `gh auth login`)
- **Key Rotation & Revocation** — rotate keys without downtime, revoke with credential wipe and cascade
- **Discovery Endpoint** — exposes supported algorithms, available scopes, roles, and configuration
- **MCP Tools** — expose agent management as MCP server tools for Cursor, Claude Desktop, etc.
- **Pluggable Storage** — memory (default), file with optional encryption, or custom database
- **Workgroups** — group agents within organizations

## Installation

```bash
npm install @better-auth/agent-auth
```

> Requires `better-auth` as a peer dependency — you should already have it in your project.

## Quick Start

### Server

```ts
import { betterAuth } from "better-auth";
import { agentAuth } from "@better-auth/agent-auth";

const auth = betterAuth({
  plugins: [
    agentAuth({
      roles: {
        reader: ["reports.read"],
        writer: ["reports.read", "reports.write", "email.send"],
      },
      defaultRole: "reader",
    }),
  ],
});
```

### Client

```ts
import { createAuthClient } from "better-auth/client";
import { agentAuthClient } from "@better-auth/agent-auth/client";

const client = createAuthClient({
  plugins: [agentAuthClient()],
});
```

### Agent Runtime

```ts
import { connectAgent, createAgentClient } from "@better-auth/agent-auth/agent-client";

const result = await connectAgent({
  appURL: "https://myapp.com",
  name: "My Agent",
  scopes: ["reports.read"],
  openBrowser: true,
  onUserCode: ({ userCode, verificationUri }) => {
    console.log(`Go to ${verificationUri} and enter: ${userCode}`);
  },
});

const agent = createAgentClient({
  baseURL: "https://myapp.com",
  agentId: result.agentId,
  privateKey: result.privateKey,
});

const response = await agent.fetch("/api/reports/Q4");
```

### MCP Server (Cursor / Claude Desktop)

```json
{
  "mcpServers": {
    "agent-auth": {
      "command": "npx",
      "args": ["@better-auth/agent-auth", "agent"],
      "env": {
        "BETTER_AUTH_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Documentation

See [docs/agent-auth.mdx](docs/agent-auth.mdx) for the full API reference, enrollment system, lifecycle details, schema, storage options, and configuration.

## Development

Requires **Node.js 22+** (tests use `node:sqlite`).

```bash
pnpm install        # install dependencies
pnpm build          # build (turbo → tsup)
pnpm typecheck      # tsc --noEmit
pnpm lint           # biome check
pnpm format:check   # biome format
pnpm test           # vitest
```

## License

MIT
