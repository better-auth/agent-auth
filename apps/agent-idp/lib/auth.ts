import { agentAuth } from "@better-auth/agent-auth";
import { betterAuth } from "better-auth";
import { deviceAuthorization } from "better-auth/plugins";
import Database from "better-sqlite3";

export const auth = betterAuth({
	baseURL: process.env.BETTER_AUTH_URL || "http://localhost:4000",
	database: new Database("demo.db"),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [
		agentAuth({
			rateLimit: false,
			approvalMethods: ["device_authorization", "ciba"],
		}),
		deviceAuthorization({
			expiresIn: "5m",
			interval: "5s",
		}),
	],
});
