#!/usr/bin/env npx tsx
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod";

// ── Fake smart home data ────────────────────────────────────────────────

type DeviceType =
	| "light"
	| "thermostat"
	| "lock"
	| "camera"
	| "alarm"
	| "speaker"
	| "blind";

type Device = {
	id: string;
	name: string;
	type: DeviceType;
	roomId: string;
	status: "on" | "off" | "locked" | "unlocked" | "armed" | "disarmed";
	battery?: number;
	metadata: Record<string, unknown>;
};

const rooms = [
	{ id: "room_living", name: "Living Room", floor: 1 },
	{ id: "room_kitchen", name: "Kitchen", floor: 1 },
	{ id: "room_bedroom", name: "Master Bedroom", floor: 2 },
	{ id: "room_office", name: "Home Office", floor: 2 },
	{ id: "room_garage", name: "Garage", floor: 0 },
	{ id: "room_front", name: "Front Entrance", floor: 1 },
];

const devices: Device[] = [
	{
		id: "dev_light_living",
		name: "Living Room Ceiling",
		type: "light",
		roomId: "room_living",
		status: "on",
		metadata: { brightness: 80, color: "#ffeedd", wattage: 12 },
	},
	{
		id: "dev_light_kitchen",
		name: "Kitchen Lights",
		type: "light",
		roomId: "room_kitchen",
		status: "on",
		metadata: { brightness: 100, color: "#ffffff", wattage: 15 },
	},
	{
		id: "dev_light_bedroom",
		name: "Bedroom Lamp",
		type: "light",
		roomId: "room_bedroom",
		status: "off",
		metadata: { brightness: 0, color: "#ffd700", wattage: 8 },
	},
	{
		id: "dev_light_office",
		name: "Office Desk Lamp",
		type: "light",
		roomId: "room_office",
		status: "on",
		metadata: { brightness: 90, color: "#f0f0ff", wattage: 10 },
	},
	{
		id: "dev_thermo_main",
		name: "Main Thermostat",
		type: "thermostat",
		roomId: "room_living",
		status: "on",
		metadata: { currentTemp: 72, targetTemp: 71, mode: "cool", humidity: 45 },
	},
	{
		id: "dev_thermo_bedroom",
		name: "Bedroom Thermostat",
		type: "thermostat",
		roomId: "room_bedroom",
		status: "on",
		metadata: { currentTemp: 68, targetTemp: 67, mode: "cool", humidity: 50 },
	},
	{
		id: "dev_lock_front",
		name: "Front Door Lock",
		type: "lock",
		roomId: "room_front",
		status: "locked",
		battery: 87,
		metadata: {
			lastUnlockedBy: "John",
			lastUnlockedAt: "2026-03-04T08:30:00Z",
		},
	},
	{
		id: "dev_lock_garage",
		name: "Garage Door Lock",
		type: "lock",
		roomId: "room_garage",
		status: "locked",
		battery: 62,
		metadata: {
			lastUnlockedBy: "John",
			lastUnlockedAt: "2026-03-03T18:15:00Z",
		},
	},
	{
		id: "dev_cam_front",
		name: "Front Porch Camera",
		type: "camera",
		roomId: "room_front",
		status: "on",
		metadata: {
			resolution: "1080p",
			nightVision: true,
			recording: true,
			lastMotion: "2026-03-04T09:12:00Z",
		},
	},
	{
		id: "dev_cam_garage",
		name: "Garage Camera",
		type: "camera",
		roomId: "room_garage",
		status: "on",
		metadata: {
			resolution: "720p",
			nightVision: true,
			recording: false,
			lastMotion: "2026-03-03T22:45:00Z",
		},
	},
	{
		id: "dev_alarm",
		name: "Home Security System",
		type: "alarm",
		roomId: "room_front",
		status: "armed",
		metadata: {
			mode: "away",
			zones: ["perimeter", "interior"],
			lastTriggered: null,
		},
	},
	{
		id: "dev_speaker_living",
		name: "Living Room Speaker",
		type: "speaker",
		roomId: "room_living",
		status: "off",
		metadata: { volume: 40, nowPlaying: null },
	},
	{
		id: "dev_blind_bedroom",
		name: "Bedroom Blinds",
		type: "blind",
		roomId: "room_bedroom",
		status: "off",
		metadata: { position: 100 },
	},
];

