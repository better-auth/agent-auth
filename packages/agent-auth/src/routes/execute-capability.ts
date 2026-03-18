import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { TABLE } from "../constants";
import {
  agentError,
  agentAuthChallenge,
  AGENT_AUTH_ERROR_CODES as ERR,
} from "../errors";
import { emit } from "../emit";
import { isAsyncResult, isStreamResult } from "../execute-helpers";
import { tryAutoGrantFromHostBudget } from "./_helpers";
import { validateConstraints } from "../utils/constraints";
import type {
  AgentCapabilityGrant,
  AgentSession,
  ConstraintPrimitive,
  ResolvedAgentAuthOptions,
} from "../types";

/**
 * POST /capability/execute (§6.11).
 *
 * Executes a granted capability on behalf of the agent.
 * Validates the agent JWT, checks that the agent has an active grant
 * for the requested capability, calls the onExecute handler,
 * and returns the result.
 *
 * Supports three interaction modes based on the onExecute return value:
 * - Plain value → sync `{ data: result }`
 * - asyncResult() → 202 with `{ status, status_url }`
 * - streamResult() → SSE `text/event-stream`
 */
export function executeCapability(opts: ResolvedAgentAuthOptions) {
  return createAuthEndpoint(
    "/capability/execute",
    {
      method: "POST",
      body: z.object({
        capability: z.string(),
        arguments: z.record(z.string(), z.unknown()).optional(),
      }),
      requireHeaders: true,
      metadata: {
        openapi: {
          description:
            "Execute a granted capability on behalf of the agent (§6.11).",
        },
      },
    },
    async (ctx) => {
      const agentSession = (ctx.context as Record<string, unknown>)
        .agentSession as AgentSession | undefined;

      if (!agentSession) {
        throw agentError(
          "UNAUTHORIZED",
          ERR.UNAUTHORIZED_SESSION,
          undefined,
          agentAuthChallenge(ctx.context.baseURL),
        );
      }

      const { capability: capabilityName, arguments: args } = ctx.body;

      const allCapabilities = opts.capabilities ?? [];
      const capabilityDef = allCapabilities.find(
        (c) => c.name === capabilityName,
      );
      if (!capabilityDef) {
        throw agentError(
          "NOT_FOUND",
          ERR.CAPABILITY_NOT_FOUND,
          `Capability "${capabilityName}" does not exist.`,
        );
      }

      // §5.3: If the JWT included a `capabilities` claim, the middleware
      // already narrowed capabilityGrants to that intersection. Check
      // for an existing grant first; if missing, try auto-granting from
      // the host's default budget before rejecting.
      const sessionGrant = agentSession.agent.capabilityGrants.find(
        (g) => g.capability === capabilityName,
      );

      let activeGrant: AgentCapabilityGrant | undefined | null;

      if (sessionGrant) {
        const grants =
          await ctx.context.adapter.findMany<AgentCapabilityGrant>({
            model: TABLE.grant,
            where: [
              { field: "agentId", value: agentSession.agent.id },
              { field: "capability", value: capabilityName },
            ],
          });
        const now = new Date();
        activeGrant = grants.find(
          (g) =>
            g.status === "active" &&
            (!g.expiresAt || new Date(g.expiresAt) > now),
        );
      }

      if (!activeGrant) {
        activeGrant = await tryAutoGrantFromHostBudget(
          ctx.context.adapter,
          opts,
          ctx,
          {
            agentId: agentSession.agent.id,
            hostId: agentSession.agent.hostId,
            userId: agentSession.host?.userId ?? null,
            capabilityName,
          },
        );
      }

      if (!activeGrant) {
        throw agentError(
          "FORBIDDEN",
          ERR.CAPABILITY_NOT_GRANTED,
          `Agent does not have an active grant for capability "${capabilityName}".`,
        );
      }

      if (activeGrant.constraints) {
        const constraintArgs = (args ?? {}) as Record<
          string,
          ConstraintPrimitive | undefined
        >;
        const result = validateConstraints(
          activeGrant.constraints,
          constraintArgs,
        );
        if (result.unknownOperators.length > 0) {
          // §2.13: SHOULD include unknown_operators array
          throw agentError(
            "BAD_REQUEST",
            ERR.UNKNOWN_CONSTRAINT_OPERATOR,
            undefined,
            undefined,
            { unknown_operators: result.unknownOperators },
          );
        }
        if (result.violations.length > 0) {
          throw agentError(
            "FORBIDDEN",
            ERR.CONSTRAINT_VIOLATED,
            undefined,
            undefined,
            { violations: result.violations },
          );
        }
      }

      if (!opts.onExecute) {
        throw agentError("INTERNAL_SERVER_ERROR", ERR.EXECUTE_NOT_CONFIGURED);
      }

      const startTime = Date.now();
      let result: unknown;
      let execError: string | undefined;

      try {
        result = await opts.onExecute({
          ctx,
          capability: capabilityName,
          capabilityDef,
          arguments: args,
          agentSession,
        });
      } catch (err) {
        execError = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - startTime;

        emit(
          opts,
          {
            type: "capability.executed",
            capability: capabilityName,
            agentId: agentSession.agent.id,
            hostId: agentSession.agent.hostId,
            userId: agentSession.host?.userId ?? undefined,
            agentName: agentSession.agent.name,
            arguments: args,
            status: "error",
            error: execError,
            durationMs,
          },
          ctx,
        );

        if (err instanceof APIError) throw err;
        throw agentError(
          "INTERNAL_SERVER_ERROR",
          ERR.INTERNAL_ERROR,
          execError,
        );
      }

      const durationMs = Date.now() - startTime;

      emit(
        opts,
        {
          type: "capability.executed",
          capability: capabilityName,
          agentId: agentSession.agent.id,
          hostId: agentSession.agent.hostId,
          userId: agentSession.host?.userId ?? undefined,
          agentName: agentSession.agent.name,
          arguments: args,
          status: "success",
          durationMs,
        },
        ctx,
      );

      if (isAsyncResult(result)) {
        const headers: Record<string, string> = {};
        if (result.retryAfter) {
          headers["Retry-After"] = String(result.retryAfter);
        }
        return ctx.json(
          {
            status: "pending",
            status_url: result.statusUrl,
            ...(result.retryAfter ? { retry_after: result.retryAfter } : {}),
          },
          { status: 202, headers },
        );
      }

      if (isStreamResult(result)) {
        return new Response(result.body, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            ...result.headers,
          },
        });
      }

      return ctx.json({ data: result });
    },
  );
}
