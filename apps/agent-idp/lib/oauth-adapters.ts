import "server-only";

export interface OAuthToolDef {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface ToolResult {
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
}

interface OAuthServiceDefinition {
	requiredScopes: string[];
	tools: OAuthToolDef[];
	execute: (
		toolName: string,
		args: Record<string, unknown>,
		accessToken: string,
	) => Promise<ToolResult>;
}

interface OAuthAdapter {
	services: Record<string, OAuthServiceDefinition>;
	listTools(grantedScopes?: string[]): OAuthToolDef[];
	callTool(
		toolName: string,
		args: Record<string, unknown>,
		accessToken: string,
	): Promise<ToolResult>;
}

function textResult(data: unknown, isError = false): ToolResult {
	return {
		content: [{ type: "text", text: JSON.stringify(data) }],
		isError,
	};
}

async function googleFetch(
	url: string,
	accessToken: string,
	init?: RequestInit,
): Promise<unknown> {
	const res = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
			...init?.headers,
		},
	});
	return res.json();
}

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const DOCS_BASE = "https://docs.googleapis.com/v1/documents";
const CONTACTS_BASE = "https://people.googleapis.com/v1/people/me/connections";

// ── Gmail ───────────────────────────────────────────────────────────────

const gmailService: OAuthServiceDefinition = {
	requiredScopes: [
		"https://www.googleapis.com/auth/gmail.readonly",
		"https://www.googleapis.com/auth/gmail.modify",
		"https://www.googleapis.com/auth/gmail.send",
	],
	tools: [
		{
			name: "list_messages",
			description: "List email messages in the inbox",
			inputSchema: {
				type: "object",
				properties: {
					maxResults: {
						type: "number",
						description: "Max results to return (default 10)",
					},
					q: { type: "string", description: "Gmail search query" },
					pageToken: { type: "string", description: "Pagination token" },
				},
			},
		},
		{
			name: "get_message",
			description: "Get the full content of an email message",
			inputSchema: {
				type: "object",
				properties: {
					id: { type: "string", description: "Message ID" },
					format: {
						type: "string",
						description: "Response format: full, metadata, minimal, raw",
					},
				},
				required: ["id"],
			},
		},
		{
			name: "send_email",
			description: "Send a new email message",
			inputSchema: {
				type: "object",
				properties: {
					to: { type: "string", description: "Recipient email" },
					subject: { type: "string", description: "Email subject" },
					body: { type: "string", description: "Email body (plain text)" },
				},
				required: ["to", "subject", "body"],
			},
		},
		{
			name: "search_emails",
			description: "Search emails with a Gmail query",
			inputSchema: {
				type: "object",
				properties: {
					q: { type: "string", description: "Gmail search query" },
					maxResults: { type: "number", description: "Max results" },
					pageToken: { type: "string", description: "Pagination token" },
				},
				required: ["q"],
			},
		},
		{
			name: "list_labels",
			description: "List all email labels",
			inputSchema: { type: "object", properties: {} },
		},
		{
			name: "modify_labels",
			description: "Add or remove labels from a message",
			inputSchema: {
				type: "object",
				properties: {
					id: { type: "string", description: "Message ID" },
					addLabelIds: {
						type: "array",
						items: { type: "string" },
						description: "Label IDs to add",
					},
					removeLabelIds: {
						type: "array",
						items: { type: "string" },
						description: "Label IDs to remove",
					},
				},
				required: ["id"],
			},
		},
		{
			name: "create_draft",
			description: "Create a new email draft",
			inputSchema: {
				type: "object",
				properties: {
					to: { type: "string", description: "Recipient email" },
					subject: { type: "string", description: "Email subject" },
					body: { type: "string", description: "Email body (plain text)" },
				},
				required: ["to", "subject", "body"],
			},
		},
		{
			name: "list_threads",
			description: "List email threads",
			inputSchema: {
				type: "object",
				properties: {
					maxResults: { type: "number", description: "Max results" },
					q: { type: "string", description: "Gmail search query" },
					pageToken: { type: "string", description: "Pagination token" },
				},
			},
		},
	],
	async execute(toolName, args, accessToken) {
		switch (toolName) {
			case "list_messages": {
				const params = new URLSearchParams();
				if (args.maxResults) params.set("maxResults", String(args.maxResults));
				if (args.q) params.set("q", String(args.q));
				if (args.pageToken) params.set("pageToken", String(args.pageToken));
				const data = await googleFetch(
					`${GMAIL_BASE}/messages?${params}`,
					accessToken,
				);
				return textResult(data);
			}
			case "get_message": {
				const format = (args.format as string) ?? "full";
				const data = await googleFetch(
					`${GMAIL_BASE}/messages/${args.id}?format=${format}`,
					accessToken,
				);
				return textResult(data);
			}
			case "send_email": {
				const raw = btoa(
					`To: ${args.to}\r\nSubject: ${args.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${args.body}`,
				)
					.replace(/\+/g, "-")
					.replace(/\//g, "_")
					.replace(/=+$/, "");
				const data = await googleFetch(
					`${GMAIL_BASE}/messages/send`,
					accessToken,
					{ method: "POST", body: JSON.stringify({ raw }) },
				);
				return textResult(data);
			}
			case "search_emails": {
				const params = new URLSearchParams({ q: String(args.q) });
				if (args.maxResults) params.set("maxResults", String(args.maxResults));
				if (args.pageToken) params.set("pageToken", String(args.pageToken));
				const data = await googleFetch(
					`${GMAIL_BASE}/messages?${params}`,
					accessToken,
				);
				return textResult(data);
			}
			case "list_labels": {
				const data = await googleFetch(`${GMAIL_BASE}/labels`, accessToken);
				return textResult(data);
			}
			case "modify_labels": {
				const data = await googleFetch(
					`${GMAIL_BASE}/messages/${args.id}/modify`,
					accessToken,
					{
						method: "POST",
						body: JSON.stringify({
							addLabelIds: args.addLabelIds ?? [],
							removeLabelIds: args.removeLabelIds ?? [],
						}),
					},
				);
				return textResult(data);
			}
			case "create_draft": {
				const raw = btoa(
					`To: ${args.to}\r\nSubject: ${args.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${args.body}`,
				)
					.replace(/\+/g, "-")
					.replace(/\//g, "_")
					.replace(/=+$/, "");
				const data = await googleFetch(`${GMAIL_BASE}/drafts`, accessToken, {
					method: "POST",
					body: JSON.stringify({ message: { raw } }),
				});
				return textResult(data);
			}
			case "list_threads": {
				const params = new URLSearchParams();
				if (args.maxResults) params.set("maxResults", String(args.maxResults));
				if (args.q) params.set("q", String(args.q));
				if (args.pageToken) params.set("pageToken", String(args.pageToken));
				const data = await googleFetch(
					`${GMAIL_BASE}/threads?${params}`,
					accessToken,
				);
				return textResult(data);
			}
			default:
				return textResult({ error: `Unknown Gmail tool: ${toolName}` }, true);
		}
	},
};

// ── Calendar ────────────────────────────────────────────────────────────

const calendarService: OAuthServiceDefinition = {
	requiredScopes: [
		"https://www.googleapis.com/auth/calendar",
		"https://www.googleapis.com/auth/calendar.events",
	],
	tools: [
		{
			name: "list_events",
			description: "List upcoming calendar events",
			inputSchema: {
				type: "object",
				properties: {
					calendarId: {
						type: "string",
						description: "Calendar ID (default: primary)",
					},
					maxResults: { type: "number", description: "Max results" },
					timeMin: {
						type: "string",
						description: "Start time (RFC3339)",
					},
					timeMax: { type: "string", description: "End time (RFC3339)" },
				},
			},
		},
		{
			name: "get_event",
			description: "Get details of a calendar event",
			inputSchema: {
				type: "object",
				properties: {
					calendarId: { type: "string", description: "Calendar ID" },
					eventId: { type: "string", description: "Event ID" },
				},
				required: ["eventId"],
			},
		},
		{
			name: "create_event",
			description: "Create a new calendar event",
			inputSchema: {
				type: "object",
				properties: {
					calendarId: { type: "string", description: "Calendar ID" },
					summary: { type: "string", description: "Event title" },
					description: { type: "string", description: "Event description" },
					start: { type: "string", description: "Start time (RFC3339)" },
					end: { type: "string", description: "End time (RFC3339)" },
					attendees: {
						type: "array",
						items: { type: "string" },
						description: "Attendee emails",
					},
				},
				required: ["summary", "start", "end"],
			},
		},
		{
			name: "update_event",
			description: "Update an existing calendar event",
			inputSchema: {
				type: "object",
				properties: {
					calendarId: { type: "string", description: "Calendar ID" },
					eventId: { type: "string", description: "Event ID" },
					summary: { type: "string", description: "Event title" },
					description: { type: "string", description: "Event description" },
					start: { type: "string", description: "Start time (RFC3339)" },
					end: { type: "string", description: "End time (RFC3339)" },
				},
				required: ["eventId"],
			},
		},
		{
			name: "delete_event",
			description: "Delete a calendar event",
			inputSchema: {
				type: "object",
				properties: {
					calendarId: { type: "string", description: "Calendar ID" },
					eventId: { type: "string", description: "Event ID" },
				},
				required: ["eventId"],
			},
		},
	],
	async execute(toolName, args, accessToken) {
		const calId = (args.calendarId as string) || "primary";
		switch (toolName) {
			case "list_events": {
				const params = new URLSearchParams({
					orderBy: "startTime",
					singleEvents: "true",
				});
				if (args.maxResults) params.set("maxResults", String(args.maxResults));
				if (args.timeMin) params.set("timeMin", String(args.timeMin));
				if (args.timeMax) params.set("timeMax", String(args.timeMax));
				const data = await googleFetch(
					`${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}/events?${params}`,
					accessToken,
				);
				return textResult(data);
			}
			case "get_event": {
				const data = await googleFetch(
					`${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}/events/${args.eventId}`,
					accessToken,
				);
				return textResult(data);
			}
			case "create_event": {
				const body: Record<string, unknown> = {
					summary: args.summary,
					description: args.description,
					start: { dateTime: args.start },
					end: { dateTime: args.end },
				};
				if (Array.isArray(args.attendees)) {
					body.attendees = (args.attendees as string[]).map((e) => ({
						email: e,
					}));
				}
				const data = await googleFetch(
					`${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}/events`,
					accessToken,
					{ method: "POST", body: JSON.stringify(body) },
				);
				return textResult(data);
			}
			case "update_event": {
				const body: Record<string, unknown> = {};
				if (args.summary) body.summary = args.summary;
				if (args.description) body.description = args.description;
				if (args.start) body.start = { dateTime: args.start };
				if (args.end) body.end = { dateTime: args.end };
				const data = await googleFetch(
					`${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}/events/${args.eventId}`,
					accessToken,
					{ method: "PATCH", body: JSON.stringify(body) },
				);
				return textResult(data);
			}
			case "delete_event": {
				await googleFetch(
					`${CALENDAR_BASE}/calendars/${encodeURIComponent(calId)}/events/${args.eventId}`,
					accessToken,
					{ method: "DELETE" },
				);
				return textResult({ deleted: true });
			}
			default:
				return textResult(
					{ error: `Unknown Calendar tool: ${toolName}` },
					true,
				);
		}
	},
};

// ── Drive ───────────────────────────────────────────────────────────────

const driveService: OAuthServiceDefinition = {
	requiredScopes: [
		"https://www.googleapis.com/auth/drive.readonly",
		"https://www.googleapis.com/auth/drive.file",
	],
	tools: [
		{
			name: "list_files",
			description: "List files in Google Drive",
			inputSchema: {
				type: "object",
				properties: {
					pageSize: { type: "number", description: "Max results" },
					q: {
						type: "string",
						description: "Drive search query",
					},
					pageToken: { type: "string", description: "Pagination token" },
				},
			},
		},
		{
			name: "get_file",
			description: "Get metadata of a file",
			inputSchema: {
				type: "object",
				properties: {
					fileId: { type: "string", description: "File ID" },
					fields: {
						type: "string",
						description: "Comma-separated fields to return",
					},
				},
				required: ["fileId"],
			},
		},
		{
			name: "search_files",
			description: "Search for files in Google Drive",
			inputSchema: {
				type: "object",
				properties: {
					q: { type: "string", description: "Drive search query" },
					pageSize: { type: "number", description: "Max results" },
				},
				required: ["q"],
			},
		},
	],
	async execute(toolName, args, accessToken) {
		switch (toolName) {
			case "list_files": {
				const params = new URLSearchParams();
				if (args.pageSize) params.set("pageSize", String(args.pageSize));
				if (args.q) params.set("q", String(args.q));
				if (args.pageToken) params.set("pageToken", String(args.pageToken));
				const data = await googleFetch(
					`${DRIVE_BASE}/files?${params}`,
					accessToken,
				);
				return textResult(data);
			}
			case "get_file": {
				const fields = (args.fields as string) || "*";
				const data = await googleFetch(
					`${DRIVE_BASE}/files/${args.fileId}?fields=${encodeURIComponent(fields)}`,
					accessToken,
				);
				return textResult(data);
			}
			case "search_files": {
				const params = new URLSearchParams({ q: String(args.q) });
				if (args.pageSize) params.set("pageSize", String(args.pageSize));
				const data = await googleFetch(
					`${DRIVE_BASE}/files?${params}`,
					accessToken,
				);
				return textResult(data);
			}
			default:
				return textResult({ error: `Unknown Drive tool: ${toolName}` }, true);
		}
	},
};

// ── Sheets ──────────────────────────────────────────────────────────────

const sheetsService: OAuthServiceDefinition = {
	requiredScopes: [
		"https://www.googleapis.com/auth/spreadsheets.readonly",
		"https://www.googleapis.com/auth/spreadsheets",
	],
	tools: [
		{
			name: "get_spreadsheet",
			description: "Get spreadsheet metadata",
			inputSchema: {
				type: "object",
				properties: {
					spreadsheetId: { type: "string", description: "Spreadsheet ID" },
				},
				required: ["spreadsheetId"],
			},
		},
		{
			name: "read_range",
			description: "Read values from a spreadsheet range",
			inputSchema: {
				type: "object",
				properties: {
					spreadsheetId: { type: "string", description: "Spreadsheet ID" },
					range: {
						type: "string",
						description: "A1 notation range (e.g. Sheet1!A1:D10)",
					},
				},
				required: ["spreadsheetId", "range"],
			},
		},
		{
			name: "update_range",
			description: "Write values to a spreadsheet range",
			inputSchema: {
				type: "object",
				properties: {
					spreadsheetId: { type: "string", description: "Spreadsheet ID" },
					range: { type: "string", description: "A1 notation range" },
					values: {
						type: "array",
						description: "2D array of values",
					},
				},
				required: ["spreadsheetId", "range", "values"],
			},
		},
	],
	async execute(toolName, args, accessToken) {
		const sid = args.spreadsheetId as string;
		switch (toolName) {
			case "get_spreadsheet": {
				const data = await googleFetch(`${SHEETS_BASE}/${sid}`, accessToken);
				return textResult(data);
			}
			case "read_range": {
				const data = await googleFetch(
					`${SHEETS_BASE}/${sid}/values/${encodeURIComponent(String(args.range))}`,
					accessToken,
				);
				return textResult(data);
			}
			case "update_range": {
				const data = await googleFetch(
					`${SHEETS_BASE}/${sid}/values/${encodeURIComponent(String(args.range))}?valueInputOption=USER_ENTERED`,
					accessToken,
					{
						method: "PUT",
						body: JSON.stringify({
							range: args.range,
							majorDimension: "ROWS",
							values: args.values,
						}),
					},
				);
				return textResult(data);
			}
			default:
				return textResult({ error: `Unknown Sheets tool: ${toolName}` }, true);
		}
	},
};

// ── Docs ────────────────────────────────────────────────────────────────

const docsService: OAuthServiceDefinition = {
	requiredScopes: ["https://www.googleapis.com/auth/documents.readonly"],
	tools: [
		{
			name: "get_document",
			description: "Get a Google Docs document",
			inputSchema: {
				type: "object",
				properties: {
					documentId: { type: "string", description: "Document ID" },
				},
				required: ["documentId"],
			},
		},
	],
	async execute(toolName, args, accessToken) {
		switch (toolName) {
			case "get_document": {
				const data = await googleFetch(
					`${DOCS_BASE}/${args.documentId}`,
					accessToken,
				);
				return textResult(data);
			}
			default:
				return textResult({ error: `Unknown Docs tool: ${toolName}` }, true);
		}
	},
};

// ── Contacts ────────────────────────────────────────────────────────────

const contactsService: OAuthServiceDefinition = {
	requiredScopes: ["https://www.googleapis.com/auth/contacts.readonly"],
	tools: [
		{
			name: "list_contacts",
			description: "List contacts",
			inputSchema: {
				type: "object",
				properties: {
					pageSize: { type: "number", description: "Max results" },
					pageToken: { type: "string", description: "Pagination token" },
				},
			},
		},
		{
			name: "search_contacts",
			description: "Search contacts by name or email",
			inputSchema: {
				type: "object",
				properties: {
					query: { type: "string", description: "Search query" },
				},
				required: ["query"],
			},
		},
	],
	async execute(toolName, args, accessToken) {
		switch (toolName) {
			case "list_contacts": {
				const params = new URLSearchParams({
					personFields: "names,emailAddresses,phoneNumbers",
				});
				if (args.pageSize) params.set("pageSize", String(args.pageSize));
				if (args.pageToken) params.set("pageToken", String(args.pageToken));
				const data = await googleFetch(
					`${CONTACTS_BASE}?${params}`,
					accessToken,
				);
				return textResult(data);
			}
			case "search_contacts": {
				const params = new URLSearchParams({
					query: String(args.query),
					readMask: "names,emailAddresses,phoneNumbers",
				});
				const data = await googleFetch(
					`https://people.googleapis.com/v1/people:searchContacts?${params}`,
					accessToken,
				);
				return textResult(data);
			}
			default:
				return textResult(
					{ error: `Unknown Contacts tool: ${toolName}` },
					true,
				);
		}
	},
};

// ── Google Adapter ──────────────────────────────────────────────────────

function hasAnyScope(granted: string[], required: string[]): boolean {
	const grantedSet = new Set(granted);
	return required.some((s) => grantedSet.has(s));
}

const googleAdapter: OAuthAdapter = {
	services: {
		gmail: gmailService,
		calendar: calendarService,
		drive: driveService,
		sheets: sheetsService,
		docs: docsService,
		contacts: contactsService,
	},

	listTools(grantedScopes) {
		const all: OAuthToolDef[] = [];
		for (const svc of Object.values(this.services)) {
			if (!grantedScopes || hasAnyScope(grantedScopes, svc.requiredScopes)) {
				all.push(...svc.tools);
			}
		}
		return all;
	},

	async callTool(toolName, args, accessToken) {
		for (const svc of Object.values(this.services)) {
			const match = svc.tools.find((t) => t.name === toolName);
			if (match) {
				return svc.execute(toolName, args, accessToken);
			}
		}
		return textResult({ error: `Unknown tool: ${toolName}` }, true);
	},
};

// ── Registry ────────────────────────────────────────────────────────────

const oauthAdapters: Record<string, OAuthAdapter> = {
	google: googleAdapter,
};

export function getOAuthAdapter(builtinId: string): OAuthAdapter | undefined {
	return oauthAdapters[builtinId];
}

/**
 * Available Google services and their required OAuth scopes.
 * Used by the UI to present a service picker.
 */
export const GOOGLE_SERVICES = [
	{
		id: "gmail",
		name: "Gmail",
		description: "Read, send, and manage emails",
		scopes: [
			"https://www.googleapis.com/auth/gmail.readonly",
			"https://www.googleapis.com/auth/gmail.modify",
			"https://www.googleapis.com/auth/gmail.send",
		],
	},
	{
		id: "calendar",
		name: "Calendar",
		description: "View and manage calendar events",
		scopes: [
			"https://www.googleapis.com/auth/calendar",
			"https://www.googleapis.com/auth/calendar.events",
		],
	},
	{
		id: "drive",
		name: "Drive",
		description: "Browse and search files in Google Drive",
		scopes: [
			"https://www.googleapis.com/auth/drive.readonly",
			"https://www.googleapis.com/auth/drive.file",
		],
	},
	{
		id: "sheets",
		name: "Sheets",
		description: "Read and write spreadsheet data",
		scopes: [
			"https://www.googleapis.com/auth/spreadsheets.readonly",
			"https://www.googleapis.com/auth/spreadsheets",
		],
	},
	{
		id: "docs",
		name: "Docs",
		description: "Read Google Docs documents",
		scopes: ["https://www.googleapis.com/auth/documents.readonly"],
	},
	{
		id: "contacts",
		name: "Contacts",
		description: "Search and list contacts",
		scopes: ["https://www.googleapis.com/auth/contacts.readonly"],
	},
] as const;