const activityLog: Array<{
	id: string;
	deviceId: string;
	action: string;
	actor: string;
	timestamp: string;
}> = [
	{
		id: "log_1",
		deviceId: "dev_lock_front",
		action: "unlock",
		actor: "John",
		timestamp: "2026-03-04T08:30:00Z",
	},
	{
		id: "log_2",
		deviceId: "dev_lock_front",
		action: "lock",
		actor: "John",
		timestamp: "2026-03-04T08:32:00Z",
	},
	{
		id: "log_3",
		deviceId: "dev_alarm",
		action: "arm",
		actor: "John",
		timestamp: "2026-03-04T08:35:00Z",
	},
	{
		id: "log_4",
		deviceId: "dev_cam_front",
		action: "motion_detected",
		actor: "system",
		timestamp: "2026-03-04T09:12:00Z",
	},
	{
		id: "log_5",
		deviceId: "dev_thermo_main",
		action: "set_temperature",
		actor: "Jane",
		timestamp: "2026-03-04T07:00:00Z",
	},
];

let logCounter = activityLog.length;

function addLog(deviceId: string, action: string, actor: string) {
	activityLog.unshift({
		id: `log_${++logCounter}`,
		deviceId,
		action,
		actor,
		timestamp: new Date().toISOString(),
	});
}

function ok(data: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
	};
}

function err(message: string) {
	return { content: [{ type: "text" as const, text: message }], isError: true };
}

// ── MCP Server ──────────────────────────────────────────────────────────

