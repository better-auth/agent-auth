import { agentAuthClient } from "@better-auth/agent-auth/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	plugins: [agentAuthClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
