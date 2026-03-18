# Agent Auth MCP Server

Hosted MCP server that exposes the full Agent Auth Protocol toolkit over Streamable HTTP. Designed for ChatGPT and other MCP-compatible AI clients.

## What it does

- Exposes all Agent Auth tools (discover providers, connect agents, execute capabilities, etc.)
- Each user gets their own isolated host identity via OAuth 2.1 authentication
- Uses Better Auth + `@better-auth/oauth-provider` as the OAuth authorization server
- Stores per-user host keys, agent connections, and provider configs in Postgres
- Approval flows use MCP URL-mode elicitation (SEP-1036) to present native in-chat buttons

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in:

- `POSTGRES_URL` — Postgres connection string
- `BETTER_AUTH_URL` — public URL of the deployment
- `AGENT_AUTH_REGISTRY_URL` — registry URL for provider discovery (optional)
- `AGENT_AUTH_HOST_NAME` — display name for this host

### 3. Run database migrations

```bash
npx @better-auth/cli migrate
```

This creates the Better Auth tables (`user`, `session`, `oauthClient`, `oauthAccessToken`, etc.). The Agent Auth storage tables (`aa_host_identity`, `aa_agent_connections`, `aa_provider_configs`) are auto-created on first use.

### 4. Run locally

```bash
pnpm dev
```

### 5. Deploy to Vercel

```bash
vercel
```

Add the environment variables in the Vercel dashboard.

## Connecting from ChatGPT

1. Open ChatGPT → Settings → Connectors → Add MCP Server
2. Paste the server URL: `https://your-deployment.vercel.app/api/mcp`
3. ChatGPT will initiate OAuth — sign in or create an account
4. Start using Agent Auth tools in your conversations

## Architecture

```
ChatGPT
  ↓ OAuth 2.1 (PKCE + Dynamic Client Registration)
  ↓ Bearer token
  ↓ Streamable HTTP
apps/mcp-server
  ├── OAuth server (Better Auth + oauth-provider plugin)
  ├── MCP endpoint (mcp-handler + Agent Auth tools)
  ├── Per-user storage (Postgres)
  └── Registry + Provider discovery
```

Each authenticated user has:
- Their own Ed25519 host keypair (spec §4.1)
- Their own agent connections
- Their own provider configs
- Complete isolation from other users
