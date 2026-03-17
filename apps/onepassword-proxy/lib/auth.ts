import { agentAuth } from "@better-auth/agent-auth";
import type { Capability } from "@better-auth/agent-auth";
import { createClient, ItemCategory } from "@1password/sdk";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { db, getSetting, insertLog } from "./db";

const capabilities: Capability[] = [
  {
    name: "1password.vaults.list",
    description: "List all vaults you have access to",
  },
  {
    name: "1password.items.list",
    description: "List items in a vault",
    input: {
      type: "object",
      properties: {
        vaultId: {
          type: "string",
          description: "The ID of the vault to list items from",
        },
      },
      required: ["vaultId"],
    },
  },
  {
    name: "1password.items.get",
    description:
      "Get full details of an item including all fields, passwords, and secrets",
    input: {
      type: "object",
      properties: {
        vaultId: {
          type: "string",
          description: "The ID of the vault",
        },
        itemId: {
          type: "string",
          description: "The ID of the item",
        },
      },
      required: ["vaultId", "itemId"],
    },
  },
  {
    name: "1password.secrets.resolve",
    description:
      "Resolve a secret reference URI to get a specific field value (e.g. a password, API key, or TOTP code)",
    input: {
      type: "object",
      properties: {
        reference: {
          type: "string",
          description:
            "Secret reference URI in the format op://vault/item/field (e.g. op://Personal/GitHub/password)",
        },
      },
      required: ["reference"],
    },
  },
  {
    name: "1password.items.create",
    description: "Create a new item in a vault",
    input: {
      type: "object",
      properties: {
        vaultId: {
          type: "string",
          description: "The ID of the vault to create the item in",
        },
        title: { type: "string", description: "The title of the item" },
        category: {
          type: "string",
          description:
            "Item category: Login, Password, ApiCredentials, SecureNote, CreditCard, Identity, SshKey, Server, Database, Email, Membership, Passport, SoftwareLicense, BankAccount",
        },
        fields: {
          type: "array",
          description: "Array of field objects to add",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description:
                  "Field ID. Use 'username', 'password', 'notesPlain' for built-in fields, or a custom ID",
              },
              title: {
                type: "string",
                description: "Display label for the field",
              },
              value: {
                type: "string",
                description: "The value to store",
              },
              fieldType: {
                type: "string",
                description:
                  "Field type: Text, Concealed, Email, Url, Totp, Date, MonthYear, Phone, Address, CreditCardNumber, CreditCardType, Reference, SSHKey, Menu, Notes",
              },
              sectionId: {
                type: "string",
                description:
                  "Section ID to group this field under (required for custom fields)",
              },
            },
            required: ["id", "value"],
          },
        },
        websites: {
          type: "array",
          description: "URLs where 1Password should autofill credentials",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              label: { type: "string" },
            },
            required: ["url"],
          },
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags to assign to the item",
        },
        notes: {
          type: "string",
          description: "Notes to add to the item",
        },
      },
      required: ["vaultId", "title", "category"],
    },
  },
  {
    name: "1password.items.update",
    description: "Update an existing item — fetch it, modify fields, then save",
    input: {
      type: "object",
      properties: {
        vaultId: {
          type: "string",
          description: "The ID of the vault",
        },
        itemId: {
          type: "string",
          description: "The ID of the item to update",
        },
        title: { type: "string", description: "New title for the item" },
        fields: {
          type: "array",
          description:
            "Fields to update. Matches by field ID and replaces the value.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Field ID" },
              value: { type: "string", description: "New value" },
            },
            required: ["id", "value"],
          },
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Replace tags with these",
        },
        notes: { type: "string", description: "New notes" },
      },
      required: ["vaultId", "itemId"],
    },
  },
  {
    name: "1password.items.delete",
    description:
      "Permanently delete an item from a vault (remains in Recently Deleted for 30 days)",
    input: {
      type: "object",
      properties: {
        vaultId: {
          type: "string",
          description: "The ID of the vault",
        },
        itemId: {
          type: "string",
          description: "The ID of the item to delete",
        },
      },
      required: ["vaultId", "itemId"],
    },
  },
  {
    name: "1password.items.archive",
    description: "Archive an item (hide it without deleting)",
    input: {
      type: "object",
      properties: {
        vaultId: {
          type: "string",
          description: "The ID of the vault",
        },
        itemId: {
          type: "string",
          description: "The ID of the item to archive",
        },
      },
      required: ["vaultId", "itemId"],
    },
  },
];

const READ_ONLY_CAPABILITIES = [
  "1password.vaults.list",
  "1password.items.list",
  "1password.items.get",
  "1password.secrets.resolve",
];

const CATEGORY_MAP: Record<string, ItemCategory> = {
  login: ItemCategory.Login,
  password: ItemCategory.Password,
  apicredentials: ItemCategory.ApiCredentials,
  apicredential: ItemCategory.ApiCredentials,
  api_credential: ItemCategory.ApiCredentials,
  securenote: ItemCategory.SecureNote,
  secure_note: ItemCategory.SecureNote,
  creditcard: ItemCategory.CreditCard,
  credit_card: ItemCategory.CreditCard,
  identity: ItemCategory.Identity,
  sshkey: ItemCategory.SshKey,
  ssh_key: ItemCategory.SshKey,
  server: ItemCategory.Server,
  database: ItemCategory.Database,
  email: ItemCategory.Email,
  membership: ItemCategory.Membership,
  passport: ItemCategory.Passport,
  softwarelicense: ItemCategory.SoftwareLicense,
  software_license: ItemCategory.SoftwareLicense,
  bankaccount: ItemCategory.BankAccount,
  bank_account: ItemCategory.BankAccount,
  document: ItemCategory.Document,
};

