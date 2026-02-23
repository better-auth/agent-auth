import type { ResolvedGatewayOptions } from "../types";
import { gatewayCall } from "./gateway-call";
import { gatewayTools } from "./gateway-tools";
import {
	deleteProvider,
	listProviders,
	registerProvider,
} from "./mcp-providers";

export function createGatewayRoutes(opts: ResolvedGatewayOptions) {
	return {
		gatewayTools: gatewayTools(opts),
		gatewayCall: gatewayCall(opts),
		registerGatewayProvider: registerProvider(),
		listGatewayProviders: listProviders(),
		deleteGatewayProvider: deleteProvider(),
	};
}
