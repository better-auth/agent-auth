import { agentAuth } from "@better-auth/agent-auth";
import { fromOpenAPI } from "@better-auth/agent-auth/openapi";
import { betterAuth } from "better-auth";

const VERCEL_OPENAPI_URL =
	"https://spec.speakeasy.com/vercel/vercel-docs/vercel-oas-with-code-samples";

const vercelSpec = await fetch(VERCEL_OPENAPI_URL).then((r) => r.json());
const vercelCapabilities = fromOpenAPI(vercelSpec, "https://api.vercel.com");

export const auth = betterAuth({
    basePath: "/",
	plugins: [
		agentAuth({
			providerName: "vercel",
			providerDescription:
				"A deployment platform for your apps. Next.js, React, Node.js, etc.",
			modes: ["delegated", "autonomous"],
			capabilities: vercelCapabilities,
		}),
	],
});
