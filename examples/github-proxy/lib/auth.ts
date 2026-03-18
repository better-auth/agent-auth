import { agentAuth } from "@better-auth/agent-auth";
import { createFromOpenAPI } from "@better-auth/agent-auth/openapi";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import { db, schema, getSetting, insertLog } from "./db";

const GITHUB_OPENAPI_URL =
  "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json";

const githubSpec = await fetch(GITHUB_OPENAPI_URL).then((r) => r.json());

const openapi = createFromOpenAPI(githubSpec, {
  baseUrl: "https://api.github.com",
  async resolveHeaders({ agentSession, ctx }) {
    const account = await ctx.context.adapter.findOne<{
      accessToken: string | null;
    }>({
      model: "account",
      where: [
        { field: "userId", value: agentSession.user.id },
        { field: "providerId", value: "github" },
      ],
    });

    if (!account?.accessToken) {
      throw new Error(
        "No GitHub access token found. User must sign in with GitHub first.",
      );
    }

    return {
      Authorization: `Bearer ${account.accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  },
});

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scope: [
        "repo",
        "delete_repo",
        "user",
        "read:org",
        "workflow",
        "admin:org",
      ],
    },
  },
  plugins: [
    anonymous(),
    agentAuth({
      freshSessionWindow: () => {
        if (getSetting("freshSessionEnabled") !== "true") return 0;
        return parseInt(getSetting("freshSessionWindow") ?? "300", 10);
      },
      ...openapi,
      providerName: "GitHub",
      providerDescription:
        "GitHub is the world's largest platform for software development, providing Git hosting, code review, CI/CD, project management, and collaboration tools for developers and teams.",
      modes: ["delegated"],
      approvalMethods: ["ciba", "device_authorization"],
      resolveApprovalMethod: ({ preferredMethod, supportedMethods }) => {
        const serverPreferred =
          getSetting("preferredApprovalMethod") ?? "device_authorization";
        const method = preferredMethod ?? serverPreferred;
        return supportedMethods.includes(method)
          ? method
          : "device_authorization";
      },
      onEvent: (event) => {
        try {
          const { type, actorId, actorType, agentId, hostId, orgId, ...rest } =
            event as unknown as Record<string, unknown>;
          insertLog(
            (type as string) ?? null,
            (actorId as string) ?? null,
            (actorType as string) ?? null,
            (agentId as string) ?? null,
            (hostId as string) ?? null,
            (orgId as string) ?? null,
            JSON.stringify(rest),
          ).catch(() => {});
        } catch {
          // never let logging break the flow
        }
      },
    }),
  ],
});
