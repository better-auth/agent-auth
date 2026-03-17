import { agentAuth } from "@better-auth/agent-auth";
import type { Capability } from "@better-auth/agent-auth";
import { betterAuth } from "better-auth";
import {
  db,
  createSite,
  updateSite,
  deleteSite,
  getSite,
  listSites,
  countSites,
  insertLog,
} from "./db";

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

function siteUrl(slug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100";
  return `${base}/sites/${slug}`;
}

export const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    agentAuth({
      providerName: "Agent Deploy",
      providerDescription:
        "A deployment platform for HTML sites. AI agents can create, update, and manage static HTML deployments through capability-based authentication.",
      capabilities,
      defaultHostCapabilities: READ_ONLY_CAPABILITIES,
      modes: ["delegated", "autonomous"],
      approvalMethods: ["ciba", "device_authorization"],
      allowDynamicHostRegistration: true,
      resolveAutonomousUser: ({ hostId }) => ({
        id: `autonomous_${hostId}`,
        name: "Autonomous Agent",
        email: `agent_${hostId}@agent-deploy.local`,
      }),
      onAutonomousAgentClaimed: async ({ ctx, hostId, userId }) => {
        const autonomousUserId = `autonomous_${hostId}`;
        const sites = listSites(autonomousUserId);
        for (const site of sites) {
          ctx.context.adapter.update({
            model: "site",
            where: [{ field: "id", value: site.id }],
            update: { userId },
          });
        }
      },
      onExecute: async ({ capability, arguments: args, agentSession }) => {
        const userId = agentSession.user.id;

        switch (capability) {
          case "sites.list": {
            const sites = listSites(userId);
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
              total: countSites(userId),
            };
          }

          case "sites.get": {
            if (!args?.id) throw new Error("Missing required argument: id");
            const site = getSite(String(args.id));
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
            const site = createSite({
              name: String(args.name),
              html: String(args.html),
              description: args.description
                ? String(args.description)
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
            const updated = updateSite({
              id: String(args.id),
              userId,
              name: args.name ? String(args.name) : undefined,
              html: args.html ? String(args.html) : undefined,
              description: args.description
                ? String(args.description)
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
            const success = deleteSite(String(args.id), userId);
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
          insertLog.run(
            type ?? null,
            (actorId as string) ?? null,
            (actorType as string) ?? null,
            (agentId as string) ?? null,
            (hostId as string) ?? null,
            (orgId as string) ?? null,
            JSON.stringify(rest),
          );
        } catch {
          // never let logging break the flow
        }
      },
    }),
  ],
});
