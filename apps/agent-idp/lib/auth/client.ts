"use client";

import {
	deviceAuthorizationClient,
	organizationClient,
	usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, admin, auditor, member, owner } from "@/lib/auth/permissions";

export const authClient = createAuthClient({
	baseURL:
		typeof window !== "undefined"
			? window.location.origin
			: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:4000",
	plugins: [
		usernameClient(),
		organizationClient({
			ac,
			roles: { owner, admin, member, auditor },
		}),
		deviceAuthorizationClient(),
	],
});

export const {
	signIn,
	signUp,
	signOut,
	useSession,
	changePassword,
	updateUser,
} = authClient;
