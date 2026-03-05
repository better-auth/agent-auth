import type { AgentAuthEvent, ResolvedAgentAuthOptions } from "./types";

export function emit(
	opts: ResolvedAgentAuthOptions,
	event: AgentAuthEvent,
): void {
	if (!opts.onEvent) return;
	try {
		const result = opts.onEvent(event);
		if (result && typeof (result as Promise<void>).catch === "function") {
			(result as Promise<void>).catch(() => {});
		}
	} catch {
		// fire-and-forget
	}
}
