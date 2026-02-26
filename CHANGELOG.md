# Changelog

## Unreleased — Model Redesign

### Architecture: Agent → Host → Server

The protocol now has three clearly separated actors:

- **Agent** — the AI identity (keypair, lifecycle, metadata)
- **Host** — the registered client runtime that agents run inside (Device, Cursor, MCP server, CLI, SDK)
- **Server** — the app's auth backend that makes authorization decisions

Every agent must be created through a registered host (`hostId` is required).

### Separate Permission Model

Agent authorization is now a separate `agentPermission` table instead of a flat
`scopes` array on the agent. Each permission row tracks:

| Field | Purpose |
|---|---|
| `agentId` | Which agent this permission belongs to |
| `scope` | The permission string (opaque — format defined by the app) |
| `referenceId` | Optional resource scope (e.g. a user ID, repo, project) |
| `grantedBy` | Which user granted this permission |
| `status` | `"active"`, `"pending"`, or `"denied"` |
| `reason` | Human-readable reason (for pending requests) |
| `expiresAt` | Optional per-permission expiry |

This enables:
- **Multi-grantor agents** — an agent can accumulate permissions from multiple
  users (e.g. Alice grants `email.read`, Bob grants `calendar.read`)
- **Per-scope lifecycle** — individual permissions can be pending, approved,
  denied, or expired independently
- **Scope escalation without a separate table** — pending permissions ARE the
  requests; approval flips them to active
- **Per-resource scoping** — `email.read` on Bekacru's account vs Danite's
  account, tracked separately
- **Granular revocation** — revoke one permission without touching others

### Enrollment → Agent Host

The `agentEnrollment` concept has been renamed to `agentHost` (`agentHost` table).

| Before | After |
|---|---|
| `agentEnrollment` table | `agentHost` table |
| `Enrollment` type | `AgentHost` type |
| `enrollmentId` field on agent | `hostId` field on agent (now **required**) |
| `enrollmentJWT` body param | `hostJWT` body param |
| `baseScopes` field | `scopes` field |
| `/agent/enrollment/*` routes | `/agent/host/*` routes |
| `ENROLLMENT_*` error codes | `HOST_*` error codes |

The host is now mandatory — every agent must come through a registered host.
This provides a trust anchor (unknown hosts can trigger 2FA) and ensures a
consistent Agent → Host → Server flow.

### Scope Requests Merged into Permissions

The `agentScopeRequest` table has been removed. Scope escalation now uses the
`agentPermission` table directly:

1. Agent requests scopes → `agentPermission` rows created with `status: "pending"`
2. User approves → status flips to `"active"`
3. User denies → status flips to `"denied"`

The `name` change concept has been removed from scope requests — use
`updateAgent` for name changes separately.

### Request Binding (DPoP-style)

Agent JWTs now support optional request binding following RFC 9449 (DPoP)
conventions. When present, the JWT is cryptographically bound to a specific
HTTP request:

| Claim | Purpose |
|---|---|
| `htm` | HTTP method (e.g. `"POST"`) |
| `htu` | Request path (e.g. `"/api/emails/send"`) |
| `ath` | SHA-256 hash of the request body |

A stolen JWT can only authorize the exact request it was signed for. The server
verifies these claims against the actual request. Request binding is opt-in —
JWTs without these claims are still accepted.

### Removed Fields

| Field | Table | Reason |
|---|---|---|
| `scopes` | `agent` | Moved to `agentPermission` table |
| `role` | `agent` | Roles resolve to permissions at creation time |
| `source` | `agent` | Use `metadata` if needed |
| `referenceId` | `agent` | Permissions have their own `referenceId` |
| `workgroupId` | `agent` | App-level concern, not protocol |
| `appSource` | `agentEnrollment` | Removed (was enrollment-specific) |

### Removed Tables

| Table | Reason |
|---|---|
| `agentScopeRequest` | Merged into `agentPermission` with `status` field |
| `agentWorkgroup` | App-level organizational concern |

### Final Schema

Three tables:

**`agentHost`** — registered client with pre-authorized scopes

```
userId, scopes, publicKey, kid, status, activatedAt, expiresAt,
lastUsedAt, createdAt, updatedAt
```

**`agent`** — pure identity

```
name, userId, hostId (required), status, publicKey, kid, lastUsedAt,
activatedAt, expiresAt, metadata, createdAt, updatedAt
```

**`agentPermission`** — authorization

```
agentId, scope, referenceId, grantedBy, status, reason, expiresAt,
createdAt, updatedAt
```

### New Error Codes

