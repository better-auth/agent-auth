import { createAuthClient } from "better-auth/client";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";

export const serverClient = createAuthClient({
	plugins: [oauthProviderResourceClient()],
});