function createSmartHomeServer(): McpServer {
	const server = new McpServer({ name: "smart-home", version: "1.0.0" });

	// ── Read-only: low risk ─────────────────────────────────────────────

	server.tool("list_rooms", "List all rooms in the house", {}, async () =>
		ok(rooms),
	);

	server.tool(
		"list_devices",
		"List all smart home devices, optionally filtered by room or type",
		{
			roomId: z.string().optional().describe("Filter by room ID"),
			type: z
				.string()
				.optional()
				.describe(
					"Filter by device type (light, thermostat, lock, camera, alarm, speaker, blind)",
				),
		},
		async ({ roomId, type }) => {
			let filtered = devices;
			if (roomId) filtered = filtered.filter((d) => d.roomId === roomId);
			if (type) filtered = filtered.filter((d) => d.type === type);
			return ok(
				filtered.map((d) => ({
					id: d.id,
					name: d.name,
					type: d.type,
					room: rooms.find((r) => r.id === d.roomId)?.name,
					status: d.status,
					battery: d.battery,
				})),
			);
		},
	);

	server.tool(
		"get_device",
		"Get full details of a specific device",
		{ deviceId: z.string().describe("Device ID") },
		async ({ deviceId }) => {
			const dev = devices.find((d) => d.id === deviceId);
			if (!dev) return err(`Device ${deviceId} not found.`);
			return ok({
				...dev,
				room: rooms.find((r) => r.id === dev.roomId)?.name,
			});
		},
	);

	server.tool(
		"get_temperature",
		"Get the current temperature reading from a thermostat",
		{
			deviceId: z
				.string()
				.optional()
				.describe("Thermostat device ID (defaults to main)"),
		},
		async ({ deviceId }) => {
			const id = deviceId || "dev_thermo_main";
			const dev = devices.find((d) => d.id === id && d.type === "thermostat");
			if (!dev) return err(`Thermostat ${id} not found.`);
			return ok({
				deviceId: dev.id,
				name: dev.name,
				currentTemp: dev.metadata.currentTemp,
				targetTemp: dev.metadata.targetTemp,
				humidity: dev.metadata.humidity,
				mode: dev.metadata.mode,
			});
		},
	);

	server.tool(
		"get_activity_log",
		"Get recent activity log for the home",
		{
			deviceId: z.string().optional().describe("Filter by device ID"),
			limit: z
				.number()
				.optional()
				.default(10)
				.describe("Max entries to return"),
		},
		async ({ deviceId, limit }) => {
			let entries = activityLog;
			if (deviceId) entries = entries.filter((e) => e.deviceId === deviceId);
			return ok(entries.slice(0, limit));
		},
	);

	// ── Medium risk: comfort controls ───────────────────────────────────

	server.tool(
		"control_light",
		"Turn a light on/off or adjust brightness and color",
		{
			deviceId: z.string().describe("Light device ID"),
			action: z.enum(["on", "off"]).optional().describe("Turn on or off"),
			brightness: z
				.number()
				.min(0)
				.max(100)
				.optional()
				.describe("Brightness 0-100"),
			color: z.string().optional().describe("Hex color code"),
		},
		async ({ deviceId, action, brightness, color }) => {
			const dev = devices.find((d) => d.id === deviceId && d.type === "light");
			if (!dev) return err(`Light ${deviceId} not found.`);

			if (action) {
				dev.status = action;
				if (action === "off") dev.metadata.brightness = 0;
				if (action === "on" && (dev.metadata.brightness as number) === 0)
					dev.metadata.brightness = 80;
			}
			if (brightness !== undefined) {
				dev.metadata.brightness = brightness;
				dev.status = brightness > 0 ? "on" : "off";
			}
			if (color) dev.metadata.color = color;

			addLog(deviceId, `light_${action ?? "adjust"}`, "agent");

			return ok({
				deviceId: dev.id,
				name: dev.name,
				status: dev.status,
				brightness: dev.metadata.brightness,
				color: dev.metadata.color,
			});
		},
	);

	server.tool(
		"set_thermostat",
		"Adjust the thermostat target temperature or mode",
		{
			deviceId: z
				.string()
				.optional()
				.describe("Thermostat device ID (defaults to main)"),
			targetTemp: z
				.number()
				.min(55)
				.max(85)
				.optional()
				.describe("Target temperature in °F"),
			mode: z
				.enum(["heat", "cool", "auto", "off"])
				.optional()
				.describe("HVAC mode"),
		},
		async ({ deviceId, targetTemp, mode }) => {
			const id = deviceId || "dev_thermo_main";
			const dev = devices.find((d) => d.id === id && d.type === "thermostat");
			if (!dev) return err(`Thermostat ${id} not found.`);

			if (targetTemp !== undefined) dev.metadata.targetTemp = targetTemp;
			if (mode) dev.metadata.mode = mode;

			addLog(id, "set_temperature", "agent");

			return ok({
				deviceId: dev.id,
				name: dev.name,
				currentTemp: dev.metadata.currentTemp,
				targetTemp: dev.metadata.targetTemp,
				mode: dev.metadata.mode,
			});
		},
	);

	server.tool(
		"control_blinds",
		"Open or close window blinds",
		{
			deviceId: z.string().describe("Blinds device ID"),
			position: z
				.number()
				.min(0)
				.max(100)
				.describe("Position: 0=fully closed, 100=fully open"),
		},
		async ({ deviceId, position }) => {
			const dev = devices.find((d) => d.id === deviceId && d.type === "blind");
			if (!dev) return err(`Blinds ${deviceId} not found.`);

			dev.metadata.position = position;
			dev.status = position > 0 ? "on" : "off";
			addLog(deviceId, `blinds_${position > 50 ? "open" : "close"}`, "agent");

			return ok({ deviceId: dev.id, name: dev.name, position });
		},
	);

	server.tool(
		"control_speaker",
		"Control a smart speaker (play, stop, volume)",
		{
			deviceId: z.string().describe("Speaker device ID"),
			action: z.enum(["play", "stop"]).optional().describe("Play or stop"),
			volume: z.number().min(0).max(100).optional().describe("Volume 0-100"),
		},
		async ({ deviceId, action, volume }) => {
			const dev = devices.find(
				(d) => d.id === deviceId && d.type === "speaker",
			);
			if (!dev) return err(`Speaker ${deviceId} not found.`);

			if (action === "play") dev.status = "on";
			if (action === "stop") {
				dev.status = "off";
				dev.metadata.nowPlaying = null;
			}
			if (volume !== undefined) dev.metadata.volume = volume;

			addLog(deviceId, `speaker_${action ?? "adjust"}`, "agent");
			return ok({
				deviceId: dev.id,
				name: dev.name,
				status: dev.status,
				volume: dev.metadata.volume,
			});
		},
	);

	// ── High risk: privacy sensitive ────────────────────────────────────

	server.tool(
		"view_camera",
		"Get the current camera status and recent motion events",
		{ deviceId: z.string().describe("Camera device ID") },
		async ({ deviceId }) => {
			const dev = devices.find((d) => d.id === deviceId && d.type === "camera");
			if (!dev) return err(`Camera ${deviceId} not found.`);

			addLog(deviceId, "camera_view", "agent");
			return ok({
				deviceId: dev.id,
				name: dev.name,
				status: dev.status,
				resolution: dev.metadata.resolution,
				nightVision: dev.metadata.nightVision,
				recording: dev.metadata.recording,
				lastMotion: dev.metadata.lastMotion,
				streamUrl: `rtsp://home.local/${dev.id}/live`,
			});
		},
	);

	server.tool(
		"toggle_camera_recording",
		"Start or stop camera recording",
		{
			deviceId: z.string().describe("Camera device ID"),
			recording: z.boolean().describe("Enable or disable recording"),
		},
		async ({ deviceId, recording }) => {
			const dev = devices.find((d) => d.id === deviceId && d.type === "camera");
			if (!dev) return err(`Camera ${deviceId} not found.`);

			dev.metadata.recording = recording;
			addLog(
				deviceId,
				recording ? "recording_start" : "recording_stop",
				"agent",
			);

			return ok({
				deviceId: dev.id,
				name: dev.name,
				recording: dev.metadata.recording,
			});
		},
	);

	// ── Critical risk: physical security ────────────────────────────────

	server.tool(
		"lock_door",
		"Lock a door",
		{ deviceId: z.string().describe("Lock device ID") },
		async ({ deviceId }) => {
			const dev = devices.find((d) => d.id === deviceId && d.type === "lock");
			if (!dev) return err(`Lock ${deviceId} not found.`);

			dev.status = "locked";
			addLog(deviceId, "lock", "agent");

			return ok({ deviceId: dev.id, name: dev.name, status: "locked" });
		},
	);

	server.tool(
		"unlock_door",
		"Unlock a door — CRITICAL: grants physical access to the home",
		{ deviceId: z.string().describe("Lock device ID") },
		async ({ deviceId }) => {
			const dev = devices.find((d) => d.id === deviceId && d.type === "lock");
			if (!dev) return err(`Lock ${deviceId} not found.`);

			dev.status = "unlocked";
			dev.metadata.lastUnlockedBy = "agent";
			dev.metadata.lastUnlockedAt = new Date().toISOString();
			addLog(deviceId, "unlock", "agent");

			return ok({
				deviceId: dev.id,
				name: dev.name,
				status: "unlocked",
				warning: "Door is now unlocked. Remember to lock it again.",
			});
		},
	);

	server.tool(
		"arm_alarm",
		"Arm the home security system",
		{
			mode: z
				.enum(["away", "home", "night"])
				.optional()
				.default("away")
				.describe("Alarm mode"),
		},
		async ({ mode }) => {
			const dev = devices.find((d) => d.type === "alarm");
			if (!dev) return err("Alarm system not found.");

			dev.status = "armed";
			dev.metadata.mode = mode;
			addLog(dev.id, `alarm_arm_${mode}`, "agent");

			return ok({
				deviceId: dev.id,
				name: dev.name,
				status: "armed",
				mode,
			});
		},
	);

	server.tool(
		"disarm_alarm",
		"Disarm the home security system — CRITICAL: disables all security zones",
		{},
		async () => {
			const dev = devices.find((d) => d.type === "alarm");
			if (!dev) return err("Alarm system not found.");

			dev.status = "disarmed";
			addLog(dev.id, "alarm_disarm", "agent");

			return ok({
				deviceId: dev.id,
				name: dev.name,
				status: "disarmed",
				warning: "Security system is now disarmed. All zones are inactive.",
			});
		},
	);

	return server;
}

