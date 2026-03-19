import { describe, expect, it } from "vitest";
import { validateConstraints, narrowConstraints } from "../utils/constraints";

describe("validateConstraints", () => {
  it("passes when all eq constraints match", () => {
    const result = validateConstraints(
      { currency: "USD", region: "US" },
      { currency: "USD", region: "US" },
    );
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("fails when eq constraint mismatches", () => {
    const result = validateConstraints({ currency: "USD" }, { currency: "EUR" });
    expect(result.valid).toBe(false);
    expect(result.violations[0].field).toBe("currency");
  });

  it("supports primitive shorthand as eq", () => {
    const result = validateConstraints({ enabled: true }, { enabled: true });
    expect(result.valid).toBe(true);
  });

  it("fails primitive shorthand mismatch", () => {
    const result = validateConstraints({ enabled: true }, { enabled: false });
    expect(result.valid).toBe(false);
  });

  it("validates min operator (inclusive)", () => {
    expect(validateConstraints({ amount: { min: 10 } }, { amount: 10 }).valid).toBe(true);
    expect(validateConstraints({ amount: { min: 10 } }, { amount: 9 }).valid).toBe(false);
  });

  it("validates max operator (inclusive)", () => {
    expect(validateConstraints({ amount: { max: 100 } }, { amount: 100 }).valid).toBe(true);
    expect(validateConstraints({ amount: { max: 100 } }, { amount: 101 }).valid).toBe(false);
  });

  it("validates in operator", () => {
    expect(
      validateConstraints({ currency: { in: ["USD", "EUR"] } }, { currency: "USD" }).valid,
    ).toBe(true);
    expect(
      validateConstraints({ currency: { in: ["USD", "EUR"] } }, { currency: "GBP" }).valid,
    ).toBe(false);
  });

  it("validates not_in operator", () => {
    expect(validateConstraints({ currency: { not_in: ["GBP"] } }, { currency: "USD" }).valid).toBe(
      true,
    );
    expect(validateConstraints({ currency: { not_in: ["GBP"] } }, { currency: "GBP" }).valid).toBe(
      false,
    );
  });

  it("validates combined operators", () => {
    const result = validateConstraints(
      { amount: { min: 1, max: 1000, not_in: [666] } },
      { amount: 500 },
    );
    expect(result.valid).toBe(true);
  });

  it("reports multiple violations", () => {
    const result = validateConstraints(
      { currency: "USD", amount: { max: 100 } },
      { currency: "EUR", amount: 200 },
    );
    expect(result.violations).toHaveLength(2);
  });

  it("fails when field is missing from args", () => {
    const result = validateConstraints({ currency: "USD" }, {});
    expect(result.valid).toBe(false);
  });

  it("reports unknown operators", () => {
    const result = validateConstraints({ amount: { custom_op: 5 } as never }, { amount: 5 });
    expect(result.unknownOperators).toContain("custom_op");
  });

  it("passes with empty constraints", () => {
    const result = validateConstraints({}, { anything: "value" });
    expect(result.valid).toBe(true);
  });

  it("validates boolean constraints", () => {
    expect(validateConstraints({ sandbox: { eq: true } }, { sandbox: true }).valid).toBe(true);
    expect(validateConstraints({ sandbox: { eq: true } }, { sandbox: false }).valid).toBe(false);
  });

  it("validates string eq operator", () => {
    expect(validateConstraints({ region: { eq: "US" } }, { region: "US" }).valid).toBe(true);
    expect(validateConstraints({ region: { eq: "US" } }, { region: "EU" }).valid).toBe(false);
  });

  it("fails min on non-number", () => {
    const result = validateConstraints(
      { amount: { min: 10 } },
      { amount: "ten" as unknown as number },
    );
    expect(result.valid).toBe(false);
  });
});

describe("narrowConstraints", () => {
  it("returns null when both are null", () => {
    expect(narrowConstraints(null, null)).toBeNull();
  });

  it("returns serverPolicy when proposed is null", () => {
    const server = { currency: "USD" };
    expect(narrowConstraints(null, server)).toEqual(server);
  });

  it("returns proposed when serverPolicy is null", () => {
    const proposed = { currency: "EUR" };
    expect(narrowConstraints(proposed, null)).toEqual(proposed);
  });

  it("server primitive overrides proposed primitive", () => {
    const result = narrowConstraints({ currency: "EUR" }, { currency: "USD" });
    expect(result).toEqual({ currency: "USD" });
  });

  it("narrows max to the smaller value", () => {
    const result = narrowConstraints({ amount: { max: 1000 } }, { amount: { max: 500 } });
    expect(result).toEqual({ amount: { max: 500 } });
  });

  it("narrows min to the larger value", () => {
    const result = narrowConstraints({ amount: { min: 10 } }, { amount: { min: 50 } });
    expect(result).toEqual({ amount: { min: 50 } });
  });

  it("intersects in arrays", () => {
    const result = narrowConstraints(
      { currency: { in: ["USD", "EUR", "GBP"] } },
      { currency: { in: ["USD", "EUR"] } },
    );
    expect(result).toEqual({ currency: { in: ["USD", "EUR"] } });
  });

  it("returns empty in array when no intersection", () => {
    const result = narrowConstraints(
      { currency: { in: ["GBP"] } },
      { currency: { in: ["USD", "EUR"] } },
    );
    expect(result).toEqual({ currency: { in: [] } });
  });

  it("unions not_in arrays", () => {
    const result = narrowConstraints(
      { currency: { not_in: ["GBP"] } },
      { currency: { not_in: ["JPY"] } },
    );
    const notIn = (result as Record<string, { not_in: string[] }>).currency.not_in;
    expect(notIn).toContain("GBP");
    expect(notIn).toContain("JPY");
  });

  // Phase 1.2 fix: eq-vs-operator interaction
  it("enforces server operators when proposed is primitive (fix 1.2)", () => {
    const result = narrowConstraints({ currency: "GBP" }, { currency: { in: ["USD", "EUR"] } });
    // GBP is not in ["USD", "EUR"], so server constraint should win
    expect(result).toEqual({ currency: { in: ["USD", "EUR"] } });
  });

  it("keeps proposed primitive when it satisfies server operators", () => {
    const result = narrowConstraints({ currency: "USD" }, { currency: { in: ["USD", "EUR"] } });
    // USD is in ["USD", "EUR"], so proposed primitive is kept
    expect(result).toEqual({ currency: "USD" });
  });

  it("enforces server min when proposed primitive is below", () => {
    const result = narrowConstraints({ amount: 5 }, { amount: { min: 10 } });
    expect(result).toEqual({ amount: { min: 10 } });
  });

  it("keeps proposed primitive when it satisfies server min", () => {
    const result = narrowConstraints({ amount: 50 }, { amount: { min: 10 } });
    expect(result).toEqual({ amount: 50 });
  });

  it("enforces server max when proposed primitive exceeds", () => {
    const result = narrowConstraints({ amount: 200 }, { amount: { max: 100 } });
    expect(result).toEqual({ amount: { max: 100 } });
  });

  it("enforces server not_in when proposed primitive is excluded", () => {
    const result = narrowConstraints({ currency: "GBP" }, { currency: { not_in: ["GBP"] } });
    expect(result).toEqual({ currency: { not_in: ["GBP"] } });
  });

  it("enforces server eq when proposed primitive mismatches", () => {
    const result = narrowConstraints({ currency: "GBP" }, { currency: { eq: "USD" } });
    expect(result).toEqual({ currency: { eq: "USD" } });
  });

  it("adds server-only fields to result", () => {
    const result = narrowConstraints({ amount: { max: 100 } }, { currency: "USD" });
    expect(result).toEqual({ amount: { max: 100 }, currency: "USD" });
  });

  it("handles bidirectional narrowing", () => {
    const result = narrowConstraints(
      { amount: { min: 10, max: 1000 } },
      { amount: { min: 50, max: 500 } },
    );
    expect(result).toEqual({ amount: { min: 50, max: 500 } });
  });
});
