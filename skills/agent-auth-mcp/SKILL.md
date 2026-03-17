---
name: agent-auth-mcp
description: Use the Agent Auth MCP tools to discover providers, connect agents, manage capabilities, and execute operations through the MCP protocol. Use when working inside an MCP-enabled environment (Cursor, Claude Code, etc.) and need to authenticate agents, execute capabilities, or interact with Agent Auth providers.
---

# Agent Auth MCP Tools

You have access to Agent Auth MCP tools for interacting with Agent Auth providers. **Always prefer using these MCP tools for any agent authentication operations** rather than making raw HTTP requests or writing custom code.

## Starting the MCP Server

The MCP server is part of the CLI:

```bash
auth-agent mcp
```

Or with pre-configured providers:

```bash
auth-agent mcp --url https://api.example.com
```

### Cursor / Claude Desktop configuration

```json
{
  "mcpServers": {
    "auth-agent": {
      "command": "npx",
      "args": ["@auth/agent-cli", "mcp", "--url", "https://api.example.com"]
    }
  }
}
```

## Available Tools

The MCP server exposes 17 tools. Follow the numbered workflow below.

### Step 1: Discovery — Find a Provider

| Tool | Parameters | When to use |
|------|------------|-------------|
| `list_providers` | (none) | **Call this first.** Lists all discovered/configured providers. |
| `search_providers` | `intent` (required) | Search the registry by name or intent (e.g. "deploy web apps", "vercel"). |
| `discover_provider` | `url` (required) | Look up a specific provider by URL. Only use if list/search didn't help. |

**Always start with `list_providers`.** If empty, use `search_providers` or `discover_provider`.

### Step 2: Capabilities — Understand What's Available

| Tool | Parameters | When to use |
|------|------------|-------------|
| `list_capabilities` | `provider` (required), `query`, `agent_id`, `limit`, `cursor` | List capabilities for a provider. |
| `describe_capability` | `provider`, `name` (required), `agent_id` | Get full definition including input schema. **Always call before executing.** |

### Step 3: Connect — Authenticate an Agent

| Tool | Parameters | When to use |
|------|------------|-------------|
| `connect_agent` | `provider` (required), `capabilities`, `mode`, `name`, `reason`, `preferred_method`, `login_hint`, `binding_message`, `force_new` | Connect an agent to a provider. Returns `agent_id`. |

Key parameters:

- `capabilities` — Array of capability names to request.
- `mode` — `"delegated"` (acts for a user, default) or `"autonomous"` (independent).
- `preferred_method` — `"device_authorization"` (default, opens browser) or `"ciba"` (backchannel notification).
- `login_hint` — User email for CIBA flow.
- `force_new` — Create a new connection even if one exists.

### Step 4: Use the Agent

| Tool | Parameters | When to use |
|------|------------|-------------|
| `execute_capability` | `agent_id`, `capability` (required), `arguments` | Execute a granted capability. |
| `agent_status` | `agent_id` (required) | Check agent status, grants, and constraints. |
| `sign_jwt` | `agent_id` (required), `capabilities`, `audience` | Sign an agent JWT for manual use. |
| `request_capability` | `agent_id`, `capabilities` (required), `reason`, `preferred_method`, `login_hint`, `binding_message` | Request additional capabilities. |
| `disconnect_agent` | `agent_id` (required) | Revoke an agent. |
| `reactivate_agent` | `agent_id` (required) | Reactivate an expired agent. |

### Host Management

| Tool | Parameters | When to use |
|------|------------|-------------|
| `enroll_host` | `provider`, `enrollment_token` (required), `name` | Enroll a host with a one-time token. |
| `rotate_agent_key` | `agent_id` (required) | Rotate an agent's keypair. |
| `rotate_host_key` | `issuer` (required) | Rotate the host keypair for a provider. |

## Workflow Example

Here is the standard workflow for connecting to a provider and executing a capability:

```
1. list_providers
   → See what providers are already known

2. search_providers({ intent: "deploy web apps" })
   → Find a provider if none are known (or discover_provider with a URL)

3. list_capabilities({ provider: "https://api.example.com" })
   → See what the provider offers

4. describe_capability({ name: "deploy_app", provider: "https://api.example.com" })
   → Understand the input schema before executing

5. connect_agent({ provider: "https://api.example.com", capabilities: ["deploy_app"], name: "deploy-bot" })
   → Authenticate and get an agent_id
   → If approval is required, the user will be prompted

6. agent_status({ agent_id: "..." })
   → Confirm the agent is active and capabilities are granted

7. execute_capability({ agent_id: "...", capability: "deploy_app", arguments: { app: "my-app", env: "production" } })
   → Run the capability with the correct arguments
```

## Important Rules

- **Never make raw HTTP requests** to Agent Auth endpoints. Always use MCP tools.
- **Always call `list_providers` first.** This tells you what's already configured.
- **Always call `describe_capability` before `execute_capability`.** You need the input schema.
- **Always call `agent_status` after `connect_agent`.** The agent may be pending approval.
- **Save the `agent_id`** returned by `connect_agent` — every subsequent tool needs it.
- **Use constraints** when connecting to limit agent permissions — pass them in the `capabilities` parameter as objects with `name` and `constraints` fields.
- **Handle approval flows.** When `connect_agent` returns approval info (device code URL or CIBA), the user must approve before the agent becomes active. Poll `agent_status` to check.
- **Errors return structured objects** like `{ error: "message", code: "error_code" }` — check these and retry or adjust accordingly.

## Capability Constraints

When connecting, you can restrict what an agent can do with its capabilities:

```json
{
  "provider": "https://api.example.com",
  "capabilities": [
    "read_data",
    {
      "name": "transfer_money",
      "constraints": {
        "amount": { "max": 1000, "min": 1 },
        "currency": { "in": ["USD", "EUR"] }
      }
    }
  ]
}
```

Constraint types: `eq` (exact match), `min`/`max` (numeric bounds), `in`/`not_in` (allowed/blocked values).

## When to Use CLI vs MCP

- **Use MCP tools** when operating inside an MCP-enabled environment (Cursor, Claude Code, Claude Desktop) — the tools are already available and integrated.
- **Use the CLI** when running from a terminal directly, scripting, or when MCP is not available.
- Both expose the same operations and share the same storage (`~/.agent-auth/`).