| Code | Message |
|---|---|
| `HOST_NOT_FOUND` | Agent host not found. |
| `HOST_REVOKED` | Agent host has been revoked. |
| `HOST_EXPIRED` | Agent host has expired. Reactivate via proof-of-possession. |
| `HOST_REQUIRED` | An active agent host is required to create agents. |
| `REQUEST_BINDING_MISMATCH` | JWT request binding does not match the actual request. |

### Renamed Error Codes

| Before | After |
|---|---|
| `ENROLLMENT_NOT_FOUND` | `HOST_NOT_FOUND` |
| `ENROLLMENT_REVOKED` | `HOST_REVOKED` |
| `ENROLLMENT_EXPIRED` | `HOST_EXPIRED` |
| `ENROLLMENT_REQUIRED` | `HOST_REQUIRED` |

### Protocol Specification

New `docs/spec.mdx` — a standalone protocol specification covering the full
Agent Auth design:

- Problem statement and design principles
- Actor model (Agent, Host, Server) and communication flow
- Entity definitions with field-level invariants
- Authentication: keypair generation, JWT signing, request binding
- Three-state lifecycle (active → expired → revoked) with reactivation
- Authorization model: opaque scopes, resource scoping, multi-grantor,
  scope escalation, host pre-authorization
- Host registration: dynamic (first-use), explicit, and remote JWKS
- Agent creation flows: first-time (unknown host), silent (via host JWT),
  and scope-exceeds-pre-authorization
- Key rotation for agents and hosts (including JWKS-based)
- Auditability and security considerations

### Agent Session Shape

The `AgentSession` type has changed. The flat fields (`scopes`, `role`, `orgId`,
`workgroupId`, `enrollmentId`, `source`) are replaced with a `permissions` array
and `hostId`:

```ts
// Before
agent.scopes        // string[]
agent.role           // string | null
agent.orgId          // string | null
agent.workgroupId    // string | null
agent.enrollmentId   // string | null
agent.source         // string | null

// After
agent.permissions    // Array<{ scope, referenceId, grantedBy, status }>
agent.hostId         // string
```

### Agent Client: Automatic Request Binding

`createAgentClient` now includes DPoP-style request binding (`htm`, `htu`,
`ath`) in every JWT it signs. The internal `getAuthHeader()` has been replaced
with `signRequest(method, path, body)`. Every call to `agent.fetch()` and
`agent.getSession()` automatically binds the JWT to the exact request.

### MCP Tools: Request Binding

The MCP tool `make_authenticated_request` now includes request binding claims
when making authenticated requests.

### New Crypto Exports

- `hashRequestBody(body)` — compute a SHA-256 base64url digest for request
  binding's `ath` claim. Exported from `@better-auth/agent-auth/crypto`.
- `RequestBinding` interface — `{ method, path, bodyHash? }`.
- `signAgentJWT` now accepts an optional `requestBinding` parameter.

### Update Agent Simplified

`updateAgent` only accepts `name` and `metadata`. The `scopes` and `role`
parameters have been removed — permissions are now managed exclusively through
the scope escalation flow (`request-scope` → `approve-scope`).

### Scope Escalation Flow Changes

- **`request-scope`** no longer accepts a `name` parameter. The `requestId`
  returned is now the agent ID (not a separate scope request record ID).
  Response includes `pendingPermissionIds` array.
- **`approve-scope`** `requestId` is now the agent ID. The endpoint resolves
  all pending `agentPermission` rows for that agent. Response no longer includes
  merged `scopes` — only `added` (the scopes that were approved).
- **`scope-request-status`** queries the `agentPermission` table directly.
  The `requestId` is the agent ID. Returns `existingScopes` (active) and
  `requestedScopes` (pending).

### Permission Decay on Reactivation

When an expired agent is reactivated (transparent or explicit), all existing
permissions are deleted and re-created from the host's `scopes` budget
(scope decay). If no host is associated, existing permissions are kept as-is.

### List / Get Agent Response Changes

- `listAgents` and `getAgent` now return a `permissions` array instead of
  flat `scopes`, `role`, `orgId`, `workgroupId` fields.
- `listAgents` removed `orgId` and `workgroupId` query filters.
- `listAgents` `sortBy` is now a strict enum: `"createdAt" | "lastUsedAt" | "name"`.

### Discovery Endpoint Changes

- `supportedAlgorithms` renamed to `algorithms`
- `availableScopes` renamed to `scopes` and now returns objects
  (`{ name, description }`) instead of plain strings.

### Client Plugin

- Removed workgroup client routes (`/agent/workgroup/*`).
- Renamed enrollment routes to host routes (`/agent/host/*`).
