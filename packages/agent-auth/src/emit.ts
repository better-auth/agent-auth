import type { GenericEndpointContext } from "@better-auth/core";
import type { AgentAuthEvent, ResolvedAgentAuthOptions } from "./types";

/** Emit an event via the background task runner. Never throws. */
export function emit(
	opts: Pick<ResolvedAgentAuthOptions, "onEvent">,
	event: AgentAuthEvent,
	ctx?: GenericEndpointContext,
): void {
	if (!opts.onEvent) return;
	try {
		const result = opts.onEvent(event);
		if (result && typeof (result as Promise<void>).then === "function") {
			const caught = (result as Promise<void>).catch((err) => {
				console.error("[agent-auth] onEvent callback failed:", err);
			});
			if (ctx?.context?.runInBackground) {
				ctx.context.runInBackground(caught);
			}
		}
	} catch (err) {
		console.error("[agent-auth] onEvent callback threw:", err);
	}
}
