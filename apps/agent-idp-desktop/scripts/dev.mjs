import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { createServer } from "vite";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const shared = {
	bundle: true,
	platform: "node",
	target: "node20",
	format: "cjs",
	external: ["electron"],
	sourcemap: true,
	logLevel: "info",
};

async function buildElectron() {
	await build({
		...shared,
		entryPoints: ["electron/main.ts"],
		outfile: "dist-electron/main.js",
	});
	await build({
		...shared,
		entryPoints: ["electron/preload.ts"],
		outfile: "dist-electron/preload.js",
	});
}

async function startDev() {
	await buildElectron();

	const vite = await createServer({
		server: { port: 5174 },
	});
	await vite.listen();
	const url = `http://localhost:${vite.config.server.port}`;
	console.log(`\n  Vite dev server running at ${url}\n`);

	let electronProcess = null;

	function startElectron() {
		if (electronProcess) {
			electronProcess.kill();
		}

		electronProcess = spawn(electronPath, ["."], {
			stdio: "inherit",
			env: {
				...process.env,
				VITE_DEV_SERVER_URL: url,
			},
		});

		electronProcess.on("close", (code) => {
			if (code !== null && code !== 0) {
				console.log(`Electron exited with code ${code}`);
			}
		});
	}

	startElectron();

	const mainCtx = await build({
		...shared,
		entryPoints: ["electron/main.ts"],
		outfile: "dist-electron/main.js",
		plugins: [
			{
				name: "restart-electron",
				setup(build) {
					build.onEnd(() => {
						console.log("\n  Electron main process rebuilt, restarting...\n");
						startElectron();
					});
				},
			},
		],
	});

	process.on("SIGINT", () => {
		if (electronProcess) electronProcess.kill();
		vite.close();
		process.exit();
	});
}

startDev();