// ── HTTP server ─────────────────────────────────────────────────────────

const PORT = 4200;
const sessions = new Map<string, StreamableHTTPServerTransport>();

const httpServer = createServer(
	async (req: IncomingMessage, res: ServerResponse) => {
		if (req.url !== "/mcp") {
			res.writeHead(404);
			res.end("Not found");
			return;
		}

		if (req.method === "POST") {
			const sessionId = req.headers["mcp-session-id"] as string | undefined;

			if (sessionId && sessions.has(sessionId)) {
				const transport = sessions.get(sessionId)!;
				await transport.handleRequest(req, res);
				return;
			}

			let capturedId: string | undefined;
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => {
					capturedId = crypto.randomUUID();
					return capturedId;
				},
			});

			transport.onclose = () => {
				if (capturedId) sessions.delete(capturedId);
			};

			const srv = createSmartHomeServer();
			await srv.connect(transport);
			await transport.handleRequest(req, res);

			if (capturedId) sessions.set(capturedId, transport);
		} else {
			res.writeHead(405);
			res.end("Method not allowed");
		}
	},
);

httpServer.listen(PORT, () => {
	console.log(
		`🏠 Smart Home MCP Server running at http://localhost:${PORT}/mcp`,
	);
	console.log("   Add it as a custom MCP server in the dashboard.");
	console.log("");
	console.log("   Tools by risk level:");
	console.log(
		"   ✅ Low:      list_rooms, list_devices, get_device, get_temperature, get_activity_log",
	);
	console.log(
		"   ⚠️  Medium:   control_light, set_thermostat, control_blinds, control_speaker",
	);
	console.log("   🔒 High:     view_camera, toggle_camera_recording");
	console.log(
		"   🚨 Critical: lock_door, unlock_door, arm_alarm, disarm_alarm",
	);
});
