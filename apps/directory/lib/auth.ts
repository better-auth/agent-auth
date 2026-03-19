import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { db } from "./db";
import * as schema from "./db/schema";
import { normalizeLoopbackUri } from "./loopback";

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:4200";

export const auth = betterAuth({
  baseURL: BASE_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  disabledPaths: ["/token"],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/oauth2/register" && ctx.body) {
        const body = { ...ctx.body, token_endpoint_auth_method: "none" };

        // Vercel rewrites 127.0.0.1 → localhost in query strings,
        // so we normalize stored redirect URIs to localhost to ensure
        // the authorize comparison matches. See RFC 8252 §7.3.
        if (Array.isArray(body.redirect_uris)) {
          body.redirect_uris = body.redirect_uris.map(normalizeLoopbackUri);
        }

        return { context: { body } };
      }
    }),
  },
  plugins: [
    jwt(),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // RFC 8707 — resource indicator sent by MCP clients during token exchange
      validAudiences: [BASE_URL, `${BASE_URL}/`, `${new URL(BASE_URL).origin}/api/mcp`],
      rateLimit: {
        register: { window: 60, max: 50 },
      },
    }),
  ],
  trustedOrigins: ["chrome-extension://", "https://claude.ai", "https://api.anthropic.com"],
});

export type Auth = typeof auth;
