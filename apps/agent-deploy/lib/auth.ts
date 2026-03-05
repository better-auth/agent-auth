import { agentAuth } from "@better-auth/agent-auth";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import {
	anonymous,
	bearer,
	deviceAuthorization,
} from "better-auth/plugins";
import { sqliteInstance } from "./db";
import { db } from "./db";
import { site } from "./db/schema";

const VALID_SCOPES = new Set([
	"list_sites",
	"create_site",
	"get_site",
	"deploy",
	"list_deployments",
	"delete_site",
	"rollback",
]);

async function moveSitesToUser(fromUserId: string, toUserId: string) {
	db.update(site).set({ userId: toUserId }).where(eq(site.userId, fromUserId)).run();
}

export const auth = betterAuth({
	database: sqliteInstance,
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
	},
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60,
		},
	},
	plugins: [
		bearer(),
		deviceAuthorization(),
		anonymous({
			disableDeleteAnonymousUser: true
		}),
		agentAuth({
			providerName: "AgentDeploy",
			providerDescription:
				"Static HTML hosting platform — deploy HTML sites instantly",
			modes: ["delegated", "autonomous"],
			approvalMethods: ["device_authorization"],
			allowDynamicHostRegistration: true,
			dynamicHostDefaultScopes: ({
				mode,
			}: {
				mode: "autonomous" | "delegated";
			}) =>
				mode === "autonomous"
					? [
							"list_sites",
							"create_site",
							"get_site",
							"deploy",
							"list_deployments",
							"delete_site",
							"rollback",
						]
					: ["list_sites", "get_site", "list_deployments"],
			createReferenceIdForAutonomousHost: async () => {
				const anonymousResult = (await auth.api.signInAnonymous({
					headers: new Headers(),
				})) as
					| { user?: { id?: string } }
					| { id?: string }
					| null;

				const anonymousUserId =
					anonymousResult &&
					"user" in anonymousResult &&
					anonymousResult.user?.id
						? anonymousResult.user.id
						: anonymousResult &&
							  "id" in anonymousResult &&
							  typeof anonymousResult.id === "string"
							? anonymousResult.id
							: null;

				if (!anonymousUserId) {
					throw new Error("Failed to create anonymous owner for autonomous host.");
				}

				return anonymousUserId;
			},
			onHostClaimed: async ({
				referenceId,
				userId,
			}: {
				referenceId: string | null;
				userId: string;
			}) => {
				if (!referenceId || referenceId === userId) {
					return;
				}
				await moveSitesToUser(referenceId, userId);
			},
			validateScopes(scopes: string[]) {
				const invalid = scopes.filter((s: string) => s !== "*" && !VALID_SCOPES.has(s));
				if (invalid.length > 0) {
					return false;
				}
				return true;
			},
			capabilities: [
				{
					name: "list_sites",
					description: "List all sites owned by the authenticated user",
					type: "http",
					http: {
						method: "GET",
						operationId: "listSites",
						url: "http://localhost:4100/api/sites",
					},
				},
				{
					name: "create_site",
					description: "Create a new site. Returns the site with its slug, id, and live URL.",
					type: "http",
					http: {
						method: "POST",
						operationId: "createSite",
						url: "http://localhost:4100/api/sites",
						requestBody: {
							required: true,
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: { name: { type: "string" } },
										required: ["name"],
									},
								},
							},
						},
					},
				},
				{
					name: "get_site",
					description: "Get site details including its latest deployment",
					type: "http",
					http: {
						method: "GET",
						operationId: "getSite",
						url: "http://localhost:4100/api/sites/{id}",
						parameters: [
							{ name: "id", in: "path", required: true },
						],
					},
				},
				{
					name: "deploy",
					description:
						"Deploy HTML to a site. The html field should contain the full HTML document. Returns the deployment with a live URL at /s/{slug}.",
					type: "http",
					http: {
						method: "POST",
						operationId: "deploySite",
						url: "http://localhost:4100/api/sites/{id}/deploy",
						parameters: [
							{ name: "id", in: "path", required: true },
						],
						requestBody: {
							required: true,
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											html: { type: "string", description: "Full HTML document" },
											label: { type: "string", description: "Deployment label" },
										},
										required: ["html"],
									},
								},
							},
						},
					},
				},
				{
					name: "list_deployments",
					description: "List all deployments for a site, newest first",
					type: "http",
					http: {
						method: "GET",
						operationId: "listDeployments",
						url: "http://localhost:4100/api/sites/{id}/deployments",
						parameters: [
							{ name: "id", in: "path", required: true },
						],
					},
				},
				{
					name: "delete_site",
					description: "Delete a site and all its deployments",
					type: "http",
					http: {
						method: "DELETE",
						operationId: "deleteSite",
						url: "http://localhost:4100/api/sites/{id}",
						parameters: [
							{ name: "id", in: "path", required: true },
						],
					},
				},
				{
					name: "rollback",
					description: "Rollback to a previous deployment by deployment ID",
					type: "http",
					http: {
						method: "POST",
						operationId: "rollbackDeployment",
						url: "http://localhost:4100/api/deployments/{id}/rollback",
						parameters: [
							{ name: "id", in: "path", required: true },
						],
					},
				},
			],
		}),
	],
	trustedOrigins: ["http://localhost:4100"],
	baseURL: "http://localhost:4100",
	basePath: "/api/auth",
});

export type Session = typeof auth.$Infer.Session;
