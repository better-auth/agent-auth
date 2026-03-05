export type NumberRangeConstraint = {
	type: "number_range";
	path: string;
	min?: number;
	max?: number;
};

export type StringPatternConstraint = {
	type: "string_pattern";
	path: string;
	pattern: string;
};

export type StringEnumConstraint = {
	type: "string_enum";
	path: string;
	values: string[];
};

export type BooleanValueConstraint = {
	type: "boolean_value";
	path: string;
	value: boolean;
};

export type Constraint =
	| NumberRangeConstraint
	| StringPatternConstraint
	| StringEnumConstraint
	| BooleanValueConstraint;

export type InputScopePolicy = {
	id: string;
	parentScope: string;
	scope: string;
	description?: string;
	hidden?: boolean;
	constraints: Constraint[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function toNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function getValueByPath(
	input: Record<string, unknown>,
	path: string,
): unknown | undefined {
	const segments = path.split(".").filter(Boolean);
	let current: unknown = input;
	for (const segment of segments) {
		if (!isRecord(current)) return undefined;
		current = current[segment];
	}
	return current;
}

function normalizeConstraint(value: unknown): Constraint | null {
	if (!isRecord(value)) return null;
	if (typeof value.path !== "string" || value.path.trim() === "") return null;
	const path = value.path.trim();

	if (value.type === "number_range") {
		const min =
			value.min === undefined ? undefined : (toNumber(value.min) ?? undefined);
		const max =
			value.max === undefined ? undefined : (toNumber(value.max) ?? undefined);
		return { type: "number_range", path, min, max };
	}

	if (value.type === "string_pattern") {
		if (typeof value.pattern !== "string" || !value.pattern.trim()) return null;
		return { type: "string_pattern", path, pattern: value.pattern.trim() };
	}

	if (value.type === "string_enum") {
		if (!Array.isArray(value.values) || value.values.length === 0) return null;
		const values = value.values.filter(
			(v): v is string => typeof v === "string",
		);
		if (values.length === 0) return null;
		return { type: "string_enum", path, values };
	}

	if (value.type === "boolean_value") {
		if (typeof value.value !== "boolean") return null;
		return { type: "boolean_value", path, value: value.value };
	}

	return null;
}

function normalizePolicy(value: unknown): InputScopePolicy | null {
	if (!isRecord(value)) return null;
	if (typeof value.id !== "string" || value.id.trim() === "") return null;
	if (
		typeof value.parentScope !== "string" ||
		value.parentScope.trim() === ""
	) {
		return null;
	}
	if (typeof value.scope !== "string" || value.scope.trim() === "") return null;
	if (!Array.isArray(value.constraints) || value.constraints.length === 0) {
		return null;
	}

	const constraints = value.constraints
		.map(normalizeConstraint)
		.filter((c): c is Constraint => c !== null);
	if (constraints.length === 0) return null;

	return {
		id: value.id.trim(),
		parentScope: value.parentScope.trim(),
		scope: value.scope.trim(),
		description:
			typeof value.description === "string"
				? value.description
				: typeof value.label === "string"
					? value.label
					: undefined,
		hidden: value.hidden === true,
		constraints,
	};
}

export function resolveInputScopePolicies(
	meta: Record<string, unknown>,
): InputScopePolicy[] {
	if (!Array.isArray(meta.inputScopePolicies)) return [];
	return meta.inputScopePolicies
		.map(normalizePolicy)
		.filter((p): p is InputScopePolicy => p !== null);
}

export function policyMatchesInput(
	policy: InputScopePolicy,
	args: Record<string, unknown>,
): boolean {
	return policy.constraints.every((constraint) => {
		const raw = getValueByPath(args, constraint.path);

		switch (constraint.type) {
			case "number_range": {
				const value = toNumber(raw);
				if (value === null) return false;
				if (constraint.min !== undefined && value < constraint.min)
					return false;
				if (constraint.max !== undefined && value > constraint.max)
					return false;
				return true;
			}
			case "string_pattern": {
				if (typeof raw !== "string") return false;
				try {
					return new RegExp(constraint.pattern).test(raw);
				} catch {
					return false;
				}
			}
			case "string_enum": {
				if (typeof raw !== "string") return false;
				return constraint.values.includes(raw);
			}
			case "boolean_value": {
				return raw === constraint.value;
			}
			default:
				return false;
		}
	});
}
