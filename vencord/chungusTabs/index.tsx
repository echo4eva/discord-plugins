/*
 * ChungusTabs for Vencord, by echo4eva
 * SPDX-License-Identifier: MIT
 */
import { addContextMenuPatch, removeContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings, Settings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { filters, find } from "@webpack";
import {
	Alerts,
	ContextMenuApi,
	FluxDispatcher,
	Menu,
	React,
	showToast,
	TextInput,
	Tooltip,
} from "@webpack/common";

import meta from "../../src/ChungusTabs/package.json";
import { createChannelTabs } from "../../src/shared/chungusTabs/core.jsx";
import { createMenuBuilder } from "../../src/shared/menuItems.jsx";
import { SettingsPanel } from "./settings";

const NAME = "ChungusTabs";
let instance: any;
let titleBarPatch: ((props: any, rendered: any) => void) | undefined;
const plain = (value: any) =>
	value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const findModule = (filter: any) => find(filter, { isIndirect: true });

function createInstance() {
	const buildMenuChildren = createMenuBuilder(React, Menu);
	const ChannelTabs = createChannelTabs({
		React,
		Webpack: {
			Filters: {
				byKeys: filters.byProps,
				byStrings: filters.byCode,
				byStoreName: filters.byStoreName,
			},
			getModule: findModule,
			getByKeys: (...keys: string[]) => findModule(filters.byProps(...keys)),
		},
		Data: {
			load: (namespace: string, key: string) =>
				plain(Settings.plugins[NAME]?.[namespace]?.[key]),
			save: (namespace: string, key: string, value: any) => {
				Settings.plugins[NAME][namespace] = {
					...plain(Settings.plugins[NAME][namespace]),
					[key]: plain(value),
				};
			},
		},
		DOM: {
			addStyle(id: string, css: string) {
				document.getElementById(id)?.remove();
				const style = document.createElement("style");
				style.id = id;
				style.textContent = css;
				document.head.append(style);
			},
			removeStyle: (id: string) => document.getElementById(id)?.remove(),
		},
		Components: { TextInput, Tooltip },
		ContextMenu: {
			buildMenuChildren,
			buildMenu: (items: any[]) => (props: any) => (
				<Menu.Menu
					{...props}
					navId="chungus-tabs"
					onClose={ContextMenuApi.closeContextMenu}
				>
					{buildMenuChildren(items)}
				</Menu.Menu>
			),
			open: (event: any, render: any, options: any) =>
				ContextMenuApi.openContextMenu(event, render, options),
			close: ContextMenuApi.closeContextMenu,
			patch(navId: string, callback: any) {
				const patch = (children: any[], props: any) =>
					callback({ props: { children } }, props);
				addContextMenuPatch(navId, patch);
				return () => removeContextMenuPatch(navId, patch);
			},
		},
		UI: {
			showToast: (text: string, options: any = {}) =>
				showToast({
					text,
					variant:
						options.type === "error"
							? "critical"
							: options.type === "success"
								? "success"
								: "default",
				}),
			showConfirmationModal: (title: string, body: any, options: any = {}) =>
				Alerts.show({
					title,
					body,
					confirmText: options.confirmText ?? "Okay",
					cancelText:
						options.cancelText === null
							? undefined
							: (options.cancelText ?? "Cancel"),
					onConfirm: options.onConfirm,
					onCancel: options.onCancel,
				}),
			buildSettingsPanel: (props: any) => <SettingsPanel {...props} />,
		},
		notice: (text: string) => {
			showToast({ text, variant: "critical" });
			return () => {};
		},
		isEnabled: () => Settings.plugins[NAME].enabled,
		patchTitleBar: (callback: any) => {
			titleBarPatch = callback;
			return () => {
				titleBarPatch = undefined;
			};
		},
	});
	return new ChannelTabs({ name: NAME, version: meta.version });
}

function onChannelSelect() {
	// Discord's route and stores settle after the dispatch finishes.
	setTimeout(() => instance?.onSwitch(), 0);
}

const settings = definePluginSettings({
	panel: {
		type: OptionType.COMPONENT,
		component: () => instance?.getSettingsPanel() ?? null,
	},
});

export default definePlugin({
	name: NAME,
	description: "Browser-style tabs, folders, and bookmarks for Discord.",
	authors: [{ name: "echo4eva", id: 0n }],
	settings,
	patches: [
		{
			find: '"data-window-chrome"',
			replacement: {
				match:
					/(function \i\((\i)\)\{let\{leading:.+?return\(0,\i\.jsxs\)\()"div",\{/,
				replace: "$1$self.TitleBar,{vcCtProps:$2,",
			},
		},
	],
	TitleBar({ vcCtProps, ...props }: any) {
		const rendered = React.createElement("div", props);
		titleBarPatch?.(vcCtProps, rendered);
		return rendered;
	},
	start() {
		instance = createInstance();
		instance.start();
		FluxDispatcher.subscribe("CHANNEL_SELECT", onChannelSelect);
	},
	stop() {
		FluxDispatcher.unsubscribe("CHANNEL_SELECT", onChannelSelect);
		instance?.stop();
		instance = undefined;
	},
});
