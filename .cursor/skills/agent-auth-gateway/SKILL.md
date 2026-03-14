---
name: agent-auth-setup
description: Setup and configure the Agent Auth plugin for Better Auth. Use when the user wants to add agent authentication, define capabilities, handle capability execution, integrate OpenAPI specs, use the SDK or CLI, or build MCP tools with agent-auth.
---

# Agent Auth Setup

Guides setup of the Agent Auth plugin so AI agents can authenticate, request capabilities, and execute them against your service.

## When to Use This Skill

- User wants to add agent authentication to a Better Auth app
- User wants to define capabilities and wire up execution (sync, async, streaming)
- User asks about `fromOpenAPI`, `createOpenAPIHandler`, `onExecute`, or capability configuration
- User wants to use the SDK (`AgentAuthClient`) or CLI (`agent-auth`)
- User is building an MCP server (e.g. for Cursor) that uses agent-auth

## Architecture (v2)

Three packages, one plugin:

| Package | Purpose |
|---|---|
| `@better-auth/agent-auth` | Better Auth plugin (server-side) |
| `@auth/agent` | Client SDK for agent runtimes |
| `@auth/agent-cli` | CLI + MCP server |

There is **no** separate gateway package. Capabilities and their execution are configured directly on `agentAuth()`.

## Quick Setup

### 1. Install

```bash
pnpm add @better-auth/agent-auth better-auth
```

### 2. Add plugin

```ts
import { betterAuth } from "better-auth"
import { agentAuth } from "@better-auth/agent-auth"

export const auth = betterAuth({
  plugins: [
    agentAuth({
      providerName: "my-service",
      capabilities: [
        { name: "read:data", description: "Read data" },
        { name: "write:data", description: "Write data" },
      ],
      onExecute: async ({ capability, arguments: args, agentSession }) => {
        // Handle capability execution
        return { result: "done" }
      },
    }),
  ],
})
```

### 3. Migrate DB

```bash
npx auth migrate
```

This creates the `agentHost`, `agent`, `agentCapabilityGrant`, and `approvalRequest` tables.

### 4. Expose discovery document

Mount the discovery endpoint at `/.well-known/agent-configuration` in your server:

```ts
// Next.js example — app/.well-known/agent-configuration/route.ts
import { auth } from "@/lib/auth"

export async function GET(req: Request) {
  return auth.api.getAgentConfiguration({ headers: req.headers })
}
```

### 5. Add browser client plugin (optional)

```ts
import { createAuthClient } from "better-auth/client"
import { agentAuthClient } from "@better-auth/agent-auth/client"

export const authClient = createAuthClient({
  plugins: [agentAuthClient()],
})
```

## Capability Execution Patterns

### Sync (default)

Return a plain value — the server responds with `{ data: result }`:

```ts
onExecute: async ({ capability, arguments: args }) => {
  return { message: "Hello from " + capability }
}
```

### Async (long-running)

Return `asyncResult(...)` — the server responds with `202 Accepted` and a polling URL:

```ts
import { asyncResult } from "@better-auth/agent-auth"

onExecute: async ({ capability, arguments: args }) => {
  const jobId = await startJob(capability, args)
  return asyncResult(`/jobs/${jobId}/status`, 5)
}
```

### Streaming (SSE)

Return `streamResult(...)` — the server responds with `text/event-stream`:

```ts
import { streamResult } from "@better-auth/agent-auth"

onExecute: async ({ capability }) => {
  const stream = createReadableStream(/* ... */)
  return streamResult(stream)
}
```

## OpenAPI Integration

Convert an OpenAPI 3.x spec into capabilities automatically:

```ts
import { agentAuth, fromOpenAPI, createOpenAPIHandler } from "@better-auth/agent-auth"

const spec = await fetch("https://api.example.com/openapi.json").then(r => r.json())

export const auth = betterAuth({
  plugins: [
    agentAuth({
      capabilities: fromOpenAPI(spec),
      onExecute: createOpenAPIHandler(spec, {
        baseUrl: "https://api.example.com",
        async resolveHeaders({ agentSession }) {
          const token = await getAccessToken(agentSession.user.id)
          return { Authorization: `Bearer ${token}` }
        },
      }),
    }),
  ],
})
```

