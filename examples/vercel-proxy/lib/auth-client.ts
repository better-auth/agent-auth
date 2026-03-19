"use client";

import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  plugins: [genericOAuthClient(), passkeyClient()],
});

export const { signIn, signOut, useSession } = authClient;
