import { describe, it, expect } from "vitest";
import {
	toOpenAITools,
	toAnthropicTools,
	filterTools,
	type AgentAuthTool,
	type ToolParameters,
} from "../tools";

function makeTool(
	name: string,
	overrides?: Partial<AgentAuthTool>,
): AgentAuthTool {
	return {
		name,
		description: `Test tool: ${name}`,
		parameters: {
			type: "object",
			properties: {
				input: { type: "string", description: "test input" },
			},
			required: ["input"],
		},
		execute: async (args) => ({ ok: true, input: args.input }),
		...overrides,
	};
}

const sampleTools: AgentAuthTool[] = [
	makeTool("alpha"),
	makeTool("beta"),
	makeTool("gamma"),
];

// ─── toAnthropicTools ───────────────────────────────────────

describe("toAnthropicTools", () => {
	it("returns definitions with input_schema (not parameters)", () => {
		const { definitions } = toAnthropicTools(sampleTools);

		expect(definitions).toHaveLength(3);
		for (const def of definitions) {
			expect(def).toHaveProperty("input_schema");
			expect(def).not.toHaveProperty("parameters");
			expect(def.input_schema.type).toBe("object");
		}
	});

	it("processToolUse executes correct tool and returns tool_result blocks", async () => {
		const { processToolUse } = toAnthropicTools(sampleTools);

		const results = await processToolUse([
			{ type: "tool_use", id: "call_1", name: "alpha", input: { input: "hello" } },
			{ type: "tool_use", id: "call_2", name: "beta", input: { input: "world" } },
		]);

		expect(results).toHaveLength(2);
		expect(results[0].type).toBe("tool_result");
		expect(results[0].tool_use_id).toBe("call_1");
		expect(JSON.parse(results[0].content)).toEqual({ ok: true, input: "hello" });
		expect(results[1].tool_use_id).toBe("call_2");
		expect(JSON.parse(results[1].content)).toEqual({ ok: true, input: "world" });
	});

	it("processToolUse returns error for unknown tool", async () => {
		const { processToolUse } = toAnthropicTools(sampleTools);

		const results = await processToolUse([
			{ type: "tool_use", id: "call_x", name: "nonexistent", input: {} },
		]);

		const parsed = JSON.parse(results[0].content);
		expect(parsed.error).toContain("Unknown tool");
		expect(parsed.code).toBe("unknown_tool");
	});
});

// ─── toOpenAITools ──────────────────────────────────────────

describe("toOpenAITools", () => {
	it("returns definitions with parameters (not input_schema)", () => {
		const { definitions } = toOpenAITools(sampleTools);

		expect(definitions).toHaveLength(3);
		for (const def of definitions) {
			expect(def.type).toBe("function");
			expect(def.function).toHaveProperty("parameters");
			expect(def.function).not.toHaveProperty("input_schema");
			expect(def.function).not.toHaveProperty("strict");
		}
	});

	it("strict mode adds strict: true and additionalProperties: false", () => {
		const { definitions } = toOpenAITools(sampleTools, { strict: true });

		for (const def of definitions) {
			expect(def.function.strict).toBe(true);
			expect(
				(def.function.parameters as ToolParameters & { additionalProperties?: boolean })
					.additionalProperties,
			).toBe(false);
		}
	});

	it("strict mode recurses into nested objects", () => {
		const nested = makeTool("nested", {
			parameters: {
				type: "object",
				properties: {
					config: {
						type: "object",
						description: "nested obj",
						properties: {
							key: { type: "string", description: "key" },
						},
					},
				},
				required: [],
			},
		});

		const { definitions } = toOpenAITools([nested], { strict: true });
		const params = definitions[0].function.parameters as Record<string, unknown>;
		expect(params.additionalProperties).toBe(false);
		const configProp = (params.properties as Record<string, Record<string, unknown>>).config;
		expect(configProp.additionalProperties).toBe(false);
	});

	it("execute returns result from correct tool", async () => {
		const { execute } = toOpenAITools(sampleTools);
		const result = await execute("alpha", { input: "test" });
		expect(result).toEqual({ ok: true, input: "test" });
	});

	it("execute returns error for unknown tool", async () => {
		const { execute } = toOpenAITools(sampleTools);
		const result = (await execute("nope", {})) as { error: string; code: string };
		expect(result.error).toContain("Unknown tool");
		expect(result.code).toBe("unknown_tool");
	});
});

// ─── safeExecute (via adapters) ─────────────────────────────

describe("safeExecute", () => {
	it("catches thrown Error and returns { error }", async () => {
		const throwing = makeTool("throws", {
			execute: async () => {
				throw new Error("something broke");
			},
		});

		const { execute } = toOpenAITools([throwing]);
		const result = (await execute("throws", {})) as { error: string };
		expect(result.error).toBe("something broke");
	});

	it("catches error with code and returns { error, code }", async () => {
		const coded = makeTool("coded", {
			execute: async () => {
				const err = Object.assign(new Error("denied"), { code: "capability_not_granted" });
				throw err;
			},
		});

		const { execute } = toOpenAITools([coded]);
		const result = (await execute("coded", {})) as { error: string; code: string };
		expect(result.error).toBe("denied");
		expect(result.code).toBe("capability_not_granted");
	});

	it("catches non-Error throws", async () => {
		const weird = makeTool("weird", {
			execute: async () => {
				throw "string error";
			},
		});

		const { execute } = toOpenAITools([weird]);
		const result = (await execute("weird", {})) as { error: string };
		expect(result.error).toBe("Unknown error");
	});

	it("works through Anthropic adapter too", async () => {
		const throwing = makeTool("throws", {
			execute: async () => {
				throw new Error("boom");
			},
		});

		const { processToolUse } = toAnthropicTools([throwing]);
		const results = await processToolUse([
			{ type: "tool_use", id: "c1", name: "throws", input: {} },
		]);
		const parsed = JSON.parse(results[0].content);
		expect(parsed.error).toBe("boom");
	});
});

// ─── filterTools ────────────────────────────────────────────

describe("filterTools", () => {
	it("only: returns only named tools", () => {
		const result = filterTools(sampleTools, { only: ["alpha", "gamma"] });
		expect(result.map((t) => t.name)).toEqual(["alpha", "gamma"]);
	});

	it("exclude: removes named tools", () => {
		const result = filterTools(sampleTools, { exclude: ["beta"] });
		expect(result.map((t) => t.name)).toEqual(["alpha", "gamma"]);
	});

	it("returns all tools when no options match", () => {
		const result = filterTools(sampleTools, {});
		expect(result).toHaveLength(3);
	});

	it("only takes precedence over exclude", () => {
		const result = filterTools(sampleTools, {
			only: ["alpha"],
			exclude: ["alpha"],
		});
		expect(result.map((t) => t.name)).toEqual(["alpha"]);
	});
});
