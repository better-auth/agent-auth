import { createAuthEndpoint } from "@better-auth/core/api";
import type { ResolvedAgentAuthOptions } from "../types";

/**
 * GET /agent-configuration (§6.1).
 *
 * Returns the Agent Auth discovery document. Users should expose this
 * at `/.well-known/agent-configuration` on their server root by calling
 * `auth.api.getAgentConfiguration()` from their own route handler.
 */
export function agentConfiguration(opts: ResolvedAgentAuthOptions) {
  return createAuthEndpoint(
    "/agent-configuration",
    {
      method: "GET",
      metadata: {
        openapi: {
          description:
            "Agent Auth discovery document (§6.1). Expose at /.well-known/agent-configuration.",
        },
      },
    },
    async (ctx) => {
      const issuer = ctx.context.baseURL.replace(/\/$/, "");

      // §5.1: endpoint URLs are absolute (issuer + path)
      const paths: Record<string, string> = {
        register: "/agent/register",
        capabilities: "/capability/list",
        describe_capability: "/capability/describe",
        execute: "/capability/execute",
        request_capability: "/agent/request-capability",
        status: "/agent/status",
        reactivate: "/agent/reactivate",
        revoke: "/agent/revoke",
        revoke_host: "/host/revoke",
        rotate_key: "/agent/rotate-key",
        rotate_host_key: "/host/rotate-key",
        introspect: "/agent/introspect",
      };

      const endpoints: Record<string, string> = {};
      for (const [key, path] of Object.entries(paths)) {
        endpoints[key] = `${issuer}${path}`;
      }

      // §5.1: default_location is a full URL (used as JWT aud)
      const defaultLocation = endpoints.execute;

      // §5.1: Cache-Control per RFC 9111; 1 hour RECOMMENDED
      ctx.setHeader("Cache-Control", "public, max-age=3600");

      return ctx.json({
        version: "1.0-draft",
        provider_name: opts.providerName ?? "agent-auth",
        description: opts.providerDescription ?? "Agent Auth enabled service",
        issuer,
        default_location: defaultLocation,
        algorithms: opts.allowedKeyAlgorithms,
        modes: opts.modes,
        approval_methods: opts.approvalMethods,
        endpoints,
        ...(opts.jwksUri ? { jwks_uri: opts.jwksUri } : {}),
      });
    },
  );
}
