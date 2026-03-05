import type { AgentAuthEvent } from "@better-auth/agent-auth";
import { getClickHouseClient } from "./client";
import type { AuditEvent, ToolExecution } from "./events";
import { initAuditTables, isAuditInitialized } from "./init";

interface AuditRow {
	timestamp: string;
	event_type: string;
	org_id: string;
	actor_id: string;
	actor_type: string;
	agent_id: string;
	host_id: string;
	target_id: string;
	target_type: string;
	metadata: string;
	ip: string;
	user_agent: string;
}

interface ToolRow {
	timestamp: string;
	org_id: string;
	agent_id: string;
	agent_name: string;
	user_id: string;
	tool: string;
	provider: string;
	status: string;
	duration_ms: number;
	error: string;
	metadata: string;
}

function chTimestamp(): string {
	return new Date().toISOString().replace("T", " ").replace("Z", "");
}

const auditBuffer: AuditRow[] = [];
const toolBuffer: ToolRow[] = [];

const FLUSH_INTERVAL_MS = 1_000;
const FLUSH_THRESHOLD = 100;

let flushTimer: ReturnType<typeof setInterval> | null = null;

function ensureTimer() {
	if (flushTimer) return;
	flushTimer = setInterval(() => {
		flush().catch((err) => {
			console.error("[audit] flush error:", err);
		});
	}, FLUSH_INTERVAL_MS);
	if (typeof flushTimer === "object" && "unref" in flushTimer) {
		flushTimer.unref();
	}
}

async function flush() {
	const ch = getClickHouseClient();
	if (!ch) {
		auditBuffer.length = 0;
		toolBuffer.length = 0;
		return;
	}

	if (!isAuditInitialized()) {
		await initAuditTables();
		if (!isAuditInitialized()) return;
	}

	if (auditBuffer.length > 0) {
		const batch = auditBuffer.splice(0, auditBuffer.length);
		try {
			await ch.insert({
				table: "audit_events",
				values: batch,
				format: "JSONEachRow",
			});
		} catch (err) {
			console.error("[audit] insert audit_events failed:", err);
		}
	}

	if (toolBuffer.length > 0) {
		const batch = toolBuffer.splice(0, toolBuffer.length);
		try {
			await ch.insert({
				table: "tool_executions",
				values: batch,
				format: "JSONEachRow",
			});
		} catch (err) {
			console.error("[audit] insert tool_executions failed:", err);
		}
	}
}

function log(event: AuditEvent) {
	auditBuffer.push({
		timestamp: chTimestamp(),
		event_type: event.eventType,
		org_id: event.orgId,
		actor_id: event.actorId ?? "",
		actor_type: event.actorType ?? "user",
		agent_id: event.agentId ?? "",
		host_id: event.hostId ?? "",
		target_id: event.targetId ?? "",
		target_type: event.targetType ?? "",
		metadata: event.metadata ? JSON.stringify(event.metadata) : "{}",
		ip: event.ip ?? "",
		user_agent: event.userAgent ?? "",
	});
	ensureTimer();
	if (auditBuffer.length >= FLUSH_THRESHOLD) {
		flush().catch(() => {});
	}
}

function toolExecution(event: ToolExecution) {
	const meta: Record<string, unknown> = { ...event.metadata };
	if (event.toolArgs && Object.keys(event.toolArgs).length > 0) {
		meta.toolArgs = event.toolArgs;
	}
	if (event.toolOutput != null) {
		const raw =
			typeof event.toolOutput === "string"
				? event.toolOutput
				: JSON.stringify(event.toolOutput);
		meta.toolOutput = raw.length > 4096 ? `${raw.slice(0, 4096)}…` : raw;
	}
	toolBuffer.push({
		timestamp: chTimestamp(),
		org_id: event.orgId,
		agent_id: event.agentId,
		agent_name: event.agentName ?? "",
		user_id: event.userId ?? "",
		tool: event.tool,
		provider: event.provider ?? "",
		status: event.status,
		duration_ms: event.durationMs ?? 0,
		error: event.error ?? "",
		metadata: Object.keys(meta).length > 0 ? JSON.stringify(meta) : "{}",
	});
	ensureTimer();
	if (toolBuffer.length >= FLUSH_THRESHOLD) {
		flush().catch(() => {});
	}
}

/**
 * Unified handler for the plugin's `onEvent` callback.
 * Routes `tool.executed` events to the tool buffer and
 * everything else to the audit buffer.
 */
function onEvent(event: AgentAuthEvent) {
	if (event.type === "tool.executed") {
		const meta: Record<string, unknown> = { ...event.metadata };
		if (event.toolArgs && Object.keys(event.toolArgs).length > 0) {
			meta.toolArgs = event.toolArgs;
		}
		if (event.toolOutput != null) {
			const raw =
				typeof event.toolOutput === "string"
					? event.toolOutput
					: JSON.stringify(event.toolOutput);
			meta.toolOutput = raw.length > 4096 ? `${raw.slice(0, 4096)}…` : raw;
		}
		toolBuffer.push({
			timestamp: chTimestamp(),
			org_id: event.orgId ?? "",
			agent_id: event.agentId ?? "",
			agent_name: event.agentName ?? "",
			user_id: event.userId ?? "",
			tool: event.tool,
			provider: event.provider ?? "",
			status: event.status,
			duration_ms: event.durationMs ?? 0,
			error: event.error ?? "",
			metadata: Object.keys(meta).length > 0 ? JSON.stringify(meta) : "{}",
		});
	} else {
		auditBuffer.push({
			timestamp: chTimestamp(),
			event_type: event.type,
			org_id: event.orgId ?? "",
			actor_id: event.actorId ?? "",
			actor_type: event.actorType ?? "user",
			agent_id: event.agentId ?? "",
			host_id: event.hostId ?? "",
			target_id: event.targetId ?? "",
			target_type: event.targetType ?? "",
			metadata: event.metadata ? JSON.stringify(event.metadata) : "{}",
			ip: "",
			user_agent: "",
		});
	}
	ensureTimer();
	if (auditBuffer.length >= FLUSH_THRESHOLD || toolBuffer.length >= FLUSH_THRESHOLD) {
		flush().catch(() => {});
	}
}

export const audit = { log, toolExecution, onEvent, flush };
