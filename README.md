# Agent Auth

AI agent authentication and authorization plugin for [Better Auth](https://github.com/better-auth/better-auth).

## Features

- **Ed25519 Keypair Identity** — agents authenticate with asymmetric keys, private keys never touch the server
- **JWT Authentication** — short-lived JWTs signed by agents, verified by the server
- **Scopes & Roles** — fine-grained access control with role-to-scope mapping
- **Workgroups** — group agents within organizations
- **Device Auth Flow** — OAuth device authorization for agent onboarding
- **Scope Escalation** — agents can request additional scopes with user approval
- **MCP Tools** — expose agent management as MCP server tools for Cursor/Claude

## Installation

```bash
npm install @better-auth/agent-auth better-auth
```

## Quick Start

### Server

```ts
import { betterAuth } from "better-auth";
import { agentAuth } from "@better-auth/agent-auth";

const auth = betterAuth({
  plugins: [
    agentAuth({
      roles: {
        agent: ["email.send", "reports.read"],
        admin_agent: ["*"],
      },
      defaultRole: "agent",
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

## Packages

| Package | Description |
|---------|-------------|
| `@better-auth/agent-auth` | Core plugin |

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
```

## License

MIT
