# Agent Auth

Capability-based authentication and authorization for AI agents, built on [Better Auth](https://www.better-auth.com/).

Agents discover your service, register with cryptographic identity, request capabilities, and execute them — all gated by user approval. Implements the [Agent Auth Protocol](https://github.com/nicepkg/agent-auth-protocol).

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`@better-auth/agent-auth`](packages/agent-auth/) | Better Auth server plugin | `npm i @better-auth/agent-auth` |
| [`@auth/agent`](packages/sdk/) | Client SDK for agent runtimes | `npm i @auth/agent` |
| [`@auth/agent-cli`](packages/cli/) | CLI + MCP server | `npx @auth/agent-cli` |

## Quick Start

### 1. Server Plugin

Add the plugin to your Better Auth instance and define capabilities:

```ts
import { betterAuth } from "better-auth";
import { agentAuth } from "@better-auth/agent-auth";

const auth = betterAuth({
  plugins: [
    agentAuth({
      providerName: "my-service",
      capabilities: [
        { name: "read:data", description: "Read user data" },
        { name: "write:data", description: "Write user data" },
      ],
      onExecute: async ({ capability, arguments: args, agentSession }) => {
        // handle capability execution
        return { success: true };
      },
    }),
  ],
});
```

Run migrations to create the required tables:

```bash
npx auth migrate
```

### 2. Agent SDK

Connect from an AI agent or automation runtime:

```ts
import { AgentAuthClient, MemoryStorage } from "@auth/agent";

const client = new AgentAuthClient({
  storage: new MemoryStorage(),
  onApprovalRequired: (info) => {
    console.log("Approve at:", info.verification_uri_complete);
  },
});

const provider = await client.discoverProvider("https://api.example.com");
const agent = await client.connectAgent({
  provider: "https://api.example.com",
  capabilities: ["read:data"],
});
const result = await client.executeCapability({
  agentId: agent.agent_id,
  capability: "read:data",
  arguments: { id: "123" },
});
```

#### AI Framework Adapters

```ts
import { getAgentAuthTools, toOpenAITools, toAISDKTools } from "@auth/agent";

const tools = getAgentAuthTools(client);

// OpenAI function calling
const { definitions, execute } = toOpenAITools(tools);

// Vercel AI SDK
import { jsonSchema } from "ai";
const aiTools = toAISDKTools(tools, { jsonSchema });
```

### 3. CLI / MCP Server

```bash
# Discover a provider
npx @auth/agent-cli discover https://api.example.com

# Start an MCP server (for Cursor, Claude, etc.)
npx @auth/agent-cli mcp --url https://api.example.com

# Connect and execute
npx @auth/agent-cli connect https://api.example.com --capabilities read:data
npx @auth/agent-cli execute <agent-id> read:data
```

## OpenAPI Integration

Convert an OpenAPI 3.x spec into capabilities automatically:

```ts
import { agentAuth, fromOpenAPI, createOpenAPIHandler } from "@better-auth/agent-auth";

const spec = await fetch("https://api.example.com/openapi.json").then(r => r.json());

export const auth = betterAuth({
  plugins: [
    agentAuth({
      capabilities: fromOpenAPI(spec),
      onExecute: createOpenAPIHandler(spec, {
        baseUrl: "https://api.example.com",
        async resolveHeaders({ agentSession }) {
          const token = await getAccessToken(agentSession.user.id);
          return { Authorization: `Bearer ${token}` };
        },
      }),
    }),
  ],
});
```

## Execution Patterns

`onExecute` supports three return styles:

**Sync** — return a value directly:

```ts
onExecute: async ({ capability, arguments: args }) => {
  return { message: "done" };
}
```

**Async** — return a polling URL for long-running jobs:

```ts
import { asyncResult } from "@better-auth/agent-auth";

onExecute: async ({ capability, arguments: args }) => {
  const jobId = await startJob(capability, args);
  return asyncResult(`/jobs/${jobId}/status`, 5);
}
```

**Streaming** — return an SSE stream:

```ts
import { streamResult } from "@better-auth/agent-auth";

onExecute: async ({ capability }) => {
  return streamResult(createReadableStream());
}
```

## Apps

| App | Description |
|-----|-------------|
| [`apps/registry`](apps/registry/) | Provider registry — browse and submit Agent Auth providers |

## Examples

| Example | Description |
|---------|-------------|
| [`examples/vercel-proxy`](examples/vercel-proxy/) | Vercel API proxy with device authorization flow |
| [`examples/github-proxy`](examples/github-proxy/) | GitHub API proxy |
| [`examples/gmail-proxy`](examples/gmail-proxy/) | Gmail API proxy |
| [`examples/cloudflare-proxy`](examples/cloudflare-proxy/) | Cloudflare API proxy |

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

## License

MIT
