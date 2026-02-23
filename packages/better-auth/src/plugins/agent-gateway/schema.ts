import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import { parseJSON } from "../../client/parser";

export const gatewaySchema = () =>
	({
		mcpProvider: {
			fields: {
				/**
				 * Short unique name for the provider (e.g. "google-drive", "slack").
				 * Used as the namespace prefix for tool scopes.
				 */
				name: {
					type: "string",
					required: true,
					unique: true,
				},
				/**
				 * Human-readable display name (e.g. "Google Drive").
				 */
				displayName: {
					type: "string",
					required: true,
				},
				/**
				 * Transport type: "stdio" or "sse".
				 */
				transport: {
					type: "string",
					required: true,
				},
				/**
				 * For stdio: the command to spawn (e.g. "npx").
				 */
				command: {
					type: "string",
					required: false,
				},
				/**
				 * For stdio: JSON array of command arguments.
				 */
				args: {
					type: "string",
					required: false,
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
				/**
				 * For stdio: JSON object of environment variables.
				 */
				env: {
					type: "string",
					required: false,
					transform: {
						input(value: unknown) {
							return JSON.stringify(value);
						},
						output(value: unknown) {
							if (!value) return null;
							return parseJSON<Record<string, string>>(value as string);
						},
					},
				},
				/**
				 * For SSE: the remote MCP server URL.
				 */
				url: {
					type: "string",
					required: false,
				},
				/**
				 * For SSE: JSON object of HTTP headers.
				 */
				headers: {
					type: "string",
					required: false,
					transform: {
						input(value: unknown) {
							return JSON.stringify(value);
						},
						output(value: unknown) {
							if (!value) return null;
							return parseJSON<Record<string, string>>(value as string);
						},
					},
				},
				/**
				 * JSON mapping of scope names to tool arrays.
				 */
				toolScopes: {
					type: "string",
					required: false,
					transform: {
						input(value: unknown) {
							return JSON.stringify(value);
						},
						output(value: unknown) {
							if (!value) return null;
							return parseJSON<Record<string, string[]>>(value as string);
						},
					},
				},
				/**
				 * Provider status.
				 */
				status: {
					type: "string",
					required: true,
					defaultValue: "active",
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