Each OpenAPI operation with an `operationId` becomes a capability. Path/query/header params and request body are merged into the capability's `input` JSON Schema.

## SDK Usage

The SDK provides `AgentAuthClient` for agent runtimes (AI tools, scripts, automation):

```bash
pnpm add @auth/agent
```

```ts
import { AgentAuthClient, MemoryStorage } from "@auth/agent"

const client = new AgentAuthClient({
  storage: new MemoryStorage(),
  onApprovalRequired: (info) => {
    console.log("Approve at:", info.verification_uri_complete)
  },
})

const provider = await client.discoverProvider("https://myapp.com")
const agent = await client.connectAgent({
  provider: "https://myapp.com",
  capabilities: ["read:data"],
})

const result = await client.executeCapability({
  agentId: agent.agent_id,
  capability: "read:data",
  arguments: { id: "123" },
})
```

### AI Framework Adapters

```ts
import { getAgentAuthTools, toOpenAITools, toAISDKTools } from "@auth/agent"

const tools = getAgentAuthTools(client)

// OpenAI function calling
const { definitions, execute } = toOpenAITools(tools)

// Vercel AI SDK
import { jsonSchema } from "ai"
const aiTools = toAISDKTools(tools, { jsonSchema })
```

## CLI & MCP Server

```bash
pnpm add @auth/agent-cli
```

```bash
# Start MCP server (for Cursor, Claude, etc.)
auth-agent mcp

# CLI commands
auth-agent discover https://myapp.com
auth-agent connect https://myapp.com --capabilities read:data
auth-agent execute <agent-id> read:data
auth-agent status <agent-id>
```

Set `AGENT_AUTH_ENCRYPTION_KEY` to encrypt private keys stored in `~/.agent-auth/`.

## Proof of Presence / WebAuthn (§8.11)

Prevents AI agents with browser control from auto-approving sensitive capabilities:

```ts
agentAuth({
  capabilities: [
    { name: "read", description: "Read data", approvalStrength: "session" },
    { name: "delete", description: "Delete data", approvalStrength: "webauthn" },
  ],
  proofOfPresence: { enabled: true },
})
```

With OpenAPI: `approvalStrength: { GET: "session", POST: "webauthn", DELETE: "webauthn" }`

Levels: `"none"` (auto-grant), `"session"` (default), `"webauthn"` (biometric/hardware key).

The approval endpoint returns `code: "webauthn_required"` with challenge options. The client completes the WebAuthn ceremony and retries.

## Key Plugin Options

| Option | Default | Description |
|---|---|---|
| `capabilities` | `[]` | Capability definitions (name, description, input schema, approvalStrength) |
| `onExecute` | — | Handler for `POST /capability/execute` |
| `modes` | `["delegated", "autonomous"]` | Supported agent modes |
| `approvalMethods` | `["ciba", "device_authorization"]` | Approval flow methods |
| `proofOfPresence` | `{ enabled: false }` | WebAuthn-gated approvals (§8.11) |
| `allowedKeyAlgorithms` | `["Ed25519"]` | Accepted JWK algorithms |
| `jwtMaxAge` | `60` | Max JWT age in seconds |
| `agentSessionTTL` | `3600` | Sliding session TTL (seconds) |
| `agentMaxLifetime` | `86400` | Max agent lifetime (seconds) |
| `maxAgentsPerUser` | `25` | Agent limit per user |
| `allowDynamicHostRegistration` | `false` | Allow unknown hosts |
| `defaultHostCapabilities` | `[]` | Default caps for dynamic hosts |
| `blockedCapabilities` | `[]` | Always-blocked capabilities |
| `onEvent` | — | Audit event callback |

## Where to Find More

- **Plugin source and types:** `packages/agent-auth/src/`
- **SDK source:** `packages/sdk/src/`
- **CLI source:** `packages/cli/src/`
- **Repo overview and dev commands:** `CLAUDE.md`
