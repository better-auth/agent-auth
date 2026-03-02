/**
 * MCP Gateway server entry point for the agent-auth demo.
 *
 * Includes the standard gateway tools AND an autonomous
 * self-registration tool for testing mode: "autonomous".
 */

import { generateKeypair } from "@better-auth/agent-auth/agent-client";
import { createGatewayServer } from "@better-auth/agent-auth/gateway-server";
import { createFileStorage } from "@better-auth/agent-auth/mcp-storage-fs";
import { importJWK, SignJWT } from "jose";

const APP_URL = process.env.BETTER_AUTH_URL || "http://localhost:4000";

const storage = createFileStorage({
	encryptionKey: process.env.BETTER_AUTH_ENCRYPTION_KEY || "demo-key",
});

/**
 * Sign a host JWT that embeds JWK objects for unknown-host bootstrap.
 * We use jose directly because signAgentJWT only supports primitive claims.
 */
async function signHostBootstrapJWT(
	hostKeypair: Awaited<ReturnType<typeof generateKeypair>>,
	agentPublicKey: Record<string, unknown>,
) {
	const key = await importJWK(hostKeypair.privateKey, "EdDSA");
	const now = Math.floor(Date.now() / 1000);
	return await new SignJWT({
		host_public_key: hostKeypair.publicKey,
		agent_public_key: agentPublicKey,
	})
		.setSubject(hostKeypair.kid)
		.setIssuedAt(now)
		.setExpirationTime(now + 60)
		.setJti(crypto.randomUUID())
		.setProtectedHeader({ alg: "EdDSA", kid: hostKeypair.kid })
		.sign(key);
}

await createGatewayServer({
	storage,
	appUrl: APP_URL,
	serverName: "agent-auth-demo",
	onServerReady(server: any, z: any) {
		server.tool(
			"self_register",
			"Register yourself as an autonomous agent WITHOUT user authentication. " +
				"The agent is created immediately and can start making requests right away. " +
				"Use this when the user asks you to create your own account, register autonomously, " +
				"or operate independently. To link to a user later, use connect_account.",
			{
				name: z
					.string()
					.describe(
						"A descriptive name for yourself (e.g. 'Autonomous Research Agent')",
					),
				scopes: z
					.array(z.string())
					.optional()
					.describe("Scopes to request (e.g. ['reports.read'])"),
			},
			async (params: { name: string; scopes?: string[] }) => {
				const { name, scopes = [] } = params;

				try {
					const hostKeypair = await generateKeypair();
					const agentKeypair = await generateKeypair();

					const hostJWT = await signHostBootstrapJWT(
						hostKeypair,
						agentKeypair.publicKey,
					);

					const res = await globalThis.fetch(
						`${APP_URL}/api/auth/agent/register`,
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								name,
								hostJWT,
								mode: "autonomous",
								scopes,
							}),
						},
					);

					if (!res.ok) {
						const text = await res.text();
						return {
							content: [
								{
									type: "text" as const,
									text: `Failed to self-register: ${res.status} ${text.slice(0, 300)}`,
								},
							],
						};
					}

					const data = (await res.json()) as {
						agent_id: string;
						name: string;
						status: string;
						host_id: string;
						scopes: string[];
					};

					await storage.saveConnection(data.agent_id, {
						appUrl: APP_URL,
						keypair: agentKeypair,
						name,
						scopes: data.scopes ?? [],
					});

					const lines = [
						`Self-registered as autonomous agent.`,
						`Agent ID: ${data.agent_id}`,
						`Host ID: ${data.host_id}`,
						`Status: ${data.status}`,
					];

					if (data.status === "active") {
						lines.push(
							``,
							`Agent is active. Use agent_request with this Agent ID to make authenticated requests.`,
							`To link to a user account later, use connect_account.`,
						);
					} else {
						lines.push(
							``,
							`Agent is ${data.status}. It may need further action before making requests.`,
						);
					}

					return {
						content: [
							{
								type: "text" as const,
								text: lines.join("\n"),
							},
						],
					};
				} catch (e) {
					return {
						content: [
							{
								type: "text" as const,
								text: `Error: ${e instanceof Error ? e.message : String(e)}`,
							},
						],
					};
				}
			},
		);
	},
});
