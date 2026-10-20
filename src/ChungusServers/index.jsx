// The server list itself is shared with the Vencord version in
// src/shared/chungusServers. This file finds Discord's pieces the
// BetterDiscord way and puts the list in place of Discord's server bar.

import { showConfirmationModal } from "../shared/confirm.js";
import * as core from "../shared/chungusServers/core.jsx";

const api = new BdApi("ChungusServers");
const { Webpack, Patcher, ContextMenu, Data, DOM, UI, React, Hooks } = api;

// The server bar. It is a memo whose props are { className, themeOverride }.
const [GuildsBarModule, GuildsBarKey] =
	Webpack.getWithKey(
		(m) => m?.$$typeof && String(m.type).includes('"guildsnav"'),
	) ?? [];

core.init({
	React,
	// BetterVencord (Vesktop/Vencord) has no BdApi.Hooks, so fall back to Discord's own hook.
	useStateFromStores:
		Hooks?.useStateFromStores ??
		Webpack.getByStrings("useStateFromStores", { searchExports: true }),
	stores: Object.fromEntries(
		[
			"SortedGuildStore",
			"GuildStore",
			"GuildReadStateStore",
			"SelectedGuildStore",
			"SelectedChannelStore",
			"UserGuildSettingsStore",
			"PrivateChannelReadStateStore",
			"ReadStateStore",
			"ChannelStore",
			"UserStore",
			"RelationshipStore",
			"RTCConnectionStore",
			"ChannelRTCStore",
		].map((name) => [name, Webpack.getStore(name)]),
	),
	modules: {
		GuildIconUtils: Webpack.getByKeys("getGuildIconURL"),
		ChannelIconUtils: Webpack.getByKeys("getChannelIconURL"),
		GuildNavigation: Webpack.getByKeys("transitionToGuildSync"),
		transitionTo: Webpack.getByStrings("transitionTo - Transitioning to ", {
			searchExports: true,
		}),
		GuildCreation: Webpack.getByKeys("openCreateGuildModal"),
		GlobalDiscovery: Webpack.getByKeys("transitionToGlobalDiscovery"),
		NotificationActions: Webpack.getByKeys("updateGuildNotificationSettings"),
		getMuteOptions: Webpack.getByStrings(
			".MINUTES_15",
			".HOURS_24",
			".ALWAYS",
			{
				searchExports: true,
			},
		),
		saveGuildFolders: Webpack.getModule(
			(m) =>
				typeof m === "function" &&
				String(m).includes('updateAsync("guildFolders"'),
			{ searchExports: true },
		),
		SidebarClasses: Webpack.getByKeys("guilds", "sidebar", "panels"),
	},
	storage: {
		load: (key) => Data.load(key),
		save: (key, value) => Data.save(key, value),
		delete: Data.delete && ((key) => Data.delete(key)),
	},
	toast: (text, type) => UI.showToast(text, { type }),
	confirm: showConfirmationModal,
	openMenu: (event, render) => ContextMenu.open(event, render),
	buildMenuChildren: (items) => ContextMenu.buildMenuChildren(items),
	Menu: ContextMenu.Menu,
	SettingsSwitches: (options) => UI.buildSettingsPanel(options),
});

// Remounts Discord's app so the patched server bar is used right away.
function rerenderApp() {
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

module.exports = class ChungusServers {
	constructor(meta) {
		this.meta = meta;
	}

	start() {
		core.loadSettings();
		if (!GuildsBarModule || !core.isSupported()) {
			UI.showToast("ChungusServers couldn't find Discord's server list", {
				type: "error",
			});
			return;
		}
		DOM.addStyle(core.getCss());
		this.unpatchMenu = ContextMenu.patch("guild-context", (menu, props) => {
			if (!Array.isArray(menu?.props?.children)) return;
			const groups = core.guildMenuGroups(props);
			if (groups.length)
				menu.props.children.push(ContextMenu.buildMenuChildren(groups));
		});
		Patcher.after(GuildsBarModule[GuildsBarKey], "type", (_, [props], native) =>
			core.renderServerBar(props, native),
		);
		rerenderApp();
		document.addEventListener("keydown", core.onKeyDown, true);
	}

	stop() {
		document.removeEventListener("keydown", core.onKeyDown, true);
		Patcher.unpatchAll();
		this.unpatchMenu?.();
		DOM.removeStyle();
		document.body.classList.remove("chungusServers-resizing");
		rerenderApp();
	}

	getSettingsPanel() {
		return <core.SettingsPanel />;
	}
};
