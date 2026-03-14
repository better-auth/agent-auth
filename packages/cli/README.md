# @auth/agent-cli

CLI and MCP server for the [Agent Auth Protocol](https://github.com/nicepkg/agent-auth-protocol).

## Installation

```bash
npm install -g @auth/agent-cli
```

Or run directly:

```bash
npx @auth/agent-cli --help
```

## CLI Usage

```bash
# Discover a provider
auth-agent discover https://api.example.com

# List capabilities
auth-agent capabilities --provider https://api.example.com

# Describe a specific capability
auth-agent describe transfer_money --provider https://api.example.com

# Connect an agent
auth-agent connect --provider https://api.example.com \
  --capabilities read_data transfer_money \
  --name my-agent

# Connect with constraints
auth-agent connect --provider https://api.example.com \
  --capabilities read_data transfer_money \
  --constraints '{"transfer_money":{"amount":{"max":1000}}}' \
  --name constrained-agent

# Execute a capability
auth-agent execute <agent-id> transfer_money \
  --args '{"amount": 50, "to": "alice"}'

# Check agent status
auth-agent status <agent-id>

# Request additional capabilities
auth-agent request <agent-id> \
  --capabilities admin_panel \
  --constraints '{"admin_panel":{"scope":{"in":["read","write"]}}}'

# Disconnect
auth-agent disconnect <agent-id>
```

## MCP Server

Run as an MCP (Model Context Protocol) server for AI agent integration:

```bash
auth-agent mcp --url https://api.example.com
```

### Cursor / Claude Desktop Configuration

```json
{
  "mcpServers": {
    "auth-agent": {
      "command": "npx",
      "args": [
        "@auth/agent-cli",
        "mcp",
        "--url", "https://api.example.com"
      ]
    }
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `discover <url>` | Discover a provider |
| `search <intent>` | Search registry for providers |
| `providers` | List known providers |
| `capabilities` | List capabilities for a provider |
| `describe <name>` | Get full capability definition |
| `connect` | Connect an agent to a provider |
| `status <agent-id>` | Check agent status |
| `execute <agent-id> <capability>` | Execute a capability |
| `request <agent-id>` | Request additional capabilities |
| `sign <agent-id>` | Sign an agent JWT |
| `disconnect <agent-id>` | Disconnect an agent |
| `reactivate <agent-id>` | Reactivate expired agent |
| `connections <issuer>` | List agent connections |
| `connection <agent-id>` | Get a stored connection |
| `rotate-agent-key <agent-id>` | Rotate agent keypair |
| `rotate-host-key <issuer>` | Rotate host keypair |
| `enroll-host` | Enroll host with token |
| `mcp` | Start MCP server |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENT_AUTH_STORAGE_DIR` | Storage directory for keys and connections |
| `AGENT_AUTH_REGISTRY_URL` | Registry URL for provider search |
| `AGENT_AUTH_HOST_NAME` | Host name for identification |

## License

MIT
