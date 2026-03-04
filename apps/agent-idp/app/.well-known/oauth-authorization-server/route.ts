import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth/auth";

export const GET = oauthProviderAuthServerMetadata(auth);
