import { build } from "esbuild";

const isWatch = process.argv.includes("--watch");

const shared = {
	bundle: true,
	platform: "node",
	target: "node20",
	format: "cjs",
	external: ["electron"],
	sourcemap: true,
	logLevel: "info",
};

const configs = [
	{
		...shared,
		entryPoints: ["electron/main.ts"],
		outfile: "dist-electron/main.js",
	},
	{
		...shared,
		entryPoints: ["electron/preload.ts"],
		outfile: "dist-electron/preload.js",
	},
];

for (const config of configs) {
	if (isWatch) {
		const ctx = await build({ ...config, ...{ plugins: [] } });
		await ctx.watch?.();
	} else {
		await build(config);
	}
}
