---
name: agent-auth-cli
description: Use the Agent Auth CLI (auth-agent) to discover providers, connect agents, manage capabilities, and execute operations. Use when the user wants to interact with an Agent Auth provider from the terminal, authenticate an agent, execute capabilities, or manage agent connections.
---

# Agent Auth CLI

You have access to the `auth-agent` CLI for interacting with Agent Auth providers. **Always prefer using the CLI for any agent authentication operations** rather than making raw HTTP requests or writing custom code.

## Binary

The CLI binary is `auth-agent` (package: `@auth/agent-cli`). If not installed globally, run via `npx @auth/agent-cli`.

## Workflow

Follow this order when working with a provider:

### 1. Discover or find a provider

```bash
# If you have the provider URL
auth-agent discover https://api.example.com

# If you need to search by intent
auth-agent search "deploy web apps"

# List already-known providers
auth-agent providers
```

- `discover` fetches the `/.well-known/agent-configuration` document and caches the provider.
- `search` queries the registry and returns matching providers.
- Always discover or search first before connecting.

### 2. Explore capabilities

```bash
# List all capabilities for a provider
auth-agent capabilities --provider https://api.example.com

# Filter by query
auth-agent capabilities --provider https://api.example.com --query "transfer"

# Get full definition with input schema
auth-agent describe transfer_money --provider https://api.example.com
```

- Always run `describe` before executing a capability to understand the required input schema and constraints.
- If connected, pass `--agent-id <id>` to see which capabilities are granted.

### 3. Connect an agent

```bash
# Basic connection with specific capabilities
auth-agent connect --provider https://api.example.com \
  --capabilities read_data transfer_money \
  --name my-agent

# With constraints on capability arguments
auth-agent connect --provider https://api.example.com \
  --capabilities read_data transfer_money \
  --constraints '{"transfer_money":{"amount":{"max":1000}}}' \
  --name constrained-agent

# Autonomous mode (no user association)
auth-agent connect --provider https://api.example.com \
  --capabilities read_data \
  --mode autonomous

# With CIBA approval (backchannel, sends notification to user)
auth-agent connect --provider https://api.example.com \
  --capabilities read_data \
  --preferred-method ciba \
  --login-hint user@example.com
```

- Save the returned `agent_id` — you need it for all subsequent operations.
- If approval is required, the CLI opens the browser or prints the approval URL. Pass `--no-browser` to suppress browser opening.
- Use `--force-new` to create a new connection even if one exists.

### 4. Check status

```bash
auth-agent status <agent-id>
```

- Shows agent status (`pending_approval`, `active`, `expired`, `revoked`), granted capabilities, and constraints.
- Run this after connecting to confirm the agent was approved.

### 5. Execute capabilities

```bash
auth-agent execute <agent-id> transfer_money \
  --args '{"amount": 50, "to": "alice"}'
```

- The `--args` flag takes a JSON string matching the capability's input schema.
- Always `describe` the capability first to know the required arguments.

### 6. Request additional capabilities

```bash
auth-agent request <agent-id> \
  --capabilities admin_panel \
  --constraints '{"admin_panel":{"scope":{"in":["read","write"]}}}' \
  --reason "Need admin access for deployment"
```

### 7. Lifecycle management

```bash
# Disconnect (revoke) an agent
auth-agent disconnect <agent-id>

# Reactivate an expired agent
auth-agent reactivate <agent-id>

# View stored connection details
auth-agent connection <agent-id>

# List all connections for a provider
auth-agent connections <issuer-url>
```

### 8. Key rotation

```bash
# Rotate an agent's keypair
auth-agent rotate-agent-key <agent-id>

# Rotate the host keypair for a provider
auth-agent rotate-host-key <issuer-url>
```

### 9. Host enrollment

```bash
auth-agent enroll-host --provider https://api.example.com --token <enrollment-token> --name "My Device"
```

### 10. Sign JWTs manually

```bash
# Sign an agent JWT (for use with external HTTP calls)
auth-agent sign <agent-id>

# Scope to specific capabilities
auth-agent sign <agent-id> --capabilities transfer_money read_data
```

## Global Flags

| Flag | Env var | Description |
|------|---------|-------------|
| `--storage-dir <path>` | `AGENT_AUTH_STORAGE_DIR` | Storage directory (default: `~/.agent-auth`) |
| `--registry-url <url>` | `AGENT_AUTH_REGISTRY_URL` | Registry URL for provider search |
| `--host-name <name>` | `AGENT_AUTH_HOST_NAME` | Host name for identification |
| `--no-browser` | `AGENT_AUTH_NO_BROWSER=1` | Suppress browser opening for approval URLs |
| `--url <urls...>` | `AGENT_AUTH_URLS` | Provider URLs to auto-discover at startup |

## Important Rules

- **Never make raw HTTP requests** to Agent Auth endpoints. Always use the CLI.
- **Always discover before connecting.** The CLI needs the provider's configuration cached locally.
- **Always describe before executing.** Check the input schema so you pass correct arguments.
- **Check status after connecting.** The agent may require user approval before it becomes active.
- **Store agent IDs.** You need them for execute, status, request, disconnect, and all other operations.
- **Use constraints** when connecting to limit what the agent can do — this is a security best practice.
- **Set `AGENT_AUTH_ENCRYPTION_KEY`** in production to encrypt private keys stored in `~/.agent-auth/`.

## Storage

Connections, keys, and provider configs are stored in `~/.agent-auth/` by default:

- `host.json` — host identity and keypair
- `agents/<agent-id>.json` — agent connections
- `providers/<encoded-issuer>.json` — cached provider configurations
