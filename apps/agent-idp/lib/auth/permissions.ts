import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";

export const statement = {
	...defaultStatements,
	host: ["create", "read", "readAll", "delete"],
	agent: ["create", "read", "readAll", "delete", "approve"],
	connection: ["create", "read", "delete"],
	settings: ["read", "update"],
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
	...ownerAc.statements,
	host: ["create", "read", "readAll", "delete"],
	agent: ["create", "read", "readAll", "delete", "approve"],
	connection: ["create", "read", "delete"],
	settings: ["read", "update"],
});

export const admin = ac.newRole({
	...adminAc.statements,
	host: ["create", "read", "readAll", "delete"],
	agent: ["create", "read", "readAll", "delete", "approve"],
	connection: ["create", "read", "delete"],
	settings: ["read", "update"],
});

export const member = ac.newRole({
	host: ["read"],
	agent: ["create", "read"],
	connection: ["read"],
	settings: ["read"],
});
