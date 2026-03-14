# @auth/agent

Client SDK for the [Agent Auth Protocol](https://github.com/nicepkg/agent-auth-protocol) — agent identity, registration, and capability-based authorization.

## Installation

```bash
npm install @auth/agent
```

## Quick Start

```ts
import { AgentAuthClient } from "@auth/agent";

const client = new AgentAuthClient({
  registryUrl: "https://registry.example.com",
});

// Discover a provider
const config = await client.discoverProvider("https://api.example.com");

// Connect an agent with constrained capabilities
const agent = await client.connectAgent({
  provider: "https://api.example.com",
  capabilities: [
    "read_data",
    { name: "transfer_money", constraints: { amount: { max: 1000 } } },
  ],
  name: "my-assistant",
});

// Execute a capability
const result = await client.executeCapability({
  agentId: agent.agentId,
  capability: "read_data",
  arguments: { id: "user-123" },
});
```

## AI Framework Integration

### Vercel AI SDK

```ts
import { generateText } from "ai";
import { jsonSchema } from "ai";
import { AgentAuthClient, getAgentAuthTools, toAISDKTools } from "@auth/agent";

const client = new AgentAuthClient();
const tools = toAISDKTools(getAgentAuthTools(client), { jsonSchema });

const { text } = await generateText({
  model: openai("gpt-4o"),
  tools,
  prompt: "Transfer $50 to Alice",
});
```

### OpenAI Function Calling

```ts
import { AgentAuthClient, getAgentAuthTools, toOpenAITools } from "@auth/agent";

const client = new AgentAuthClient();
const { definitions, execute } = toOpenAITools(getAgentAuthTools(client));

const res = await openai.chat.completions.create({
  model: "gpt-4o",
  tools: definitions,
  messages,
});

for (const call of res.choices[0].message.tool_calls ?? []) {
  const result = await execute(call.function.name, JSON.parse(call.function.arguments));
}
```

## SDK Tools

The SDK exposes protocol tools that map to the agent lifecycle:

| Tool | Description |
|------|-------------|
| `list_providers` | List discovered/configured providers |
| `search_providers` | Search registry by intent |
| `discover_provider` | Look up a provider by URL |
| `list_capabilities` | List provider capabilities |
| `describe_capability` | Get full capability definition |
| `connect_agent` | Register an agent (with optional constraints) |
| `execute_capability` | Execute a granted capability |
| `request_capability` | Request additional capabilities |
| `agent_status` | Check agent status and grants |
| `sign_jwt` | Sign an agent JWT manually |
| `disconnect_agent` | Revoke an agent |
| `reactivate_agent` | Reactivate an expired agent |
| `rotate_agent_key` | Rotate agent keypair |
| `rotate_host_key` | Rotate host keypair |
| `enroll_host` | Enroll host with enrollment token |

## Constraints (Section 2.13)

Pass constraints when connecting or requesting capabilities to restrict argument values:

```ts
await client.connectAgent({
  provider: "https://api.example.com",
  capabilities: [
    "read_data",
    {
      name: "transfer_money",
      constraints: {
        amount: { max: 1000, min: 1 },
        currency: { in: ["USD", "EUR"] },
      },
    },
  ],
});
```

Constraint grants are returned in `capabilityGrants[].constraints`.

## Storage

The SDK uses pluggable storage for persisting host identity and agent connections:

```ts
import { AgentAuthClient } from "@auth/agent";

const client = new AgentAuthClient({
  storage: myCustomStorage, // implements Storage interface
});
```

Built-in: `MemoryStorage` (default, non-persistent). For long-running apps, implement the `Storage` interface with your preferred backend (database, filesystem, KV store, etc.):

| Method group | Description |
|---|---|
| `getHostIdentity` / `setHostIdentity` / `deleteHostIdentity` | Host keypair and identity |
| `getAgentConnection` / `setAgentConnection` / `deleteAgentConnection` / `listAgentConnections` | Per-agent connection state |
| `getProviderConfig` / `setProviderConfig` / `listProviderConfigs` | Cached provider discovery docs |

> The CLI package (`@auth/agent-cli`) includes a file-based `FileStorage` implementation with optional encryption at rest — see [`packages/cli/src/storage.ts`](../cli/src/storage.ts) for a reference implementation.

## License

MIT
