"use client";

import { passkeyClient } from "@better-auth/passkey/client";
import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	plugins: [genericOAuthClient(), passkeyClient()],
});

export const { signIn, signOut, useSession } = authClient;
