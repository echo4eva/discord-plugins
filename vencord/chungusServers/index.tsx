/*
 * ChungusServers for Vencord, by echo4eva
 * SPDX-License-Identifier: MIT
 */

// The server list itself is shared with the BetterDiscord version in
// src/shared/chungusServers. This file only hooks it into Discord.

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings, Settings } from "@api/Settings";
import { FormSwitch } from "@components/FormSwitch";
import definePlugin, { OptionType } from "@utils/types";
import { filters, find, wreq } from "@webpack";
import {
	Alerts,
	ContextMenuApi,
	Menu,
	NavigationRouter,
	React,
	showToast,
	useStateFromStores,
} from "@webpack/common";

import * as core from "../../src/shared/chungusServers/core.jsx";
import { createMenuBuilder } from "../../src/shared/menuItems.jsx";

const NAME = "ChungusServers";

const STORE_NAMES = [
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
];

// Like BetterDiscord's lookups: null when Discord no longer has it.
const findQuietly = (filter: (m: any) => boolean) =>
	find(filter, { isIndirect: true });

const TOAST_VARIANTS = { success: "success", error: "critical" } as const;

// The list's saved data, kept in Vencord's settings for this plugin. The
// settings store wraps what it holds in proxies, which can't be sent to
// Vencord's settings file once they end up inside a saved value, so only plain
// copies go in and come out. The data is all JSON.
const plain = (value: any) =>
	value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const storage = {
	load: (key: string) => plain(Settings.plugins[NAME]?.[key]),
	save: (key: string, value: any) => {
		Settings.plugins[NAME][key] = plain(value);
	},
	delete: (key: string) => {
		Settings.plugins[NAME][key] = undefined;
	},
};

function SettingsSwitches({ settings, onChange }: any) {
	return (
		<>
			{settings.map((setting: any) => (
				<FormSwitch
					key={setting.id}
					title={setting.name}
					description={setting.note}
					value={setting.value}
					onChange={(value) => onChange(null, setting.id, value)}
				/>
			))}
		</>
	);
}

// Done on first use: Vencord fills in React and the stores after this file runs.
let ready = false;
function setup() {
	if (ready) return;
	ready = true;
	core.init({
		React,
		useStateFromStores,
		stores: Object.fromEntries(
			STORE_NAMES.map((name) => [name, findQuietly(filters.byStoreName(name))]),
		),
		modules: {
			GuildIconUtils: findQuietly(filters.byProps("getGuildIconURL")),
			ChannelIconUtils: findQuietly(filters.byProps("getChannelIconURL")),
			GuildNavigation: findQuietly(filters.byProps("transitionToGuildSync")),
			transitionTo: (path: string) => NavigationRouter.transitionTo(path),
			GuildCreation: findQuietly(filters.byProps("openCreateGuildModal")),
			GlobalDiscovery: findQuietly(
				filters.byProps("transitionToGlobalDiscovery"),
			),
			NotificationActions: findQuietly(
				filters.byProps("updateGuildNotificationSettings"),
			),
			getMuteOptions: findQuietly(
				filters.byCode(".MINUTES_15", ".HOURS_24", ".ALWAYS"),
			),
			saveGuildFolders: findQuietly(
				(m) =>
					typeof m === "function" &&
					String(m).includes('updateAsync("guildFolders"'),
			),
			SidebarClasses: findQuietly(
				filters.byProps("guilds", "sidebar", "panels"),
			),
		},
		storage,
		toast: (text: string, type: string) =>
			showToast({ text, variant: TOAST_VARIANTS[type] ?? "default" }),
		confirm: (title: string, body: any, options: any) =>
			Alerts.show({
				title,
				body,
				confirmText: options.confirmText,
				cancelText: "Cancel",
				onConfirm: options.onConfirm,
			}),
		openMenu: (event: any, render: any) =>
			ContextMenuApi.openContextMenu(event, render),
		buildMenuChildren: createMenuBuilder(React, Menu),
		Menu: Menu.Menu,
		SettingsSwitches,
		webpackRequire: () => wreq,
	});
	core.loadSettings();
}

let style: HTMLStyleElement | null = null;

function onKeyDown(event: KeyboardEvent) {
	setup();
	core.onKeyDown(event);
}

const guildMenuPatch: NavContextMenuPatchCallback = (children, props) => {
	setup();
	const groups = core.guildMenuGroups(props);
	if (groups.length)
		children.push(createMenuBuilder(React, Menu)(groups) as any);
};

const settings = definePluginSettings({
	panel: {
		type: OptionType.COMPONENT,
		component: () => {
			setup();
			return <core.SettingsPanel />;
		},
	},
});

export default definePlugin({
	name: NAME,
	description:
		"A wider, resizable server list with named folders you can drag around.",
	authors: [{ name: "echo4eva", id: 0n }],
	settings,

	patches: [
		// Discord's server bar renders the list instead. Its own bar is passed
		// along for icon mode and in case the list crashes.
		{
			find: '"guildsnav"',
			replacement: {
				match:
					/(?<=function\((\i)\)\{let \i=\(0,\i\.\i\)\("guildsnav"\);return)(.+?)(?=\},\(\i,\i\)=>)/,
				replace: " $self.renderServerBar($1,$2)",
			},
		},
	],

	contextMenus: {
		"guild-context": guildMenuPatch,
	},

	renderServerBar(props: any, native: any) {
		setup();
		return core.renderServerBar(props, native);
	},

	start() {
		setup();
		style = document.createElement("style");
		style.id = "chungus-servers";
		style.textContent = core.getCss();
		document.head.append(style);
		document.addEventListener("keydown", onKeyDown, true);
	},

	stop() {
		document.removeEventListener("keydown", onKeyDown, true);
		style?.remove();
		style = null;
		document.body.classList.remove("chungusServers-resizing");
	},
});
