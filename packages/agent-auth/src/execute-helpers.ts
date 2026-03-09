import type { AsyncExecuteResult, StreamExecuteResult } from "./types";

/**
 * Signal that a capability execution is async (§4.1).
 * The server returns `202 Accepted` with a polling URL.
 */
export function asyncResult(
	statusUrl: string,
	retryAfter?: number,
): AsyncExecuteResult {
	return { __type: "async", statusUrl, retryAfter };
}

/**
 * Signal that a capability execution streams (§4.1).
 * The server returns `text/event-stream` SSE.
 */
export function streamResult(
	body: ReadableStream,
	headers?: Record<string, string>,
): StreamExecuteResult {
	return { __type: "stream", body, headers };
}

export function isAsyncResult(value: unknown): value is AsyncExecuteResult {
	return (
		!!value &&
		typeof value === "object" &&
		"__type" in value &&
		(value as AsyncExecuteResult).__type === "async"
	);
}

export function isStreamResult(value: unknown): value is StreamExecuteResult {
	return (
		!!value &&
		typeof value === "object" &&
		"__type" in value &&
		(value as StreamExecuteResult).__type === "stream"
	);
}
