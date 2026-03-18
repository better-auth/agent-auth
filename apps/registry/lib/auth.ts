import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { db } from "./db";
import * as schema from "./db/schema";

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
      if (
        ctx.path === "/oauth2/register" &&
        ctx.body &&
        !ctx.body.token_endpoint_auth_method
      ) {
        return {
          context: {
            body: {
              ...ctx.body,
              token_endpoint_auth_method: "none",
            },
          },
        };
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
      validAudiences: [`${BASE_URL}`],
    }),
  ],
});

export type Auth = typeof auth;
