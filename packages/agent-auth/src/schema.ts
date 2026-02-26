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
				userId: {
					type: "string",
					references: { model: "user", field: "id", onDelete: "cascade" },
					required: true,
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
					required: true,
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
					required: true,
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
	}) satisfies BetterAuthPluginDBSchema;
