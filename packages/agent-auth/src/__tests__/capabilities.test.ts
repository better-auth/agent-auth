import { describe, expect, it } from "vitest";
import {
	findBlockedCapabilities,
	hasAllCapabilities,
	hasCapability,
	isSubsetOf,
	mergeCapabilities,
	parseCapabilityIds,
} from "../utils/capabilities";

describe("hasCapability", () => {
	it("matches exact capability", () => {
		expect(hasCapability(["read", "write"], "read")).toBe(true);
	});

	it("rejects missing capability", () => {
		expect(hasCapability(["read"], "write")).toBe(false);
	});

	it("wildcard '*' covers everything", () => {
		expect(hasCapability(["*"], "anything")).toBe(true);
	});

	it("trailing wildcard 'github.*' covers 'github.create_issue'", () => {
		expect(hasCapability(["github.*"], "github.create_issue")).toBe(true);
	});

	it("trailing wildcard does not cover different prefix", () => {
		expect(hasCapability(["github.*"], "slack.send_message")).toBe(false);
	});

	it("provider-prefix stripping: 'read' covers 'acme.read'", () => {
		expect(hasCapability(["read"], "acme.read")).toBe(true);
	});

	it("empty granted set covers nothing", () => {
		expect(hasCapability([], "read")).toBe(false);
	});
});

describe("hasAllCapabilities", () => {
	it("returns true when all are covered", () => {
		expect(hasAllCapabilities(["read", "write"], ["read", "write"])).toBe(
			true,
		);
	});

	it("returns false when some are missing", () => {
		expect(hasAllCapabilities(["read"], ["read", "write"])).toBe(false);
	});

	it("wildcard covers all", () => {
		expect(hasAllCapabilities(["*"], ["a", "b", "c"])).toBe(true);
	});
});

describe("isSubsetOf", () => {
	it("subset is accepted", () => {
		expect(isSubsetOf(["read"], ["read", "write"])).toBe(true);
	});

	it("superset is rejected", () => {
		expect(isSubsetOf(["read", "admin"], ["read"])).toBe(false);
	});
});

describe("mergeCapabilities", () => {
	it("deduplicates", () => {
		const result = mergeCapabilities(["a", "b"], ["b", "c"]);
		expect(result.sort()).toEqual(["a", "b", "c"]);
	});

	it("wildcard subsumes specific IDs", () => {
		const result = mergeCapabilities(
			["github.*"],
			["github.create_issue", "github.list_issues"],
		);
		expect(result).toEqual(["github.*"]);
	});

	it("global wildcard subsumes everything", () => {
		const result = mergeCapabilities(["*"], ["read", "write"]);
		expect(result).toEqual(["*"]);
	});
});

describe("findBlockedCapabilities", () => {
	it("returns empty when nothing is blocked", () => {
		expect(findBlockedCapabilities(["read", "write"], [])).toEqual([]);
	});

	it("finds blocked capabilities", () => {
		expect(
			findBlockedCapabilities(["read", "admin"], ["admin"]),
		).toEqual(["admin"]);
	});

	it("wildcard block catches specific IDs", () => {
		expect(
			findBlockedCapabilities(
				["github.create_issue", "slack.send"],
				["github.*"],
			),
		).toEqual(["github.create_issue"]);
	});
});

describe("parseCapabilityIds", () => {
	it("returns array as-is", () => {
		expect(parseCapabilityIds(["a", "b"])).toEqual(["a", "b"]);
	});

	it("parses JSON string", () => {
		expect(parseCapabilityIds('["a","b"]')).toEqual(["a", "b"]);
	});

	it("handles double-encoded string", () => {
		expect(parseCapabilityIds('"[\\"a\\",\\"b\\"]"')).toEqual(["a", "b"]);
	});

	it("returns empty for null/undefined", () => {
		expect(parseCapabilityIds(null)).toEqual([]);
		expect(parseCapabilityIds(undefined)).toEqual([]);
		expect(parseCapabilityIds("")).toEqual([]);
	});

	it("returns empty for invalid JSON", () => {
		expect(parseCapabilityIds("not-json")).toEqual([]);
	});
});
