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
		agentEnrollment: {
			fields: {
				userId: {
					type: "string",
					references: { model: "user", field: "id", onDelete: "cascade" },
					required: true,
					input: false,
					index: true,
				},
				appSource: {
					type: "string",
					required: false,
					input: false,
				},
				baseScopes: {
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
				enrollmentId: {
					type: "string",
					references: {
						model: "agentEnrollment",
						field: "id",
						onDelete: "cascade",
					},
					required: false,
					input: false,
					index: true,
				},
				orgId: {
					type: "string",
					required: false,
					input: false,
					index: true,
				},
				workgroupId: {
					type: "string",
					references: {
						model: "agentWorkgroup",
						field: "id",
						onDelete: "set null",
					},
					required: false,
					input: false,
					index: true,
				},
				source: {
					type: "string",
					required: false,
					input: false,
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
				role: {
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
		agentScopeRequest: {
			fields: {
				agentId: {
					type: "string",
					references: { model: "agent", field: "id", onDelete: "cascade" },
					required: true,
					input: false,
					index: true,
				},
				userId: {
					type: "string",
					references: { model: "user", field: "id", onDelete: "cascade" },
					required: true,
					input: false,
					index: true,
				},
				agentName: {
					type: "string",
					required: true,
					input: false,
				},
				newName: {
					type: "string",
					required: false,
					input: false,
				},
				reason: {
					type: "string",
					required: false,
					input: false,
				},
				existingScopes: {
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
				requestedScopes: {
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
				status: {
					type: "string",
					required: true,
					input: false,
					defaultValue: "pending",
				},
				createdAt: {
					type: "date",
					required: true,
					input: false,
				},
				expiresAt: {
					type: "date",
					required: true,
					input: false,
				},
			},
		},
		agentWorkgroup: {
			fields: {
				name: {
					type: "string",
					required: true,
					input: false,
				},
				description: {
					type: "string",
					required: false,
					input: false,
				},
				orgId: {
					type: "string",
					required: false,
					input: false,
					index: true,
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
