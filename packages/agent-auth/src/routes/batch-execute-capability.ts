import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod";
import { TABLE } from "../constants";
import { agentError, agentAuthChallenge, AGENT_AUTH_ERROR_CODES as ERR } from "../errors";
import { emit } from "../emit";
import { isAsyncResult, isStreamResult } from "../execute-helpers";
import { tryAutoGrantFromHostBudget } from "./_helpers";
import { findMatchingGrant } from "../utils/constraints";
import type {
  AgentCapabilityGrant,
  AgentSession,
  Capability,
  ConstraintPrimitive,
  ResolvedAgentAuthOptions,
} from "../types";

const MAX_BATCH_SIZE = 50;
const DEFAULT_CONCURRENCY = 20;

/**
 * Run promises with bounded concurrency.
 * Returns results in the same order as the input.
 */
async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export interface BatchResponseItem {
  id: string;
  status: "completed" | "failed";
  data?: unknown;
  error?: { code?: string; message?: string };
}

/**
 * POST /capability/batch-execute
 *
 * Executes multiple granted capabilities in a single request.
 * The JWT is verified once for the entire batch. Each request
 * in the batch is executed in parallel (bounded concurrency)
 * and can independently succeed or fail.
 *
 * Async and streaming results are not supported in batch mode;
 * individual requests that return them will receive an error.
 */
export function batchExecuteCapability(opts: ResolvedAgentAuthOptions) {
  return createAuthEndpoint(
    "/capability/batch-execute",
    {
      method: "POST",
      body: z.object({
        requests: z
          .array(
            z.object({
              id: z.string().optional(),
              capability: z.string(),
              arguments: z.record(z.string(), z.unknown()).optional(),
            }),
          )
          .min(1)
          .max(MAX_BATCH_SIZE),
      }),
      requireHeaders: true,
      metadata: {
        openapi: {
          description: "Execute multiple granted capabilities in a single batch request.",
        },
      },
    },
    async (ctx) => {
      const agentSession = (ctx.context as Record<string, unknown>).agentSession as
        | AgentSession
        | undefined;

      if (!agentSession) {
        throw agentError(
          "UNAUTHORIZED",
          ERR.UNAUTHORIZED_SESSION,
          undefined,
          agentAuthChallenge(ctx.context.baseURL),
        );
      }

      if (!opts.onExecute) {
        throw agentError("INTERNAL_SERVER_ERROR", ERR.EXECUTE_NOT_CONFIGURED);
      }

      const requests = ctx.body.requests.map((r, i) => ({
        ...r,
        id: r.id ?? String(i),
      }));

      const allCapabilities = opts.capabilities ?? [];
      const capDefMap = new Map<string, Capability>();
      for (const cap of allCapabilities) {
        capDefMap.set(cap.name, cap);
      }

      const sessionGrantMap = new Map(
        agentSession.agent.capabilityGrants.map((g) => [g.capability, g]),
      );

      const uniqueCapNames = [...new Set(requests.map((r) => r.capability))];
      const dbGrantsMap = new Map<string, AgentCapabilityGrant[]>();
      const now = new Date();

      for (const capName of uniqueCapNames) {
        const grants = await ctx.context.adapter.findMany<AgentCapabilityGrant>({
          model: TABLE.grant,
          where: [
            { field: "agentId", value: agentSession.agent.id },
            { field: "capability", value: capName },
          ],
        });
        const active = grants.filter(
          (g) => g.status === "active" && (!g.expiresAt || new Date(g.expiresAt) > now),
        );
        if (active.length > 0) {
          dbGrantsMap.set(capName, active);
        }
      }

      // Try auto-granting missing capabilities from host budget
      for (const capName of uniqueCapNames) {
        if (dbGrantsMap.has(capName)) continue;
        const autoGranted = await tryAutoGrantFromHostBudget(ctx.context.adapter, opts, ctx, {
          agentId: agentSession.agent.id,
          hostId: agentSession.agent.hostId,
          userId: agentSession.host?.userId ?? null,
          capabilityName: capName,
        });
        if (autoGranted) {
          dbGrantsMap.set(capName, [autoGranted]);
        }
      }

      const onExecute = opts.onExecute;

      const responses = await pMap(
        requests,
        async (req): Promise<BatchResponseItem> => {
          const capDef = capDefMap.get(req.capability);
          if (!capDef) {
            return {
              id: req.id,
              status: "failed",
              error: {
                code: ERR.CAPABILITY_NOT_FOUND.code,
                message: `Capability "${req.capability}" does not exist.`,
              },
            };
          }

          const capGrants = dbGrantsMap.get(req.capability);
          const constraintArgs = (req.arguments ?? {}) as Record<
            string,
            ConstraintPrimitive | undefined
          >;
          const activeGrant = capGrants ? findMatchingGrant(capGrants, constraintArgs) : undefined;
          if (!activeGrant) {
            const hasAnyGrant = capGrants && capGrants.length > 0;
            return {
              id: req.id,
              status: "failed",
              error: {
                code: hasAnyGrant ? ERR.CONSTRAINT_VIOLATED.code : ERR.CAPABILITY_NOT_GRANTED.code,
                message: hasAnyGrant
                  ? `No grant for "${req.capability}" covers the provided arguments.`
                  : `Agent does not have an active grant for capability "${req.capability}".`,
              },
            };
          }

          const startTime = Date.now();
          let result: unknown;

          try {
            result = await onExecute({
              ctx,
              capability: req.capability,
              capabilityDef: capDef,
              arguments: req.arguments,
              agentSession,
            });
          } catch (err) {
            const execError = err instanceof Error ? err.message : String(err);
            const durationMs = Date.now() - startTime;

            emit(
              opts,
              {
                type: "capability.executed",
                capability: req.capability,
                agentId: agentSession.agent.id,
                hostId: agentSession.agent.hostId,
                userId: agentSession.host?.userId ?? undefined,
                agentName: agentSession.agent.name,
                arguments: req.arguments,
                status: "error",
                error: execError,
                durationMs,
              },
              ctx,
            );

            const code =
              err instanceof APIError
                ? (((err as APIError).body as Record<string, string>)?.error ?? "internal_error")
                : "internal_error";

            return {
              id: req.id,
              status: "failed",
              error: { code, message: execError },
            };
          }

          const durationMs = Date.now() - startTime;

          emit(
            opts,
            {
              type: "capability.executed",
              capability: req.capability,
              agentId: agentSession.agent.id,
              hostId: agentSession.agent.hostId,
              userId: agentSession.host?.userId ?? undefined,
              agentName: agentSession.agent.name,
              arguments: req.arguments,
              status: "success",
              durationMs,
            },
            ctx,
          );

          if (isAsyncResult(result) || isStreamResult(result)) {
            return {
              id: req.id,
              status: "failed",
              error: {
                code: "batch_unsupported_result_type",
                message:
                  "Async and streaming results are not supported in batch mode. Execute this capability individually.",
              },
            };
          }

          return { id: req.id, status: "completed", data: result };
        },
        DEFAULT_CONCURRENCY,
      );

      return ctx.json({ responses });
    },
  );
}
