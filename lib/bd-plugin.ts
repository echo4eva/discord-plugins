import { existsSync } from "node:fs";
import { readFile, copyFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { OnStartResult, Plugin } from "esbuild";
import type { Meta } from "betterdiscord";
import prettier from "prettier";
import { simpleGit, type DefaultLogFields } from "simple-git";

const git = simpleGit();

const WScript = `/*@cc_on
@if (@_jscript)

	// Offer to self-install for clueless users that try to run this directly.
	var shell = WScript.CreateObject("WScript.Shell");
	var fs = new ActiveXObject("Scripting.FileSystemObject");
	var pathPlugins = shell.ExpandEnvironmentStrings("%APPDATA%\\BetterDiscord\\plugins");
	var pathSelf = WScript.ScriptFullName;
	// Put the user at ease by addressing them in the first person
	shell.Popup("It looks like you've mistakenly tried to run me directly. \\n(Don't do that!)", 0, "I'm a plugin for BetterDiscord", 0x30);
	if (fs.GetParentFolderName(pathSelf) === fs.GetAbsolutePathName(pathPlugins)) {
		shell.Popup("I'm in the correct folder already.", 0, "I'm already installed", 0x40);
	} else if (!fs.FolderExists(pathPlugins)) {
		shell.Popup("I can't find the BetterDiscord plugins folder.\\nAre you sure it's even installed?", 0, "Can't install myself", 0x10);
	} else if (shell.Popup("Should I copy myself to BetterDiscord's plugins folder for you?", 0, "Do you need some help?", 0x34) === 6) {
		fs.CopyFile(pathSelf, fs.BuildPath(pathPlugins, fs.GetFileName(pathSelf)), true);
		// Show the user where to put plugins in the future
		shell.Exec("explorer " + pathPlugins);
		shell.Popup("I'm installed!", 0, "Successfully installed", 0x40);
	}
	WScript.Quit();

@else@*/
`;

const knownMetaKeys = [
	"name",
	"author",
	"description",
	"version",
	"invite",
	"authorId",
	"authorLink",
	"donate",
	"patreon",
	"website",
	"source",
];

const config = await prettier.resolveConfig(".prettierrc");

export default {
	name: "BetterDiscord",
	async setup(build) {
		const options = build.initialOptions;

		// Default options
		options.bundle ??= true;
		options.minify ??= false;
		options.platform ??= "node";
		options.target ??= "chrome128";

		// Required options
		options.write = true;
		options.metafile = true;

		const rootMeta = JSON.parse(await readFile("package.json", "utf-8"));

		async function getMeta(entryPoint): Promise<Meta | null> {
			let meta = null;
			try {
				const packageJson = join(dirname(entryPoint), "package.json");
				if (!existsSync(packageJson)) return null;

				meta = JSON.parse(await readFile(packageJson, "utf-8"));

				// Merge root meta
				for (const key in rootMeta) {
					if (key === "maintainers") {
						if (!meta.ownMaintainersOnly)
							meta[key] = [...rootMeta[key], ...meta[key]];
						continue;
					}

					if (meta[key] !== undefined) continue;
					meta[key] = rootMeta[key];
				}

				// Fix the name to match standard betterdiscord naming
				meta.name = meta.name
					.replace(/\b\w/g, (l) => l.toUpperCase())
					.replace(/-/g, "");

				if (meta.maintainers[0].discord_id)
					meta.authorId = meta.maintainers[0].discord_id;
				meta.author = meta.maintainers.map((m) => m.name).join(", ");
				if (meta.funding) meta.donate = meta.funding;
				meta.source = `${meta.repository.url}/blob/master/${entryPoint}`;
			} catch (e) {
				console.error(e);
			}

			return meta;
		}

		build.onStart(async () => {
			// Check for package.json
			const entryPoints = build.initialOptions
				.entryPoints as unknown as string[];
			const result: OnStartResult = { warnings: [] };

			for (const entryPoint of entryPoints) {
				const packageJson = join(dirname(entryPoint), "package.json");
				if (existsSync(packageJson)) return null;

				result.warnings.push({
					text: `Missing package.json for ${entryPoint}`,
					location: { file: packageJson, lineText: "<config file>", line: 1 },
				});
			}

			return result;
		});

		build.onEnd(async (result) => {
			if (!result.metafile) return;

			for (const [path, output] of Object.entries(result.metafile.outputs)) {
				// Build meta
				const meta = await getMeta(output.entryPoint);
				if (meta === null) continue;

				// Filter out unknown keys
				for (const key in meta) {
					if (!knownMetaKeys.includes(key)) {
						delete meta[key];
					}
				}

				let metaComment = "";
				const fields = Object.entries(meta);
				fields.sort(([k1, _], [k2, __]) => {
					let i1 = knownMetaKeys.indexOf(k1);
					let i2 = knownMetaKeys.indexOf(k2);

					return i1 - i2;
				});

				metaComment = `/**\n${fields.map(([k, v]) => `* @${k} ${v}`).join("\n")}\n*/\n`;

				// Changelog, built from the commits that touched this plugin's source.
				// `changelogPaths` in its package.json lists folders it used to live
				// in, newest first, so history survives a rename.
				const pluginDir = dirname(output.entryPoint);
				const packageJson = JSON.parse(
					await readFile(join(pluginDir, "package.json"), "utf8"),
				);
				const dirs: string[] = [
					pluginDir,
					...(packageJson.changelogPaths ?? []),
				];
				const { all } = await git.log([
					"--stat=4096",
					"--no-renames",
					"--",
					...dirs,
				]);
				const versions = {};
				let version = null;
				const packagePaths = dirs.map((dir) => join(dir, "package.json"));
				// Older folders win, since the current path may have held another
				// plugin before the rename.
				const lookupOrder = [...packagePaths.slice(1), packagePaths[0]];
				const oldestPackagePath = packagePaths[packagePaths.length - 1];

				async function getVersion(line: DefaultLogFields) {
					for (const path of lookupOrder) {
						const content = await git
							.show(`${line.hash}:${path}`)
							.catch(() => null);
						if (content) return JSON.parse(content).version;
					}
					return undefined;
				}

				// If we're trying to bump the version, include the uncommitted version
				const uncommittedVersion = packageJson.version;
				const committedVersion = all[0] ? await getVersion(all[0]) : undefined;
				if (uncommittedVersion != committedVersion)
					version = uncommittedVersion;

				for (const line of all) {
					let createdHere = false;
					const files = (line.diff?.files ?? []).map((f) => f.file);
					if (packagePaths.some((path) => files.includes(path))) {
						version = (await getVersion(line)) ?? version;
						createdHere =
							files.includes(oldestPackagePath) &&
							!(await git
								.show(`${line.hash}^:${oldestPackagePath}`)
								.catch(() => null));
					}

					if (!version) continue;

					const prefixes = ["fixed", "added", "progress", "improved"] as const;
					const prefix = prefixes.find((p) =>
						line.message.startsWith(`${p}: `),
					);
					if (prefix) {
						const message = line.message.slice(prefix.length + 1).trim();

						if (!(version in versions)) versions[version] = {};
						if (!(prefix in versions[version])) versions[version][prefix] = [];

						versions[version][prefix].push(message);
					}
					if (createdHere) break;
				}

				const changesScript = `const CHANGES = ${JSON.stringify(versions, null, 2)};\n`;

				// Add WScript and meta
				let fileContent = `${metaComment + WScript + changesScript + (await readFile(path, "utf8"))}/*@end@*/`;
				fileContent = await prettier.format(fileContent, {
					filepath: path,
					...config,
				});
				await writeFile(path, fileContent);

				// Development builds reload in BetterDiscord; release builds stay in Plugins.
				if (!process.argv.includes("--build")) {
					const bdFolder = `${process.platform == "win32" ? process.env.APPDATA : process.platform == "darwin" ? `${process.env.HOME}/Library/Application Support` : process.env.XDG_CONFIG_HOME ? process.env.XDG_CONFIG_HOME : `${process.env.HOME}/.config`}/BetterDiscord/`;
					await copyFile(path, join(bdFolder, "plugins", basename(path)));
				}
			}
		});
	},
} as Plugin;
