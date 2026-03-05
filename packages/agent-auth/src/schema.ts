import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";

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
				referenceId: {
					type: "string",
					required: false,
					input: false,
					index: true,
				},
				scopes: {
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
		agentPermission: {
			fields: {
				agentId: {
					type: "string",
					references: { model: "agent", field: "id", onDelete: "cascade" },
					required: true,
					input: false,
					index: true,
				},
				scope: {
					type: "string",
					required: true,
					input: false,
				},
				referenceId: {
					type: "string",
					required: false,
					input: false,
					index: true,
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
				},
				reason: {
					type: "string",
					required: false,
					input: false,
				},
			},
		},
		cibaAuthRequest: {
			fields: {
				clientId: {
					type: "string",
					required: true,
					input: false,
				},
				loginHint: {
					type: "string",
					required: true,
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
				scope: {
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
					required: true,
					input: false,
				},
				status: {
					type: "string",
					required: true,
					input: false,
					defaultValue: "pending",
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
