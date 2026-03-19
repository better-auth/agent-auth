import { createAuthEndpoint } from "@better-auth/core/api";
import { TABLE } from "../../constants";
import type { Agent, AgentCapabilityGrant, ApprovalRequest } from "../../types";
import { sessionMiddleware } from "better-auth/api";

export function cibaPending() {
  return createAuthEndpoint(
    "/agent/ciba/pending",
    {
      method: "GET",
      use: [sessionMiddleware],
      metadata: {
        openapi: {
          description: "List pending approval requests for the current user.",
        },
      },
    },
    async (ctx) => {
      const session = ctx.context.session;

      const requests = await ctx.context.adapter.findMany<ApprovalRequest>({
        model: TABLE.approval,
        where: [
          { field: "userId", value: session.user.id },
          { field: "status", value: "pending" },
        ],
        sortBy: { field: "createdAt", direction: "desc" },
      });

      const now = new Date();
      const active = requests.filter((r) => new Date(r.expiresAt) > now);

      const results = await Promise.all(
        active.map(async (r) => {
          let agentName: string | null = null;
          let grantConstraints: Record<string, unknown> | null = null;
          let capReasons: Record<string, string> | null = null;

          if (r.agentId) {
            const agent = await ctx.context.adapter.findOne<Agent>({
              model: TABLE.agent,
              where: [{ field: "id", value: r.agentId }],
            });
            agentName = agent?.name ?? null;

            const pendingGrants = await ctx.context.adapter.findMany<AgentCapabilityGrant>({
              model: TABLE.grant,
              where: [
                {
                  field: "agentId",
                  value: r.agentId,
                },
                {
                  field: "status",
                  value: "pending",
                },
              ],
            });

            const withConstraints = pendingGrants.filter((g) => g.constraints);
            if (withConstraints.length > 0) {
              grantConstraints = {};
              for (const g of withConstraints) {
                (grantConstraints as Record<string, unknown>)[g.capability] = g.constraints;
              }
            }

            const withReason = pendingGrants.filter((g) => g.reason);
            if (withReason.length > 0) {
              capReasons = {};
              for (const g of withReason) {
                capReasons[g.capability] = g.reason!;
              }
            }
          }

          return {
            approval_id: r.id,
            method: r.method,
            agent_id: r.agentId ?? null,
            agent_name: agentName,
            binding_message: r.bindingMessage ?? null,
            capabilities: r.capabilities ? r.capabilities.split(/\s+/).filter(Boolean) : [],
            capability_constraints: grantConstraints,
            capability_reasons: capReasons,
            expires_in: Math.max(
              0,
              Math.floor((new Date(r.expiresAt).getTime() - now.getTime()) / 1000),
            ),
            created_at: r.createdAt,
          };
        }),
      );

      return ctx.json({ requests: results });
    },
  );
}
