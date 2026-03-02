import { agentAuthClient } from "@better-auth/agent-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	plugins: [agentAuthClient(), deviceAuthorizationClient()],
});
