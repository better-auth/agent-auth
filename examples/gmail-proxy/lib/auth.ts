import { agentAuth } from "@better-auth/agent-auth";
import type { Capability } from "@better-auth/agent-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth, anonymous } from "better-auth/plugins";
import { db } from "./db/index";
import * as schema from "./db/schema";
import { getSetting, insertLog } from "./db";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET as string;
const GMAIL_BASE_URL = "https://gmail.googleapis.com/gmail/v1";

const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
];

const capabilities: Capability[] = [
  {
    name: "gmail.messages.list",
    description: "List messages in the user's mailbox",
    input: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description:
            "Gmail search query (e.g. 'from:user@example.com is:unread')",
        },
        maxResults: {
          type: "number",
          description:
            "Maximum number of messages to return (default 10, max 500)",
        },
        pageToken: { type: "string", description: "Page token for pagination" },
        labelIds: {
          type: "array",
          items: { type: "string" },
          description: "Filter by label IDs",
        },
      },
    },
    constrainable_fields: {
      maxResults: {
        type: "number",
        description: "Constrain maximum results per request",
        operators: ["max"],
      },
      q: {
        type: "string",
        description: "Constrain search query (e.g. restrict to specific senders)",
        operators: ["eq"],
      },
    },
  },
  {
    name: "gmail.messages.listDetailed",
    description:
      "List messages with full details (subject, from, to, date, snippet, labels) in one call. Supports date range filtering and pagination. Much more efficient than listing IDs then fetching each.",
    input: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description:
            "Gmail search query (e.g. 'from:user@example.com is:unread'). Date filters from 'after'/'before' params are appended automatically.",
        },
        maxResults: {
          type: "number",
          description:
            "Maximum number of messages to return with details (default 10, max 50)",
        },
        after: {
          type: "string",
          description:
            "Only return messages after this date (ISO 8601 or YYYY/MM/DD, e.g. '2025-01-15')",
        },
        before: {
          type: "string",
          description:
            "Only return messages before this date (ISO 8601 or YYYY/MM/DD, e.g. '2025-02-01')",
        },
        pageToken: {
          type: "string",
          description: "Page token for pagination (from previous response)",
        },
        labelIds: {
          type: "array",
          items: { type: "string" },
          description: "Filter by label IDs",
        },
        format: {
          type: "string",
          description:
            "Detail level: 'metadata' (headers + snippet, default), 'full' (includes body), 'minimal' (IDs + labels only)",
        },
      },
    },
    constrainable_fields: {
      maxResults: {
        type: "number",
        description: "Constrain maximum results per request",
        operators: ["max"],
      },
      q: {
        type: "string",
        description:
          "Constrain search query (e.g. restrict to specific senders)",
        operators: ["eq"],
      },
      format: {
        type: "string",
        description: "Restrict which format the agent can request",
        operators: ["eq", "in"],
      },
    },
  },
  {
    name: "gmail.messages.get",
    description: "Get a specific message by ID, including full content",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The message ID" },
        format: {
          type: "string",
          description: "Format: 'full', 'metadata', 'minimal', or 'raw'",
        },
      },
      required: ["id"],
    },
    constrainable_fields: {
      format: {
        type: "string",
        description: "Restrict which format the agent can request",
        operators: ["eq", "in"],
      },
    },
  },
  {
    name: "gmail.messages.send",
    description: "Send an email message",
    input: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address(es), comma-separated",
        },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body (plain text)" },
        htmlBody: {
          type: "string",
          description:
            "Email body (HTML). If provided, takes precedence over body",
        },
        cc: { type: "string", description: "CC recipients, comma-separated" },
        bcc: { type: "string", description: "BCC recipients, comma-separated" },
        threadId: { type: "string", description: "Thread ID to reply to" },
        inReplyTo: {
          type: "string",
          description: "Message-ID header of the message being replied to",
        },
      },
      required: ["to", "subject"],
    },
    constrainable_fields: {
      to: {
        type: "string",
        description: "Restrict which recipients the agent can send to",
        operators: ["eq", "in"],
      },
    },
  },
  {
    name: "gmail.messages.trash",
    description: "Move a message to the trash",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The message ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "gmail.messages.untrash",
    description: "Remove a message from the trash",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The message ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "gmail.messages.modify",
    description: "Modify labels on a message (add/remove labels)",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The message ID" },
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
    name: "gmail.threads.list",
    description: "List threads in the user's mailbox",
    input: {
      type: "object",
      properties: {
        q: { type: "string", description: "Gmail search query" },
        maxResults: {
          type: "number",
          description: "Maximum number of threads to return",
        },
        pageToken: { type: "string", description: "Page token for pagination" },
        labelIds: {
          type: "array",
          items: { type: "string" },
          description: "Filter by label IDs",
        },
      },
    },
    constrainable_fields: {
      maxResults: {
        type: "number",
        description: "Constrain maximum results per request",
        operators: ["max"],
      },
    },
  },
  {
    name: "gmail.threads.get",
    description: "Get a specific thread by ID, including all messages",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The thread ID" },
        format: {
          type: "string",
          description: "Format: 'full', 'metadata', 'minimal'",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "gmail.threads.trash",
    description: "Move an entire thread to the trash",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The thread ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "gmail.threads.untrash",
    description: "Remove a thread from the trash",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The thread ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "gmail.labels.list",
    description: "List all labels in the user's mailbox",
  },
  {
    name: "gmail.labels.get",
    description: "Get a specific label by ID",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The label ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "gmail.labels.create",
    description: "Create a new label",
    input: {
      type: "object",
      properties: {
        name: { type: "string", description: "Label name" },
        labelListVisibility: {
          type: "string",
          description: "'labelShow', 'labelShowIfUnread', or 'labelHide'",
        },
        messageListVisibility: {
          type: "string",
          description: "'show' or 'hide'",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "gmail.labels.delete",
    description: "Delete a label",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The label ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "gmail.drafts.list",
    description: "List drafts in the user's mailbox",
    input: {
      type: "object",
      properties: {
        maxResults: {
          type: "number",
          description: "Maximum number of drafts to return",
        },
        pageToken: { type: "string", description: "Page token for pagination" },
      },
    },
    constrainable_fields: {
      maxResults: {
        type: "number",
        description: "Constrain maximum results per request",
        operators: ["max"],
      },
    },
  },
  {
    name: "gmail.drafts.get",
    description: "Get a specific draft by ID",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The draft ID" },
        format: {
          type: "string",
          description: "Format: 'full', 'metadata', 'minimal'",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "gmail.drafts.create",
    description: "Create a new draft",
    input: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address(es)" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body (plain text)" },
        htmlBody: { type: "string", description: "Email body (HTML)" },
        cc: { type: "string", description: "CC recipients" },
        bcc: { type: "string", description: "BCC recipients" },
        threadId: { type: "string", description: "Thread ID for reply draft" },
      },
      required: ["to", "subject"],
    },
  },
  {
    name: "gmail.drafts.send",
    description: "Send an existing draft",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The draft ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "gmail.drafts.delete",
    description: "Permanently delete a draft",
    input: {
      type: "object",
      properties: {
        id: { type: "string", description: "The draft ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "gmail.profile",
    description:
      "Get the user's Gmail profile (email address, messages total, threads total, history ID)",
  },
];

const READ_ONLY_CAPABILITIES = [
  "gmail.messages.list",
  "gmail.messages.listDetailed",
  "gmail.messages.get",
  "gmail.threads.list",
  "gmail.threads.get",
  "gmail.labels.list",
  "gmail.labels.get",
  "gmail.drafts.list",
  "gmail.drafts.get",
  "gmail.profile",
];

function buildMimeMessage(args: {
  to: string;
  subject: string;
  body?: string;
  htmlBody?: string;
  cc?: string;
  bcc?: string;
  inReplyTo?: string;
}): string {
  const boundary = `boundary_${Date.now()}`;
  const lines: string[] = [];

  lines.push(`To: ${args.to}`);
  if (args.cc) lines.push(`Cc: ${args.cc}`);
  if (args.bcc) lines.push(`Bcc: ${args.bcc}`);
  lines.push(`Subject: ${args.subject}`);
  if (args.inReplyTo) lines.push(`In-Reply-To: ${args.inReplyTo}`);
  lines.push("MIME-Version: 1.0");

  if (args.htmlBody) {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("");
    lines.push(args.body || "");
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/html; charset=UTF-8");
    lines.push("");
    lines.push(args.htmlBody);
    lines.push(`--${boundary}--`);
  } else {
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("");
    lines.push(args.body || "");
  }

  return btoa(lines.join("\r\n"))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken(
  adapter: {
    findOne: <T>(opts: {
      model: string;
      where: Array<{ field: string; value: string }>;
    }) => Promise<T | null>;
    update: <T>(opts: {
      model: string;
      where: Array<{ field: string; value: string }>;
      update: Record<string, unknown>;
    }) => Promise<T | null>;
  },
  userId: string,
): Promise<string> {
  const account = await adapter.findOne<{
    id: string;
    accessToken: string | null;
    refreshToken: string | null;
    accessTokenExpiresAt: string | Date | null;
  }>({
    model: "account",
    where: [
      { field: "userId", value: userId },
      { field: "providerId", value: "google" },
    ],
  });

  if (!account?.accessToken) {
    throw new Error(
      "No Google access token found. User must sign in with Google first.",
    );
  }

  const expiresAt = account.accessTokenExpiresAt
    ? new Date(account.accessTokenExpiresAt)
    : null;
  const isExpired = expiresAt && expiresAt.getTime() < Date.now() - 60_000;

  if (!isExpired) {
    return account.accessToken;
  }

  if (!account.refreshToken) {
    throw new Error(
      "Google access token expired and no refresh token available. User must re-authenticate.",
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to refresh Google token: ${res.status} ${body}`);
  }

  const tokens = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  await adapter.update({
    model: "account",
    where: [
      { field: "userId", value: userId },
      { field: "providerId", value: "google" },
    ],
    update: {
      accessToken: tokens.access_token,
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });

  return tokens.access_token;
}

async function gmailFetch(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${GMAIL_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${errorBody}`);
  }

  return res.json();
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "google",
          clientId: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
          discoveryUrl:
            "https://accounts.google.com/.well-known/openid-configuration",
          scopes: GMAIL_SCOPES,
          pkce: true,
          prompt: "consent",
          accessType: "offline",
        },
      ],
    }),
    anonymous(),
    agentAuth({
      allowDynamicHostRegistration: true,
      freshSessionWindow: async () => {
        if ((await getSetting("freshSessionEnabled")) !== "true") return 0;
        return parseInt((await getSetting("freshSessionWindow")) ?? "300", 10);
      },
      capabilities,
      defaultHostCapabilities: READ_ONLY_CAPABILITIES,
      providerName: "Gmail",
      providerDescription:
        "Gmail is Google's email service with over 1.8 billion users. This proxy provides AI agents with secure access to read, send, and manage emails, threads, labels, and drafts through the Gmail API.",
      modes: ["delegated"],
      approvalMethods: ["ciba", "device_authorization"],
      resolveApprovalMethod: async ({ preferredMethod, supportedMethods }) => {
        const serverPreferred =
          (await getSetting("preferredApprovalMethod")) ??
          "device_authorization";
        const method = preferredMethod ?? serverPreferred;
        return supportedMethods.includes(method)
          ? method
          : "device_authorization";
      },
      onExecute: async ({ ctx, capability, arguments: args, agentSession }) => {
        const token = await getAccessToken(
          ctx.context.adapter,
          agentSession.user.id,
        );

        switch (capability) {
          case "gmail.messages.listDetailed": {
            const maxResults = Math.min(
              Math.max(1, Number(args?.maxResults ?? 10)),
              50,
            );

            const queryParts: string[] = [];
            if (args?.q) queryParts.push(String(args.q));
            if (args?.after) {
              const d = new Date(args.after as string);
              if (!isNaN(d.getTime()))
                queryParts.push(
                  `after:${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
                );
            }
            if (args?.before) {
              const d = new Date(args.before as string);
              if (!isNaN(d.getTime()))
                queryParts.push(
                  `before:${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
                );
            }

            const listParams = new URLSearchParams();
            if (queryParts.length)
              listParams.set("q", queryParts.join(" "));
            listParams.set("maxResults", String(maxResults));
            if (args?.pageToken)
              listParams.set("pageToken", String(args.pageToken));
            if (args?.labelIds) {
              for (const l of args.labelIds as string[])
                listParams.append("labelIds", l);
            }

            const listResult = (await gmailFetch(
              token,
              `/users/me/messages?${listParams}`,
            )) as {
              messages?: { id: string; threadId: string }[];
              nextPageToken?: string;
              resultSizeEstimate?: number;
            };

            if (!listResult.messages?.length) {
              return {
                messages: [],
                nextPageToken: listResult.nextPageToken ?? null,
                resultSizeEstimate: listResult.resultSizeEstimate ?? 0,
              };
            }

            const format = String(args?.format ?? "metadata");
            const details = await Promise.all(
              listResult.messages.map((m) => {
                const p = new URLSearchParams({ format });
                return gmailFetch(
                  token,
                  `/users/me/messages/${m.id}?${p}`,
                ) as Promise<{
                  id: string;
                  threadId: string;
                  labelIds?: string[];
                  snippet?: string;
                  internalDate?: string;
                  sizeEstimate?: number;
                  payload?: {
                    headers?: { name: string; value: string }[];
                    [k: string]: unknown;
                  };
                  [k: string]: unknown;
                }>;
              }),
            );

            const messages = details.map((msg) => {
              const headers = msg.payload?.headers ?? [];
              const hdr = (name: string) =>
                headers.find(
                  (h) => h.name.toLowerCase() === name.toLowerCase(),
                )?.value ?? null;

              return {
                id: msg.id,
                threadId: msg.threadId,
                labelIds: msg.labelIds ?? [],
                snippet: msg.snippet ?? "",
                from: hdr("From"),
                to: hdr("To"),
                cc: hdr("Cc"),
                subject: hdr("Subject"),
                date: hdr("Date"),
                internalDate: msg.internalDate ?? null,
                sizeEstimate: msg.sizeEstimate ?? null,
                ...(format === "full" ? { payload: msg.payload } : {}),
              };
            });

            return {
              messages,
              nextPageToken: listResult.nextPageToken ?? null,
              resultSizeEstimate: listResult.resultSizeEstimate ?? 0,
            };
          }

          case "gmail.messages.list": {
            const params = new URLSearchParams();
            if (args?.q) params.set("q", String(args.q));
            if (args?.maxResults)
              params.set("maxResults", String(args.maxResults));
            if (args?.pageToken)
              params.set("pageToken", String(args.pageToken));
            if (args?.labelIds) {
              for (const l of args.labelIds as string[])
                params.append("labelIds", l);
            }
            const qs = params.toString();
            return gmailFetch(token, `/users/me/messages${qs ? `?${qs}` : ""}`);
          }

          case "gmail.messages.get": {
            const params = new URLSearchParams();
            if (args?.format) params.set("format", String(args.format));
            const qs = params.toString();
            return gmailFetch(
              token,
              `/users/me/messages/${args!.id}${qs ? `?${qs}` : ""}`,
            );
          }

          case "gmail.messages.send": {
            const raw = buildMimeMessage(
              args as {
                to: string;
                subject: string;
                body?: string;
                htmlBody?: string;
                cc?: string;
                bcc?: string;
                inReplyTo?: string;
              },
            );
            const body: Record<string, unknown> = { raw };
            if (args?.threadId) body.threadId = args.threadId;
            return gmailFetch(token, "/users/me/messages/send", {
              method: "POST",
              body: JSON.stringify(body),
            });
          }

          case "gmail.messages.trash":
            return gmailFetch(token, `/users/me/messages/${args!.id}/trash`, {
              method: "POST",
            });

          case "gmail.messages.untrash":
            return gmailFetch(token, `/users/me/messages/${args!.id}/untrash`, {
              method: "POST",
            });

          case "gmail.messages.modify":
            return gmailFetch(token, `/users/me/messages/${args!.id}/modify`, {
              method: "POST",
              body: JSON.stringify({
                addLabelIds: args?.addLabelIds ?? [],
                removeLabelIds: args?.removeLabelIds ?? [],
              }),
            });

          case "gmail.threads.list": {
            const params = new URLSearchParams();
            if (args?.q) params.set("q", String(args.q));
            if (args?.maxResults)
              params.set("maxResults", String(args.maxResults));
            if (args?.pageToken)
              params.set("pageToken", String(args.pageToken));
            if (args?.labelIds) {
              for (const l of args.labelIds as string[])
                params.append("labelIds", l);
            }
            const qs = params.toString();
            return gmailFetch(token, `/users/me/threads${qs ? `?${qs}` : ""}`);
          }

          case "gmail.threads.get": {
            const params = new URLSearchParams();
            if (args?.format) params.set("format", String(args.format));
            const qs = params.toString();
            return gmailFetch(
              token,
              `/users/me/threads/${args!.id}${qs ? `?${qs}` : ""}`,
            );
          }

          case "gmail.threads.trash":
            return gmailFetch(token, `/users/me/threads/${args!.id}/trash`, {
              method: "POST",
            });

          case "gmail.threads.untrash":
            return gmailFetch(token, `/users/me/threads/${args!.id}/untrash`, {
              method: "POST",
            });

          case "gmail.labels.list":
            return gmailFetch(token, "/users/me/labels");

          case "gmail.labels.get":
            return gmailFetch(token, `/users/me/labels/${args!.id}`);

          case "gmail.labels.create":
            return gmailFetch(token, "/users/me/labels", {
              method: "POST",
              body: JSON.stringify({
                name: args!.name,
                labelListVisibility: args?.labelListVisibility ?? "labelShow",
                messageListVisibility: args?.messageListVisibility ?? "show",
              }),
            });

          case "gmail.labels.delete":
            return gmailFetch(token, `/users/me/labels/${args!.id}`, {
              method: "DELETE",
            });

          case "gmail.drafts.list": {
            const params = new URLSearchParams();
            if (args?.maxResults)
              params.set("maxResults", String(args.maxResults));
            if (args?.pageToken)
              params.set("pageToken", String(args.pageToken));
            const qs = params.toString();
            return gmailFetch(token, `/users/me/drafts${qs ? `?${qs}` : ""}`);
          }

          case "gmail.drafts.get": {
            const params = new URLSearchParams();
            if (args?.format) params.set("format", String(args.format));
            const qs = params.toString();
            return gmailFetch(
              token,
              `/users/me/drafts/${args!.id}${qs ? `?${qs}` : ""}`,
            );
          }

          case "gmail.drafts.create": {
            const raw = buildMimeMessage(
              args as {
                to: string;
                subject: string;
                body?: string;
                htmlBody?: string;
                cc?: string;
                bcc?: string;
              },
            );
            const message: Record<string, unknown> = { raw };
            if (args?.threadId) message.threadId = args.threadId;
            return gmailFetch(token, "/users/me/drafts", {
              method: "POST",
              body: JSON.stringify({ message }),
            });
          }

          case "gmail.drafts.send":
            return gmailFetch(token, "/users/me/drafts/send", {
              method: "POST",
              body: JSON.stringify({ id: args!.id }),
            });

          case "gmail.drafts.delete":
            return gmailFetch(token, `/users/me/drafts/${args!.id}`, {
              method: "DELETE",
            });

          case "gmail.profile":
            return gmailFetch(token, "/users/me/profile");

          default:
            throw new Error(`Unknown capability: ${capability}`);
        }
      },
      onEvent: (event) => {
        const { type, actorId, actorType, agentId, hostId, orgId, ...rest } =
          event as unknown as Record<string, unknown>;
        insertLog(
          (type as string) ?? null,
          (actorId as string) ?? null,
          (actorType as string) ?? null,
          (agentId as string) ?? null,
          (hostId as string) ?? null,
          (orgId as string) ?? null,
          JSON.stringify(rest),
        ).catch(() => {});
      },
    }),
  ],
});
