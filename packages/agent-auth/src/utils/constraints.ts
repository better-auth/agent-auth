import type {
	CapabilityConstraints,
	ConstraintOperators,
	ConstraintPrimitive,
	ConstraintValue,
} from "../types";

export interface ConstraintViolation {
	field: string;
	constraint: string;
	actual: ConstraintPrimitive | undefined;
}

interface ValidationResult {
	valid: boolean;
	violations: ConstraintViolation[];
	unknownOperators: string[];
}

const KNOWN_OPERATORS = new Set(["eq", "min", "max", "in", "not_in"]);

function isPrimitive(v: ConstraintPrimitive | undefined): v is ConstraintPrimitive {
	return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function checkField(
	field: string,
	constraint: ConstraintValue,
	actual: ConstraintPrimitive | undefined,
): { violations: ConstraintViolation[]; unknownOps: string[] } {
	const violations: ConstraintViolation[] = [];
	const unknownOps: string[] = [];

	if (typeof constraint === "string" || typeof constraint === "number" || typeof constraint === "boolean") {
		if (actual !== constraint) {
			violations.push({ field, constraint: `eq:${String(constraint)}`, actual });
		}
		return { violations, unknownOps };
	}

	const ops = constraint;
	for (const key of Object.keys(ops)) {
		if (!KNOWN_OPERATORS.has(key)) {
			unknownOps.push(key);
			continue;
		}
	}

	if (ops.eq !== undefined) {
		if (actual !== ops.eq) {
			violations.push({ field, constraint: `eq:${String(ops.eq)}`, actual });
		}
	}

	if (ops.min !== undefined) {
		if (typeof actual !== "number" || actual < ops.min) {
			violations.push({ field, constraint: `min:${ops.min}`, actual });
		}
	}

	if (ops.max !== undefined) {
		if (typeof actual !== "number" || actual > ops.max) {
			violations.push({ field, constraint: `max:${ops.max}`, actual });
		}
	}

	if (ops.in !== undefined) {
		if (!isPrimitive(actual) || !ops.in.includes(actual)) {
			violations.push({ field, constraint: `in:[${ops.in.join(",")}]`, actual });
		}
	}

	if (ops.not_in !== undefined) {
		if (isPrimitive(actual) && ops.not_in.includes(actual)) {
			violations.push({ field, constraint: `not_in:[${ops.not_in.join(",")}]`, actual });
		}
	}

	return { violations, unknownOps };
}

/**
 * Validate execution arguments against granted constraints (§2.13).
 *
 * Returns all violations and any unknown operators encountered.
 * Callers should check `unknownOperators` first (→ 400) before
 * checking `violations` (→ 403).
 */
export function validateConstraints(
	constraints: CapabilityConstraints,
	args: Record<string, ConstraintPrimitive | undefined> | undefined,
): ValidationResult {
	const violations: ConstraintViolation[] = [];
	const unknownOperators: string[] = [];
	const safeArgs = (args ?? {}) as Record<string, ConstraintPrimitive | undefined>;

	for (const [field, constraint] of Object.entries(constraints)) {
		const actual = safeArgs[field];
		const result = checkField(field, constraint, actual);
		violations.push(...result.violations);
		unknownOperators.push(...result.unknownOps);
	}

	return {
		valid: violations.length === 0 && unknownOperators.length === 0,
		violations,
		unknownOperators,
	};
}
