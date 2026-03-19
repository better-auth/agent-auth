import { createAuthClient } from "better-auth/react";
import { agentAuthClient } from "@better-auth/agent-auth/client";

export const authClient = createAuthClient({
  plugins: [agentAuthClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