function resolveCategory(input: string): ItemCategory {
  const normalized = input.toLowerCase().replace(/[\s-]/g, "");
  return CATEGORY_MAP[normalized] ?? ItemCategory.Login;
}

let _client: Awaited<ReturnType<typeof createClient>> | null = null;

async function getClient() {
  if (_client) return _client;

  const token = process.env.OP_SERVICE_ACCOUNT_TOKEN;
  if (!token) {
    throw new Error(
      "OP_SERVICE_ACCOUNT_TOKEN not set. Create a service account at https://my.1password.com/developer-tools/infrastructure-secrets/serviceaccount and set the token in .env",
    );
  }

  _client = await createClient({
    auth: token,
    integrationName: "1Password Agent Auth Proxy",
    integrationVersion: "v1.0.0",
  });

  return _client;
}

export const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    anonymous(),
    agentAuth({
      freshSessionWindow: () => {
        if (getSetting("freshSessionEnabled") !== "true") return 0;
        return parseInt(getSetting("freshSessionWindow") ?? "300", 10);
      },
      capabilities,
      providerName: "1Password",
      providerDescription:
        "1Password is the world's most trusted password manager. This proxy provides AI agents with secure access to vaults, items, and secrets through the 1Password SDK.",
      modes: ["delegated"],
      approvalMethods: ["ciba", "device_authorization"],
      resolveApprovalMethod: ({ preferredMethod, supportedMethods }) => {
        const serverPreferred =
          getSetting("preferredApprovalMethod") ?? "device_authorization";
        const method = preferredMethod ?? serverPreferred;
        return supportedMethods.includes(method)
          ? method
          : "device_authorization";
      },
		onExecute: async ({ capability, arguments: args }) => {
			const client = await getClient();

			try {
			switch (capability) {
          case "1password.vaults.list":
            return client.vaults.list();

          case "1password.items.list":
            return client.items.list(String(args!.vaultId));

          case "1password.items.get":
            return client.items.get(
              String(args!.vaultId),
              String(args!.itemId),
            );

          case "1password.secrets.resolve":
            return {
              value: await client.secrets.resolve(String(args!.reference)),
            };

          case "1password.items.create": {
            const item = {
              title: String(args!.title),
              category: resolveCategory(String(args!.category)),
              vaultId: String(args!.vaultId),
              fields: (
                (args?.fields as Array<{
                  id: string;
                  title?: string;
                  value: string;
                  fieldType?: string;
                  sectionId?: string;
                }>) ?? []
              ).map((f) => ({
                id: f.id,
                title: f.title ?? f.id,
                value: f.value,
                fieldType: f.fieldType ?? "Text",
                sectionId: f.sectionId ? { sectionId: f.sectionId } : undefined,
              })),
              websites: (
                (args?.websites as Array<{
                  url: string;
                  label?: string;
                }>) ?? []
              ).map((w) => ({
                url: w.url,
                label: w.label ?? "",
                autofillBehavior: "AnywhereOnWebsite",
              })),
              tags: (args?.tags as string[]) ?? [],
              notes: args?.notes ? String(args.notes) : "",
              sections: [],
            };
            return client.items.create(
              item as Parameters<typeof client.items.create>[0],
            );
          }

          case "1password.items.update": {
            const existing = await client.items.get(
              String(args!.vaultId),
              String(args!.itemId),
            );

            if (args?.title) existing.title = String(args.title);
            if (args?.notes !== undefined) existing.notes = String(args.notes);
            if (args?.tags) existing.tags = args.tags as string[];

            if (args?.fields && Array.isArray(args.fields)) {
              for (const update of args.fields as Array<{
                id: string;
                value: string;
              }>) {
                const field = existing.fields.find(
                  (f: { id: string }) => f.id === update.id,
                );
                if (field) {
                  field.value = update.value;
                }
              }
            }

            return client.items.put(existing);
          }

          case "1password.items.delete":
            await client.items.delete(
              String(args!.vaultId),
              String(args!.itemId),
            );
            return { success: true };

          case "1password.items.archive":
            await client.items.archive(
              String(args!.vaultId),
              String(args!.itemId),
            );
            return { success: true };

				default:
					throw new Error(`Unknown capability: ${capability}`);
			}
			} catch (err) {
				console.error(`[1Password] ${capability} failed:`, err);
				throw err;
			}
		},
      onEvent: (event) => {
        try {
          const { type, actorId, actorType, agentId, hostId, orgId, ...rest } =
            event as unknown as Record<string, unknown>;
          insertLog.run(
            type ?? null,
            (actorId as string) ?? null,
            (actorType as string) ?? null,
            (agentId as string) ?? null,
            (hostId as string) ?? null,
            (orgId as string) ?? null,
            JSON.stringify(rest),
          );
        } catch {
          // never let logging break the flow
        }
      },
    }),
  ],
  trustedOrigins: ["chrome-extension://"],
});
