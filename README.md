# Agent Auth

Agent authentication and capability-based authorization for [Better Auth](https://www.better-auth.com/), implementing the [Agent Auth Protocol](https://github.com/nicepkg/agent-auth-protocol).

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [`@better-auth/agent-auth`](packages/agent-auth/) | `npm i @better-auth/agent-auth` | Better Auth server plugin |
| [`@auth/agent`](packages/sdk/) | `npm i @auth/agent` | Client SDK for agent runtimes |
| [`@auth/agent-cli`](packages/cli/) | `npm i @auth/agent-cli` | CLI + MCP server (`npx @auth/agent-cli`) |

## Example Apps

| App | Description |
|-----|-------------|
| [`apps/vercel-proxy`](apps/vercel-proxy/) | Vercel API proxy with device authorization flow |
| [`apps/github-proxy`](apps/github-proxy/) | GitHub API proxy |
| [`apps/cloudflare-proxy`](apps/cloudflare-proxy/) | Cloudflare API proxy |

## Development

```bash
pnpm install
pnpm build
pnpm test
```

Individual packages:

```bash
pnpm build --filter @better-auth/agent-auth
pnpm test --filter @better-auth/agent-auth
pnpm build --filter @auth/agent
pnpm build --filter @auth/agent-cli
```

## Quick Start

### Server (Better Auth plugin)

```ts
import { betterAuth } from "better-auth";
import { agentAuth } from "@better-auth/agent-auth";

const auth = betterAuth({
  plugins: [
    agentAuth({
      providerName: "my-service",
      capabilities: [
        { name: "read_data", description: "Read user data" },
        { name: "write_data", description: "Write user data" },
      ],
      onExecute: async ({ capability, arguments: args }) => {
        return { success: true };
      },
    }),
  ],
});
```

### Agent SDK

```ts
import { AgentAuthClient } from "@auth/agent";

const client = new AgentAuthClient();
const config = await client.discoverProvider("https://api.example.com");
const agent = await client.connectAgent({
  provider: "https://api.example.com",
  capabilities: ["read_data"],
});
const result = await client.executeCapability({
  agentId: agent.agentId,
  capability: "read_data",
  arguments: { id: "123" },
});
```

### CLI / MCP

```bash
npx @auth/agent-cli discover https://api.example.com
npx @auth/agent-cli mcp --url https://api.example.com
```

## License

MIT
