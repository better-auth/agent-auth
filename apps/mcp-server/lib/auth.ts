import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { pool } from "./db";

const BASE_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3400";

export const auth = betterAuth({
  baseURL: BASE_URL,
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
  disabledPaths: ["/token"],
  plugins: [
    jwt(),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      validAudiences: [`${BASE_URL}/api`],
    }),
  ],
});

export type Auth = typeof auth;
