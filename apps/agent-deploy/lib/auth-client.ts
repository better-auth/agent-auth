import { createAuthClient } from "better-auth/react";
import {
	anonymousClient,
	multiSessionClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
	baseURL: "http://localhost:4100",
	plugins: [multiSessionClient(), anonymousClient()],
});
