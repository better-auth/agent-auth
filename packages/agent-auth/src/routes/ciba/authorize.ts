import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { TABLE, DEFAULTS } from "../../constants";
import { agentError, AGENT_AUTH_ERROR_CODES as ERR } from "../../errors";
import { emit } from "../../emit";
import { hashToken } from "../../utils/approval";
import { sanitizeDisplayText, DISPLAY_LIMITS } from "../../utils/sanitize";
import type { ApprovalRequest, HostSession, ResolvedAgentAuthOptions } from "../../types";

export function cibaAuthorize(opts: ResolvedAgentAuthOptions) {
  return createAuthEndpoint(
    "/agent/ciba/authorize",
    {
      method: "POST",
      body: z.object({
        login_hint: z.string().min(1).meta({
          description: "User identifier (email) to send the authentication request to.",
        }),
        capabilities: z.array(z.string()).optional().meta({
          description: "Capabilities the client is requesting.",
        }),
        binding_message: z.string().optional().meta({
          description: "Human-readable message displayed to the user during approval.",
        }),
        agent_id: z.string().optional().meta({
          description: "Agent ID this CIBA request is for.",
        }),
      }),
      requireHeaders: true,
      metadata: {
        openapi: {
          description:
            "CIBA Backchannel Authentication Endpoint (§9.2). Creates a pending auth request for the identified user.",
        },
      },
    },
    async (ctx) => {
      if (!opts.approvalMethods.includes("ciba")) {
        throw agentError("BAD_REQUEST", ERR.INVALID_REQUEST);
      }

      const hostSession = (ctx.context as { hostSession?: HostSession }).hostSession;
      if (!hostSession) {
        throw agentError("UNAUTHORIZED", ERR.UNAUTHORIZED);
      }

      const {
        login_hint: loginHint,
        capabilities: capabilityIds,
        binding_message: rawBindingMessage,
        agent_id: agentId,
      } = ctx.body;

      const bindingMessage = rawBindingMessage
        ? sanitizeDisplayText(rawBindingMessage, DISPLAY_LIMITS.bindingMessage)
        : undefined;

      const user = await ctx.context.internalAdapter.findUserByEmail(loginHint);

      if (!user) {
        // Timing ballast: approximate the DB write latency on the success path
        // to prevent user enumeration via timing side-channel (CIBA Core §13.1)
        await hashToken(loginHint);
        return ctx.json({
          auth_req_id: crypto.randomUUID(),
          expires_in: DEFAULTS.cibaExpiresIn,
          interval: DEFAULTS.cibaInterval,
        });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + DEFAULTS.cibaExpiresIn * 1000);

      const capabilitiesStr = capabilityIds ? capabilityIds.join(" ") : null;

      const request = await ctx.context.adapter.create<Record<string, unknown>, ApprovalRequest>({
        model: TABLE.approval,
        data: {
          method: "ciba",
          agentId: agentId ?? null,
          hostId: hostSession.host.id,
          userId: user.user.id,
          capabilities: capabilitiesStr,
          status: "pending",
          userCodeHash: null,
          loginHint,
          bindingMessage: bindingMessage ?? null,
          clientNotificationToken: null,
          clientNotificationEndpoint: null,
          deliveryMode: "poll",
          interval: DEFAULTS.cibaInterval,
          lastPolledAt: null,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        },
      });

      emit(
        opts,
        {
          type: "approval.created",
          actorId: user.user.id,
          hostId: hostSession.host.id,
          targetId: request.id,
          targetType: "approvalRequest",
          metadata: {
            method: "ciba",
            capabilities: capabilityIds,
            bindingMessage,
            agentId,
          },
        },
        ctx,
      );

      return ctx.json({
        auth_req_id: request.id,
        expires_in: DEFAULTS.cibaExpiresIn,
        interval: DEFAULTS.cibaInterval,
      });
    },
  );
}
