import { context } from "esbuild";
import { glob, watch } from "fs/promises";
import bdPlugin from "./bd-plugin.ts";

const ctx = await context({
	entryPoints: process.argv.includes("--tabs")
		? ["src/ChannelTabs/index.jsx"]
		: process.argv.includes("--thread-navigator")
			? ["src/ThreadNavigator/index.jsx"]
			: process.argv.includes("--category-alerts")
				? ["src/CategoryAlerts/index.jsx"]
				: await Array.fromAsync(glob("src/**/index.*")),
	outdir: "Plugins",
	entryNames: "[dir]/[dir].plugin",
	outbase: "src",
	plugins: [bdPlugin],
});

if (process.argv.includes("--build")) {
	await ctx.rebuild();
	process.exit();
}

await ctx.watch();

// watch for changes to package.json and reload the context
for await (const event of watch("src")) {
	if (event.filename.endsWith("package.json")) {
		console.log("Reloading context due to package.json change...");
		await ctx.rebuild();
	}
}
