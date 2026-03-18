import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const GET = oauthProviderAuthServerMetadata(auth);
