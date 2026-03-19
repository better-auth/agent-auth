import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

type ConstraintPrim = string | number | boolean;
type ConstraintOps = {
  eq?: ConstraintPrim;
  min?: number;
  max?: number;
  in?: ConstraintPrim[];
  not_in?: ConstraintPrim[];
};
type ConstraintRecord = Record<string, ConstraintPrim | ConstraintOps>;

function parseJSON<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

export const agentSchema = () =>
  ({
    agentHost: {
      fields: {
        name: {
          type: "string",
          required: false,
          input: false,
        },
        userId: {
          type: "string",
          references: { model: "user", field: "id", onDelete: "cascade" },
          required: false,
          input: false,
          index: true,
        },
        defaultCapabilities: {
          type: "string",
          required: false,
          input: false,
          transform: {
            input(value: unknown) {
              return JSON.stringify(value);
            },
            output(value: unknown) {
              if (!value) return [];
              return parseJSON<string[]>(value as string);
            },
          },
        },
        publicKey: {
          type: "string",
          required: false,
          input: false,
        },
        kid: {
          type: "string",
          required: false,
          input: false,
          index: true,
        },
        jwksUrl: {
          type: "string",
          required: false,
          input: false,
        },
        enrollmentTokenHash: {
          type: "string",
          required: false,
          input: false,
          index: true,
        },
        enrollmentTokenExpiresAt: {
          type: "date",
          required: false,
          input: false,
        },
        status: {
          type: "string",
          required: true,
          input: false,
          defaultValue: "active",
          index: true,
        },
        activatedAt: {
          type: "date",
          required: false,
          input: false,
        },
        expiresAt: {
          type: "date",
          required: false,
          input: false,
        },
        lastUsedAt: {
          type: "date",
          required: false,
          input: false,
        },
        createdAt: {
          type: "date",
          required: true,
          input: false,
        },
        updatedAt: {
          type: "date",
          required: true,
          input: false,
        },
      },
    },
    agent: {
      fields: {
        name: {
          type: "string",
          required: true,
          input: false,
        },
        userId: {
          type: "string",
          references: { model: "user", field: "id", onDelete: "cascade" },
          required: false,
          input: false,
          index: true,
        },
        hostId: {
          type: "string",
          references: {
            model: "agentHost",
            field: "id",
            onDelete: "cascade",
          },
          required: true,
          input: false,
          index: true,
        },
        status: {
          type: "string",
          required: true,
          input: false,
          defaultValue: "active",
          index: true,
        },
        mode: {
          type: "string",
          required: true,
          input: false,
          defaultValue: "delegated",
        },
        publicKey: {
          type: "string",
          required: true,
          input: false,
        },
        kid: {
          type: "string",
          required: false,
          input: false,
          index: true,
        },
        jwksUrl: {
          type: "string",
          required: false,
          input: false,
        },
        lastUsedAt: {
          type: "date",
          required: false,
          input: false,
        },
        activatedAt: {
          type: "date",
          required: false,
          input: false,
        },
        expiresAt: {
          type: "date",
          required: false,
          input: false,
        },
        metadata: {
          type: "string",
          required: false,
          input: true,
          transform: {
            input(value: unknown) {
              return JSON.stringify(value);
            },
            output(value: unknown) {
              if (!value) return null;
              return parseJSON<Record<string, unknown>>(value as string);
            },
          },
        },
        createdAt: {
          type: "date",
          required: true,
          input: false,
        },
        updatedAt: {
          type: "date",
          required: true,
          input: false,
        },
      },
    },
    agentCapabilityGrant: {
      fields: {
        agentId: {
          type: "string",
          references: { model: "agent", field: "id", onDelete: "cascade" },
          required: true,
          input: false,
          index: true,
        },
        capability: {
          type: "string",
          required: true,
          input: false,
          index: true,
        },
        deniedBy: {
          type: "string",
          references: { model: "user", field: "id", onDelete: "cascade" },
          required: false,
          input: false,
        },
        grantedBy: {
          type: "string",
          references: { model: "user", field: "id", onDelete: "cascade" },
          required: false,
          input: false,
          index: true,
        },
        expiresAt: {
          type: "date",
          required: false,
          input: false,
        },
        createdAt: {
          type: "date",
          required: true,
          input: false,
        },
        updatedAt: {
          type: "date",
          required: true,
          input: false,
        },
        status: {
          type: "string",
          required: true,
          input: false,
          defaultValue: "active",
          index: true,
        },
        reason: {
          type: "string",
          required: false,
          input: false,
        },
        constraints: {
          type: "string",
          required: false,
          input: false,
          transform: {
            input(value: unknown) {
              if (!value) return null;
              return typeof value === "string" ? value : JSON.stringify(value);
            },
            output(value: unknown) {
              if (!value) return null;
              return parseJSON<ConstraintRecord>(value as string);
            },
          },
        },
      },
    },
    approvalRequest: {
      fields: {
        method: {
          type: "string",
          required: true,
          input: false,
        },
        agentId: {
          type: "string",
          references: {
            model: "agent",
            field: "id",
            onDelete: "cascade",
          },
          required: false,
          input: false,
          index: true,
        },
        hostId: {
          type: "string",
          references: {
            model: "agentHost",
            field: "id",
            onDelete: "cascade",
          },
          required: false,
          input: false,
          index: true,
        },
        userId: {
          type: "string",
          references: {
            model: "user",
            field: "id",
            onDelete: "cascade",
          },
          required: false,
          input: false,
          index: true,
        },
        capabilities: {
          type: "string",
          required: false,
          input: false,
        },
        status: {
          type: "string",
          required: true,
          input: false,
          defaultValue: "pending",
          index: true,
        },
        userCodeHash: {
          type: "string",
          required: false,
          input: false,
        },
        loginHint: {
          type: "string",
          required: false,
          input: false,
        },
        bindingMessage: {
          type: "string",
          required: false,
          input: false,
        },
        clientNotificationToken: {
          type: "string",
          required: false,
          input: false,
        },
        clientNotificationEndpoint: {
          type: "string",
          required: false,
          input: false,
        },
        deliveryMode: {
          type: "string",
          required: false,
          input: false,
        },
        interval: {
          type: "number",
          required: true,
          input: false,
        },
        lastPolledAt: {
          type: "date",
          required: false,
          input: false,
        },
        expiresAt: {
          type: "date",
          required: true,
          input: false,
        },
        createdAt: {
          type: "date",
          required: true,
          input: false,
        },
        updatedAt: {
          type: "date",
          required: true,
          input: false,
        },
      },
    },
  }) satisfies BetterAuthPluginDBSchema;
