import { createAuthEndpoint } from "@better-auth/core/api";
import { sessionMiddleware } from "better-auth/api";
import * as z from "zod";
import { TABLE } from "../../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../../errors";
import { emit } from "../../emit";
import { parseCapabilityIds } from "../../utils/capabilities";
import type { AgentHost, ResolvedAgentAuthOptions } from "../../types";
import {
  checkSharedOrg,
  validateKeyAlgorithm,
  validateCapabilityIds,
  validateCapabilitiesExist,
} from "../_helpers";

export function updateHost(opts: ResolvedAgentAuthOptions) {
  return createAuthEndpoint(
    "/host/update",
    {
      method: "POST",
      body: z.object({
        host_id: z.string().meta({ description: "ID of the host to update" }),
        name: z.string().optional().meta({
          description: "Human-readable name identifying the environment/device.",
        }),
        public_key: z
          .record(z.string(), z.union([z.string(), z.boolean(), z.array(z.string())]).optional())
          .optional()
          .meta({ description: "New static public key as JWK" }),
        jwks_url: z
          .string()
          .url()
          .optional()
          .meta({ description: "New JWKS URL for remote key discovery" }),
        default_capabilities: z
          .array(z.string())
          .optional()
          .meta({ description: "Update default capabilities" }),
      }),
      use: [sessionMiddleware],
      metadata: {
        openapi: {
          description:
            "Update an agent host's name, public key, JWKS URL, or default capability IDs (§3).",
        },
      },
    },
    async (ctx) => {
      const session = ctx.context.session;
      const {
        host_id: hostId,
        name,
        public_key: publicKey,
        jwks_url: jwksUrl,
        default_capabilities: defaultCapabilityIds,
      } = ctx.body;

      const host = await ctx.context.adapter.findOne<AgentHost>({
        model: TABLE.host,
        where: [{ field: "id", value: hostId }],
      });

      if (!host) {
        throw agentError("NOT_FOUND", ERR.HOST_NOT_FOUND);
      }

      if (host.userId !== session.user.id && host.userId !== null) {
        const sameOrg = await checkSharedOrg(ctx.context.adapter, session.user.id, host.userId);
        if (!sameOrg) {
          throw agentError("NOT_FOUND", ERR.HOST_NOT_FOUND);
        }
      }

      if (host.status === "revoked") {
        throw agentError("FORBIDDEN", ERR.HOST_REVOKED);
      }

      const update: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (name !== undefined) {
        update.name = name;
      }

      if (publicKey) {
        if (!publicKey.kty || !publicKey.x) {
          throw agentError("BAD_REQUEST", ERR.INVALID_PUBLIC_KEY);
        }
        validateKeyAlgorithm(publicKey, opts.allowedKeyAlgorithms);
        update.publicKey = JSON.stringify(publicKey);
        update.kid = (publicKey.kid as string | undefined) ?? null;
      }

      if (jwksUrl !== undefined) {
        update.jwksUrl = jwksUrl;
      }

      if (defaultCapabilityIds !== undefined) {
        validateCapabilityIds(defaultCapabilityIds, opts);
        await validateCapabilitiesExist(defaultCapabilityIds, opts);
        update.defaultCapabilities = defaultCapabilityIds;
      }

      await ctx.context.adapter.update({
        model: TABLE.host,
        where: [{ field: "id", value: host.id }],
        update,
      });

      const updated = await ctx.context.adapter.findOne<AgentHost>({
        model: TABLE.host,
        where: [{ field: "id", value: host.id }],
      });

      emit(
        opts,
        {
          type: "host.updated",
          actorId: session.user.id,
          hostId: host.id,
          metadata: { name, defaultCapabilities: defaultCapabilityIds, jwksUrl },
        },
        ctx,
      );

      return ctx.json({
        id: updated!.id,
        default_capabilities: parseCapabilityIds(updated!.defaultCapabilities),
        jwks_url: updated!.jwksUrl,
        status: updated!.status,
        updated_at: updated!.updatedAt,
      });
    },
  );
}
