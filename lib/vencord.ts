// Copies the native Vencord plugins in vencord/ into a Vencord source checkout's
// src/userplugins, then builds Vencord with --build.
//
// Each plugin gets its own folder that mirrors this repository's layout
// (vencord/<name> and src/shared) plus an index.ts pointing at it, so imports
// like ../../src/shared/... work both here and in the copy. Copying (not
// symlinking) keeps Vencord's import aliases (@api, @webpack, ...) resolving
// against Vencord's own tsconfig.
//
// VENCORD_DIR picks the checkout; it defaults to ../Vencord next to this repo.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const vencordDir = resolve(process.env.VENCORD_DIR ?? "../Vencord");
const userPlugins = join(vencordDir, "src", "userplugins");

if (!existsSync(join(vencordDir, "package.json"))) {
	console.error(
		`No Vencord checkout at ${vencordDir}. Clone https://github.com/Vendicated/Vencord there or set VENCORD_DIR.`,
	);
	process.exit(1);
}

for (const entry of await readdir("vencord", { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const target = join(userPlugins, entry.name);
	await rm(target, { recursive: true, force: true });
	await mkdir(target, { recursive: true });
	await cp(join("vencord", entry.name), join(target, "vencord", entry.name), {
		recursive: true,
	});
	await cp(join("src", "shared"), join(target, "src", "shared"), {
		recursive: true,
	});
	// Adapters may import their plugin manifest (for the displayed version).
	const projectName = entry.name[0].toUpperCase() + entry.name.slice(1);
	const manifest = join("src", projectName, "package.json");
	if (existsSync(manifest)) {
		await mkdir(join(target, "src", projectName), { recursive: true });
		await cp(manifest, join(target, "src", projectName, "package.json"));
	}
	await writeFile(
		join(target, "index.ts"),
		`export { default } from "./vencord/${entry.name}";\n`,
	);
	console.log(`Copied ${entry.name} to ${target}`);
}

if (process.argv.includes("--build")) {
	const { packageManager } = JSON.parse(
		await readFile(join(vencordDir, "package.json"), "utf-8"),
	);
	const result = spawnSync("npx", ["-y", packageManager, "build"], {
		cwd: vencordDir,
		stdio: "inherit",
	});
	process.exit(result.status ?? 1);
}
