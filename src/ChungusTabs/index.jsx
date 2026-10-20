// BetterDiscord connects the shared tab bar to Discord's title bar.
import { createChannelTabs } from "../shared/chungusTabs/core.jsx";
import { showConfirmationModal } from "../shared/confirm.js";

const DATA_NAME = "ChannelTabsMac";
const api = new BdApi(DATA_NAME);
const { React, Webpack, Patcher, DOM, UI, ContextMenu } = api;

function rerenderTitleBar() {
	const root = document.getElementById("app-mount");
	const containerKey = Object.keys(root).find((k) =>
		k.startsWith("__reactContainer$"),
	);
	const target = BdApi.Utils.findInTree(
		root[containerKey],
		(node) => node.stateNode?.isReactComponent,
		{ walkable: ["child"] },
	);
	if (!target) return;
	const { render } = target.stateNode;
	if (render.toString().includes("null")) return;
	target.stateNode.render = () => null;
	target.stateNode.forceUpdate(() => {
		target.stateNode.render = render;
		target.stateNode.forceUpdate();
	});
}

function showChangelog(meta) {
	const { Data } = new BdApi(DATA_NAME);
	const lastVersion = Data.load("lastVersion");
	if (!lastVersion || !(lastVersion in CHANGES)) {
		Data.save("lastVersion", meta.version);
		return;
	}

	const titles = {
		fixed: "Fixes",
		added: "Features",
		progress: "Progress",
		improved: "Improvements",
	};
	const changes = [];
	for (const [version, changelog] of Object.entries(CHANGES)) {
		if (lastVersion === version) break;

		for (const [type, messages] of Object.entries(changelog)) {
			let change = changes.find((x) => x.type === type);
			if (!change) {
				change = {
					title: titles[type],
					type,
					items: [],
				};
				changes.push(change);
			}

			change.items.push(...messages);
		}
	}

	if (changes.length === 0) return;

	UI.showChangelogModal({
		title: meta.name,
		subtitle: "Version " + meta.version,
		blurb: `Here's what's been changed since version ${lastVersion}.`,
		changes,
	});
	Data.save("lastVersion", meta.version);
}

const ChannelTabs = createChannelTabs({
	React,
	Webpack,
	DOM,
	ContextMenu,
	Data: BdApi.Data,
	Components: BdApi.Components,
	UI: {
		buildSettingsPanel: (options) =>
			UI.buildSettingsPanel({
				...options,
				// The compatibility layer ignores each row's onChange callback.
				...(globalThis.BdCompatLayer
					? {
							onChange: (categoryId, settingId, value) => {
								const rows = categoryId
									? options.settings.find((row) => row.id === categoryId)
											?.settings
									: options.settings;
								rows?.find((row) => row.id === settingId)?.onChange?.(value);
							},
						}
					: {}),
			}),
		showToast: (text, options) => UI.showToast(text, options),
		showConfirmationModal,
	},
	isEnabled: () => BdApi.Plugins.isEnabled("ChungusTabs"),
	notice: (text) => UI.showNotice(text, { type: "warning" }),
	showChangelog,
	patchTitleBar(callback) {
		const [module, key] =
			Webpack.getWithKey(
				Webpack.Filters.byStrings("leading", "trailing", "title", "windowKey"),
			) ?? [];
		if (!module)
			throw new Error("ChungusTabs couldn't find Discord's title bar");
		const unpatch = Patcher.after(module, key, (_, [props], rendered) =>
			callback(props, rendered),
		);
		rerenderTitleBar();
		return () => {
			unpatch();
			rerenderTitleBar();
		};
	},
});

module.exports = ChannelTabs;
