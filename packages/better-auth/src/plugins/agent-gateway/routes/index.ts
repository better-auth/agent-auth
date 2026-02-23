import type { AgentGatewayOptions, ResolvedGatewayOptions } from "../types";
import { gatewayCall } from "./gateway-call";
import { gatewayConfig } from "./gateway-config";
import { gatewayTools } from "./gateway-tools";
import {
	deleteProvider,
	listProviders,
	registerProvider,
} from "./mcp-providers";

export function createGatewayRoutes(
	opts: ResolvedGatewayOptions,
	rawOpts?: AgentGatewayOptions,
) {
	return {
		gatewayTools: gatewayTools(opts),
		gatewayCall: gatewayCall(opts),
		registerGatewayProvider: registerProvider(rawOpts),
		listGatewayProviders: listProviders(),
		deleteGatewayProvider: deleteProvider(rawOpts),
		gatewayConfig: gatewayConfig(rawOpts ?? {}),
	};
}
