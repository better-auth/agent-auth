import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, type ZodRawShape } from "zod";
import {
  getAgentAuthTools,
  filterTools,
  type ToolParameters,
} from "@auth/agent";
import { createClient, type ClientConfig } from "./client.js";

interface PropertyDescriptor {
  type?: string;
  items?: PropertyDescriptor & { oneOf?: PropertyDescriptor[] };
  enum?: [string, ...string[]];
  description?: string;
  properties?: Record<string, PropertyDescriptor>;
  required?: string[];
  oneOf?: PropertyDescriptor[];
}

function propToZod(prop: PropertyDescriptor): z.ZodTypeAny {
  if (prop.oneOf && prop.oneOf.length >= 2) {
    const [a, b, ...rest] = prop.oneOf.map(propToZod);
    return z.union([a, b, ...rest] as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }

  if (prop.type === "array") {
    const items = prop.items;
    if (items?.oneOf) {
      return z.array(propToZod(items));
    }
    return z.array(items?.type === "string" ? z.string() : z.unknown());
  }

  if (prop.enum) {
    return z.enum(prop.enum);
  }

  if (prop.type === "object" && prop.properties) {
    const shape: ZodRawShape = {};
    const req = new Set(prop.required ?? []);
    for (const [k, v] of Object.entries(prop.properties)) {
      let s = propToZod(v);
      if (v.description) s = s.describe(v.description);
      shape[k] = req.has(k) ? s : s.optional();
    }
    return z.object(shape);
  }

  switch (prop.type) {
    case "string": return z.string();
    case "number": return z.number();
    case "boolean": return z.boolean();
    case "object": return z.record(z.string(), z.unknown());
    default: return z.unknown();
  }
}

function jsonSchemaToZod(params: ToolParameters): ZodRawShape | undefined {
  const { properties, required } = params;
  const entries = Object.entries(properties);
  if (entries.length === 0) return undefined;

  const shape: ZodRawShape = {};
  const requiredSet = new Set(required ?? []);

  for (const [key, value] of entries) {
    const prop = value as PropertyDescriptor;
    let schema = propToZod(prop);

    if (prop.description) {
      schema = schema.describe(prop.description);
    }

    shape[key] = requiredSet.has(key) ? schema : schema.optional();
  }

  return shape;
}

export async function startMcpServer(config: ClientConfig): Promise<void> {
  const client = createClient(config);

  if (config.urls?.length) {
    await Promise.all(
      config.urls.map(async (url) => {
        try {
          await client.discoverProvider(url);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Warning: could not discover ${url}: ${msg}`);
        }
      }),
    );
  }

  const tools = getAgentAuthTools(client);

  const server = new McpServer({
    name: "auth-agent",
    version: "0.1.0",
  });

  for (const tool of tools) {
    const zodShape = jsonSchemaToZod(tool.parameters);
    const toolOpts: { description: string; inputSchema?: ZodRawShape } = {
      description: tool.description,
    };
    if (zodShape) {
      toolOpts.inputSchema = zodShape;
    }

    server.registerTool(
      tool.name,
      toolOpts,
      async (
        args: Record<string, unknown>,
        extra?: { signal?: AbortSignal },
      ) => {
        const result = await tool.execute(args, { signal: extra?.signal });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      },
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const cleanup = () => {
    client.destroy();
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGHUP", cleanup);
  server.server.onclose = cleanup;
}
