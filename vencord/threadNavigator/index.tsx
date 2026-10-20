/*
 * ThreadNavigator for Vencord, by echo4eva
 * SPDX-License-Identifier: MIT
 */

// The thread list itself is shared with the BetterDiscord version in
// src/shared/threadNavigator. This file only hooks it into Discord.

import ErrorBoundary from "@components/ErrorBoundary";
import { classes } from "@utils/misc";
import definePlugin from "@utils/types";
import { findStoreLazy } from "@webpack";
import {
	ActiveJoinedThreadsStore,
	Alerts,
	ChannelSectionStore,
	ChannelStore,
	FluxDispatcher,
	NavigationRouter,
	PermissionStore,
	React,
	ReadStateStore,
	RestAPI,
	showToast,
	UserStore,
	useStateFromStores,
} from "@webpack/common";

import {
	closeAllBrowsers,
	isBrowserOpen,
	notifyChange,
	setBrowserOpen,
} from "../../src/shared/threadNavigator/state.js";
import managedStyle from "../../src/shared/threadNavigator/style.css?managed";
import { createThreadBrowser } from "../../src/shared/threadNavigator/ThreadBrowser.jsx";
import { createThreadData } from "../../src/shared/threadNavigator/threads.js";
import { openThreadMenu } from "./threadMenu";

const JoinedThreadsStore = findStoreLazy("JoinedThreadsStore");

// The Threads button's own popout toggle, kept so the list's "Discord
// discovery" button can still open Discord's thread popout.
const nativePopoutToggles = new Map<string, () => void>();

const TOAST_VARIANTS = {
	success: "success",
	error: "critical",
	warning: "critical",
} as const;

// Made on first use: Vencord fills in React and the stores after this file runs.
let shared: any = null;
function getShared() {
	if (shared) return shared;
	const data = createThreadData({
		stores: {
			ChannelStore,
			ActiveJoinedThreadsStore,
			ReadStateStore,
			JoinedThreadsStore,
			PermissionStore,
			UserStore,
		},
		getRest: () => RestAPI,
		dispatcher: FluxDispatcher,
	});
	const ui = createThreadBrowser({
		React,
		useStateFromStores,
		data,
		threadStores: () => [
			ChannelStore,
			ActiveJoinedThreadsStore,
			ReadStateStore,
			JoinedThreadsStore,
		],
		ChannelSectionStore,
		isMac: navigator.platform.startsWith("Mac"),
		navigate: (url: string) => NavigationRouter.transitionTo(url),
		toast: (text: string, kind: string) =>
			showToast({ text, variant: TOAST_VARIANTS[kind] ?? "default" }),
		confirm: ({ title, body, confirmText, onConfirm }) =>
			Alerts.show({
				title,
				body,
				confirmText,
				cancelText: "Cancel",
				onConfirm,
			}),
		openThreadMenu,
		openDiscovery: (parentId: string) => nativePopoutToggles.get(parentId)?.(),
	});
	shared = { data, ...ui };
	return shared;
}

// Stands in for the element Discord renders around a channel's chat. The list
// goes inside it, after Discord's own children so they keep their places and
// aren't remounted. Thread sidebars pass through untouched.
function ChatSwap({
	vcTnMain: Main,
	vcTnChannel: channel,
	children,
	...props
}: any) {
	const { data, ThreadBrowser, useBrowserOpen } = getShared();
	const browsable = props.isSidebar ? null : data.browsableChannel(channel);
	const open = useBrowserOpen(browsable?.parentId) && browsable != null;
	return React.createElement(
		Main,
		{
			...props,
			className: classes(props.className, open && "tn-chat-covered"),
		},
		...(Array.isArray(children) ? children : [children]),
		open && (
			<div className="tn-host" key="tn-host">
				<ErrorBoundary
					key={browsable.parentId}
					message="ThreadNavigator's thread list crashed."
				>
					<ThreadBrowser channel={browsable} />
				</ErrorBoundary>
			</div>
		),
	);
}

export default definePlugin({
	name: "ThreadNavigator",
	description:
		"A searchable thread list for any channel, with threads opening on the side.",
	authors: [{ name: "echo4eva", id: 0n }],
	managedStyle,

	patches: [
		// The Threads button in the channel header toggles the list instead of
		// Discord's popout, and shows as pressed while the list is open.
		{
			find: 'context:"popout"',
			replacement: [
				{
					match: /let\{channel:(\i)\}=\i,(?=\[\i,\i\]=\i\.useState\(!1\))/,
					replace:
						"$&vcTnChannel=$1,vcTnOpen=$self.useThreadsButtonPressed($1),",
				},
				{
					match: /onClick:(\i),(icon:.{0,160}?)selected:(\i)\}/,
					replace:
						"onClick:$self.wrapThreadsButton(vcTnChannel,$1),$2selected:$3||vcTnOpen}",
				},
			],
		},
		// The list covers the channel's chat while it is open.
		{
			find: '"ChannelTextAreaForm"',
			replacement: {
				match: /\(0,(\i)\.jsxs\)\((\i),\{isSidebar:(\i),/,
				replace:
					"(0,$1.jsxs)($self.ChatSwap,{vcTnMain:$2,vcTnChannel:this.props.channel,isSidebar:$3,",
			},
		},
	],

	ChatSwap,

	useThreadsButtonPressed(channel: any) {
		const { data, useBrowserOpen } = getShared();
		return useBrowserOpen(data.browsableChannel(channel)?.parentId);
	},

	wrapThreadsButton(channel: any, nativeToggle: () => void) {
		const parentId = getShared().data.browsableChannel(channel)?.parentId;
		if (!parentId) return nativeToggle;
		nativePopoutToggles.set(parentId, nativeToggle);
		return () => setBrowserOpen(parentId, !isBrowserOpen(parentId));
	},

	// Lists are open per ChungusTabs tab, and switching tabs selects a channel.
	start() {
		FluxDispatcher.subscribe("CHANNEL_SELECT", notifyChange);
	},

	stop() {
		FluxDispatcher.unsubscribe("CHANNEL_SELECT", notifyChange);
		closeAllBrowsers();
		nativePopoutToggles.clear();
	},
});
