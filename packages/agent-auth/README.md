# Agent Auth Plugin

Better Auth plugin implementing the [Agent Auth Protocol](https://github.com/nicepkg/agent-auth-protocol) for agent-based authentication and capability authorization.

## Installation

```bash
npm install @better-auth/agent-auth
```

## Quick Start

```ts
import { betterAuth } from "better-auth";
import { agentAuth } from "@better-auth/agent-auth";

const auth = betterAuth({
  plugins: [
    agentAuth({
      providerName: "my-service",
      providerDescription: "My API service",
      capabilities: [
        {
          name: "read_data",
          description: "Read user data",
          input: {
            type: "object",
            properties: { id: { type: "string" } },
          },
        },
        {
          name: "transfer_money",
          description: "Transfer funds",
          input: {
            type: "object",
            required: ["amount", "to"],
            properties: {
              amount: { type: "number" },
              to: { type: "string" },
              currency: { type: "string" },
            },
          },
        },
      ],
      onExecute: async ({ capability, arguments: args, agentSession }) => {
        // Handle capability execution
        return { success: true };
      },
    }),
  ],
});
```

**Important:** You must expose the discovery document at `/.well-known/agent-configuration` in your app for agents to discover your provider. For example, in Next.js:

```ts
// app/.well-known/agent-configuration/route.ts
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  return auth.api.getAgentConfiguration({ headers: req.headers });
}
```

## Constraints (Section 2.13)

Capabilities can be granted with scoped constraints that restrict the allowed input values:

```ts
// During registration or request-capability, clients can pass:
{
  "capabilities": [
    "read_data",
    {
      "name": "transfer_money",
      "constraints": {
        "amount": { "max": 1000 },
        "currency": { "in": ["USD", "EUR"] }
      }
    }
  ]
}
```

Supported constraint operators:

| Operator | Description                                        | Example                           |
| -------- | -------------------------------------------------- | --------------------------------- |
| `eq`     | Exact value match (also shorthand: bare primitive) | `{ "eq": "USD" }` or just `"USD"` |
| `min`    | Inclusive lower bound (numeric)                    | `{ "min": 0 }`                    |
| `max`    | Inclusive upper bound (numeric)                    | `{ "max": 1000 }`                 |
| `in`     | Value must be in list                              | `{ "in": ["USD", "EUR"] }`        |
| `not_in` | Value must NOT be in list                          | `{ "not_in": ["BTC"] }`           |

Constraints are validated at execution time. If an argument violates a constraint, the server returns `403 constraint_violated`. Unknown operators return `400 unknown_constraint_operator`.

## Proof of Presence / WebAuthn (Section 8.11)

Capabilities can require biometric verification (fingerprint, face scan, hardware key) to prevent AI agents with browser access from auto-approving sensitive operations.

```ts
agentAuth({
  capabilities: [
    {
      name: "read_data",
      description: "Read user data",
      approvalStrength: "session", // default — normal approval
    },
    {
      name: "delete_project",
      description: "Delete a project",
      approvalStrength: "webauthn", // requires physical presence
    },
  ],
  proofOfPresence: {
    enabled: true,
    // rpId and origin are auto-derived from baseURL if omitted
  },
  onExecute: async ({ capability, arguments: args }) => {
    return { success: true };
  },
});
```

When using `createFromOpenAPI`, set `approvalStrength` by HTTP method:

```ts
createFromOpenAPI(spec, {
  baseUrl: "https://api.example.com",
  approvalStrength: {
    GET: "session",
    POST: "webauthn",
    PUT: "webauthn",
    DELETE: "webauthn",
  },
});
```

Approval strength levels:

| Level        | Description                                                     |
| ------------ | --------------------------------------------------------------- |
| `"none"`     | Auto-grant, no user interaction                                 |
| `"session"`  | Standard session-based approval (default)                       |
| `"webauthn"` | Requires WebAuthn assertion with `userVerification: "required"` |

The approval endpoint returns `code: "webauthn_required"` with WebAuthn challenge options when a capability requires it. The client completes the WebAuthn ceremony and retries with the assertion.

Requires the Better Auth passkey plugin for passkey registration.

## Configuration

| Option                       | Type           | Default                            | Description                         |
| ---------------------------- | -------------- | ---------------------------------- | ----------------------------------- |
| `providerName`               | `string`       | -                                  | Provider name for discovery         |
| `providerDescription`        | `string`       | -                                  | Human-readable description          |
| `modes`                      | `AgentMode[]`  | `["delegated", "autonomous"]`      | Supported registration modes        |
| `capabilities`               | `Capability[]` | -                                  | Capability definitions              |
| `onExecute`                  | `function`     | -                                  | Capability execution handler        |
| `approvalMethods`            | `string[]`     | `["ciba", "device_authorization"]` | Supported approval methods          |
| `allowedKeyAlgorithms`       | `string[]`     | `["Ed25519"]`                      | Allowed key algorithms              |
| `agentSessionTTL`            | `number`       | `3600`                             | Session TTL in seconds              |
| `agentMaxLifetime`           | `number`       | `86400`                            | Max lifetime in seconds             |
| `maxAgentsPerUser`           | `number`       | `25`                               | Max active agents per user          |
| `blockedCapabilities`        | `string[]`     | `[]`                               | Capabilities that cannot be granted |
| `requireAuthForCapabilities` | `boolean`      | `false`                            | Require auth to list capabilities   |
| `deviceAuthorizationPage`    | `string`       | `"/device/capabilities"`           | Device auth approval page URL       |
| `proofOfPresence`            | `object`       | `{ enabled: false }`               | WebAuthn proof-of-presence config   |
| `trustProxy`                 | `boolean`      | `false`                            | Trust X-Forwarded-Proto header      |

## Agent session outside `onExecute`

Capabilities with a custom **`location`** are invoked on your own HTTP routes. The agent sends **`Authorization: Bearer`** with its JWT. Pass the incoming headers (from **`request.headers`** or your framework’s equivalent) into **`auth.api.getAgentSession({ headers })`**, or use **`verifyAgentRequest(request, auth)`** if you prefer forwarding a full **`Request`** through **`auth.handler`**—same verification either way.

Then check **`agentSession.agent.capabilityGrants`** for an active grant for your capability. If the grant has **`constraints`**, enforce them in your handler (constraint validation is not run automatically on arbitrary URLs).

## Endpoints

| Method | Path                        | Description                                                  |
| ------ | --------------------------- | ------------------------------------------------------------ |
| GET    | `/agent/session`            | Resolve agent JWT → session JSON (for custom route handlers) |
| GET    | `/agent-configuration`      | Discovery document (Section 5.1)                             |
| GET    | `/capability/list`          | List capabilities (Section 5.2)                              |
| GET    | `/capability/describe`      | Describe a capability (Section 5.2.1)                        |
| POST   | `/agent/register`           | Register an agent (Section 6.3)                              |
| POST   | `/agent/request-capability` | Request capabilities (Section 6.4)                           |
| GET    | `/agent/status`             | Agent status (Section 6.5)                                   |
| POST   | `/capability/execute`       | Execute a capability (Section 6.11)                          |
| POST   | `/agent/introspect`         | Introspect a token                                           |
| POST   | `/agent/revoke`             | Revoke an agent                                              |
| POST   | `/agent/rotate-key`         | Rotate agent key (Section 6.8)                               |
| POST   | `/agent/reactivate`         | Reactivate expired agent                                     |
| POST   | `/agent/approve-capability` | Approve/deny pending capabilities                            |
| POST   | `/agent/grant-capability`   | Directly grant capabilities                                  |
| POST   | `/host/create`              | Create a host                                                |
| POST   | `/host/enroll`              | Enroll host with token                                       |
| POST   | `/host/revoke`              | Revoke a host                                                |

## License

MIT
