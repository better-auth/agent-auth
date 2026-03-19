import { agentAuth } from "@better-auth/agent-auth";
import type { Capability } from "@better-auth/agent-auth";
import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  db,
  schema,
  createSite,
  updateSite,
  deleteSite,
  getSite,
  listSites,
  countSites,
  insertLog,
} from "./db";

const MAX_HTML_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_NAME_LENGTH = 200;
const MAX_DESC_LENGTH = 1000;

const capabilities: Capability[] = [
  {
    name: "sites.list",
    description: "List all deployed sites for the authenticated user",
    input: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max number of sites to return (default: all)",
        },
      },
    },
    output: {
      type: "object",
      properties: {
        sites: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              slug: { type: "string" },
              description: { type: "string" },
              url: { type: "string" },
              createdAt: { type: "string" },
              updatedAt: { type: "string" },
            },
          },
        },
        total: { type: "number" },
      },
    },
  },
  {
    name: "sites.get",
    description:
      "Get details of a specific deployed site including its HTML content",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The site ID" },
      },
      required: ["id"],
    },
    output: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        slug: { type: "string" },
        html: { type: "string" },
        description: { type: "string" },
        url: { type: "string" },
        createdAt: { type: "string" },
        updatedAt: { type: "string" },
      },
    },
  },
  {
    name: "sites.create",
    description:
      "Deploy a new HTML site. Provide a name and HTML content to create a live site with a unique URL.",
    input: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Display name for the site",
        },
        html: {
          type: "string",
          description: "The full HTML content to deploy",
        },
        description: {
          type: "string",
          description: "Optional description of the site",
        },
      },
      required: ["name", "html"],
    },
    output: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        slug: { type: "string" },
        url: { type: "string" },
        createdAt: { type: "string" },
      },
    },
  },
  {
    name: "sites.update",
    description: "Update an existing site's HTML content, name, or description",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The site ID to update" },
        name: { type: "string", description: "New display name" },
        html: { type: "string", description: "New HTML content" },
        description: { type: "string", description: "New description" },
      },
      required: ["id"],
    },
    output: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        slug: { type: "string" },
        url: { type: "string" },
        updatedAt: { type: "string" },
      },
    },
  },
  {
    name: "sites.delete",
    description: "Delete a deployed site permanently",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The site ID to delete" },
      },
      required: ["id"],
    },
    output: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        deletedId: { type: "string" },
      },
    },
  },
];

const READ_ONLY_CAPABILITIES = ["sites.list", "sites.get"];
const AUTONOMOUS_CAPABILITIES = [
  "sites.list",
  "sites.get",
  "sites.create",
  "sites.update",
  "sites.delete",
];

function siteUrl(slug: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3100";
  return `${base}/sites/${slug}`;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),

  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    agentAuth({
      providerName: "Agent Deploy",
      freshSessionWindow: 0,
      providerDescription:
        "A deployment platform for HTML sites. AI agents can create, update, and manage static HTML deployments through capability-based authentication.",
      capabilities,
      defaultHostCapabilities: ({ mode }) =>
        mode === "autonomous"
          ? AUTONOMOUS_CAPABILITIES
          : READ_ONLY_CAPABILITIES,
      modes: ["delegated", "autonomous"],
      approvalMethods: ["ciba", "device_authorization"],
      resolveApprovalMethod: ({ preferredMethod, supportedMethods }) => {
        const method = preferredMethod ?? "ciba";
        return supportedMethods.includes(method) ? method : "ciba";
      },
      allowDynamicHostRegistration: true,
      resolveAutonomousUser: ({ hostId }) => ({
        id: `autonomous_${hostId}`,
        name: "Autonomous Agent",
        email: `agent_${hostId}@agent-deploy.local`,
      }),
      onAutonomousAgentClaimed: async ({ hostId, userId }) => {
        const autonomousUserId = `autonomous_${hostId}`;
        const sites = await listSites(autonomousUserId);
        for (const s of sites) {
          await db
            .update(schema.site)
            .set({ userId })
            .where(eq(schema.site.id, s.id));
        }
      },
      onExecute: async ({ capability, arguments: args, agentSession }) => {
        const userId = agentSession.user.id;

        switch (capability) {
          case "sites.list": {
            const sites = await listSites(userId);
            const limited = args?.limit
              ? sites.slice(0, Number(args.limit))
              : sites;
            return {
              sites: limited.map((s) => ({
                id: s.id,
                name: s.name,
                slug: s.slug,
                description: s.description,
                url: siteUrl(s.slug),
                createdAt: s.createdAt,
                updatedAt: s.updatedAt,
              })),
              total: await countSites(userId),
            };
          }

          case "sites.get": {
            if (!args?.id) throw new Error("Missing required argument: id");
            const site = await getSite(String(args.id));
            if (!site || site.userId !== userId) {
              throw new Error("Site not found");
            }
            return {
              id: site.id,
              name: site.name,
              slug: site.slug,
              html: site.html,
              description: site.description,
              url: siteUrl(site.slug),
              createdAt: site.createdAt,
              updatedAt: site.updatedAt,
            };
          }

          case "sites.create": {
            if (!args?.name || !args?.html) {
              throw new Error("Missing required arguments: name, html");
            }
            const html = String(args.html);
            if (html.length > MAX_HTML_SIZE) {
              throw new Error(
                `HTML content exceeds ${MAX_HTML_SIZE / 1024 / 1024} MB limit`,
              );
            }
            const site = await createSite({
              name: String(args.name).slice(0, MAX_NAME_LENGTH),
              html,
              description: args.description
                ? String(args.description).slice(0, MAX_DESC_LENGTH)
                : undefined,
              userId,
            });
            return {
              id: site.id,
              name: site.name,
              slug: site.slug,
              url: siteUrl(site.slug),
              createdAt: site.createdAt,
            };
          }

          case "sites.update": {
            if (!args?.id) throw new Error("Missing required argument: id");
            const updateHtml = args.html ? String(args.html) : undefined;
            if (updateHtml && updateHtml.length > MAX_HTML_SIZE) {
              throw new Error(
                `HTML content exceeds ${MAX_HTML_SIZE / 1024 / 1024} MB limit`,
              );
            }
            const updated = await updateSite({
              id: String(args.id),
              userId,
              name: args.name
                ? String(args.name).slice(0, MAX_NAME_LENGTH)
                : undefined,
              html: updateHtml,
              description: args.description
                ? String(args.description).slice(0, MAX_DESC_LENGTH)
                : undefined,
            });
            if (!updated)
              throw new Error("Site not found or not owned by user");
            return {
              id: updated.id,
              name: updated.name,
              slug: updated.slug,
              url: siteUrl(updated.slug),
              updatedAt: updated.updatedAt,
            };
          }

          case "sites.delete": {
            if (!args?.id) throw new Error("Missing required argument: id");
            const success = await deleteSite(String(args.id), userId);
            if (!success)
              throw new Error("Site not found or not owned by user");
            return { success: true, deletedId: String(args.id) };
          }

          default:
            throw new Error(`Unknown capability: ${capability}`);
        }
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
