import type {
	CapabilityConstraints,
	ConstraintOperators,
	ConstraintPrimitive,
	ConstraintValue,
} from "../types";

// §5.11: violations use the original constraint object, not a stringified form
export interface ConstraintViolation {
	field: string;
	constraint: Record<string, unknown>;
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
			violations.push({ field, constraint: { eq: constraint }, actual });
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
			violations.push({ field, constraint: { eq: ops.eq }, actual });
		}
	}

	if (ops.min !== undefined) {
		if (typeof actual !== "number" || actual < ops.min) {
			violations.push({ field, constraint: { min: ops.min }, actual });
		}
	}

	if (ops.max !== undefined) {
		if (typeof actual !== "number" || actual > ops.max) {
			violations.push({ field, constraint: { max: ops.max }, actual });
		}
	}

	if (ops.in !== undefined) {
		if (!isPrimitive(actual) || !ops.in.includes(actual)) {
			violations.push({ field, constraint: { in: ops.in }, actual });
		}
	}

	if (ops.not_in !== undefined) {
		if (isPrimitive(actual) && ops.not_in.includes(actual)) {
			violations.push({ field, constraint: { not_in: ops.not_in }, actual });
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

/**
 * Check whether an existing grant's constraints fully cover the
 * requested constraints (i.e. the request would already be allowed).
 *
 * - Unrestricted grant (null constraints) covers everything.
 * - Restricted grant cannot cover an unrestricted request.
 * - When both have constraints, each requested field must be
 *   subsumed by the existing grant's constraint on that field.
 */
export function constraintsCover(
	existing: CapabilityConstraints | null | undefined,
	requested: CapabilityConstraints | null | undefined,
): boolean {
	if (!existing) return true;
	if (!requested) return false;

	for (const [field, reqValue] of Object.entries(requested)) {
		const exValue = existing[field];
		if (exValue === undefined) continue;
		if (!fieldConstraintCovers(exValue, reqValue)) return false;
	}
	return true;
}

function fieldConstraintCovers(
	existing: ConstraintValue,
	requested: ConstraintValue,
): boolean {
	const exOps = normOps(existing);
	const reqOps = normOps(requested);

	if (exOps.eq !== undefined) {
		if (reqOps.eq !== undefined) return exOps.eq === reqOps.eq;
		if (reqOps.in !== undefined) return reqOps.in.length === 1 && reqOps.in[0] === exOps.eq;
		return false;
	}

	if (exOps.in !== undefined) {
		const exSet = new Set(exOps.in.map(String));
		if (reqOps.eq !== undefined) return exSet.has(String(reqOps.eq));
		if (reqOps.in !== undefined) return reqOps.in.every((v) => exSet.has(String(v)));
		return false;
	}

	if (exOps.min !== undefined || exOps.max !== undefined) {
		if (reqOps.min !== undefined && exOps.min !== undefined && reqOps.min < exOps.min) return false;
		if (reqOps.max !== undefined && exOps.max !== undefined && reqOps.max > exOps.max) return false;
	}

	return JSON.stringify(existing) === JSON.stringify(requested);
}

function normOps(v: ConstraintValue): ConstraintOperators {
	if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
		return { eq: v };
	}
	return v;
}

/**
 * Find the first grant whose constraints allow the given execution
 * arguments. Use this instead of a plain `.find()` when an agent
 * may hold multiple grants for the same capability with different
 * constraint scopes.
 */
export function findMatchingGrant<T extends { constraints: CapabilityConstraints | null }>(
	grants: T[],
	args: Record<string, ConstraintPrimitive | undefined> | undefined,
): T | undefined {
	for (const grant of grants) {
		if (!grant.constraints) return grant;
		const result = validateConstraints(grant.constraints, args);
		if (result.valid) return grant;
	}
	return undefined;
}

/**
 * Intersect (narrow) constraints — §2.13.
 * When both agent-proposed and server-imposed constraints exist for the same
 * field, the tightest constraint wins.
 */
export function narrowConstraints(
	proposed: CapabilityConstraints | null,
	serverPolicy: CapabilityConstraints | null,
): CapabilityConstraints | null {
	if (!proposed && !serverPolicy) return null;
	if (!proposed) return serverPolicy;
	if (!serverPolicy) return proposed;

	const result: CapabilityConstraints = { ...proposed };

	for (const [field, serverVal] of Object.entries(serverPolicy)) {
		const proposedVal = result[field];
		if (proposedVal === undefined) {
			result[field] = serverVal;
			continue;
		}
		if (isPrimitive(serverVal as ConstraintPrimitive)) {
			result[field] = serverVal;
			continue;
		}
		if (isPrimitive(proposedVal as ConstraintPrimitive)) {
			const sv = serverVal as ConstraintOperators;
			const pv = proposedVal as ConstraintPrimitive;
			if (sv.eq !== undefined && pv !== sv.eq) {
				result[field] = serverVal;
				continue;
			}
			if (sv.in !== undefined && !sv.in.includes(pv)) {
				result[field] = serverVal;
				continue;
			}
			if (sv.not_in !== undefined && sv.not_in.includes(pv)) {
				result[field] = serverVal;
				continue;
			}
			if (sv.min !== undefined && (typeof pv !== "number" || pv < sv.min)) {
				result[field] = serverVal;
				continue;
			}
			if (sv.max !== undefined && (typeof pv !== "number" || pv > sv.max)) {
				result[field] = serverVal;
				continue;
			}
			continue;
		}
		const merged: ConstraintOperators = { ...(proposedVal as ConstraintOperators) };
		const sv = serverVal as ConstraintOperators;
		if (sv.max !== undefined) {
			merged.max =
				merged.max !== undefined
					? Math.min(merged.max, sv.max)
					: sv.max;
		}
		if (sv.min !== undefined) {
			merged.min =
				merged.min !== undefined
					? Math.max(merged.min, sv.min)
					: sv.min;
		}
		if (sv.in !== undefined) {
			merged.in = merged.in
				? merged.in.filter((v) => sv.in!.includes(v))
				: sv.in;
		}
		if (sv.not_in !== undefined) {
			merged.not_in = merged.not_in
				? [...new Set([...merged.not_in, ...sv.not_in])]
				: sv.not_in;
		}
		result[field] = merged;
	}

	return result;
}
