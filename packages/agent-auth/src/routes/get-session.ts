import { createAuthEndpoint } from "@better-auth/core/api";
import type { AgentSession } from "../types";

export function getAgentSession() {
  return createAuthEndpoint(
    "/agent/session",
    {
      method: "GET",
      requireHeaders: true,
      metadata: {
        openapi: {
          description: "Resolve the agent's own session from its bearer token or JWT (§6.5).",
        },
      },
    },
    async (ctx) => {
      const agentSession = (ctx.context as { agentSession?: AgentSession }).agentSession;

      if (!agentSession) {
        return ctx.json(null);
      }

      return ctx.json(agentSession);
    },
  );
}
