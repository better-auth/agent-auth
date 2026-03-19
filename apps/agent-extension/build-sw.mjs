import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
  entryPoints: ["src/background/service-worker.ts"],
  bundle: true,
  outfile: "dist/service-worker.js",
  format: "esm",
  target: "chrome120",
  define: {
    "process.env.NODE_ENV": '"production"',
    __DIRECTORY_URL__: JSON.stringify(process.env.DIRECTORY_URL || "http://localhost:4200"),
  },
});

if (watch) {
  await ctx.watch();
  console.log("Watching service worker...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
