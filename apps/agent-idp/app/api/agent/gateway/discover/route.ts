import { listMCPTools } from "@/lib/mcp-client";
import { listAllProviders } from "@/lib/mcp-providers";

export async function GET() {
	const providers = listAllProviders();
	const result: Array<{
		name: string;
		displayName: string;
		tools: Array<{ name: string; description: string }>;
	}> = [];

	for (const provider of providers) {
		try {
			const tools = await listMCPTools(provider.endpoint);
			result.push({
				name: provider.name,
				displayName: provider.name,
				tools: tools.map((t) => ({
					name: t.name,
					description: t.description,
				})),
			});
		} catch {
			result.push({
				name: provider.name,
				displayName: provider.name,
				tools: [],
			});
		}
	}

	return Response.json({
		providers: result,
		cached: false,
	});
}
