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
