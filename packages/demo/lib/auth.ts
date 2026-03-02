import { agentAuth } from "@better-auth/agent-auth";
import { betterAuth } from "better-auth";
import { deviceAuthorization } from "better-auth/plugins";
import Database from "better-sqlite3";

export const auth = betterAuth({
	database: new Database("demo.db"),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		agentAuth({
			rateLimit: false,
		}),
		deviceAuthorization({
			expiresIn: "5m",
			interval: "5s",
		}),
	],
});
