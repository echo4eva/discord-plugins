// The thread list itself is shared with the Vencord version in
// src/shared/threadNavigator. This file finds Discord's pieces the
// BetterDiscord way and puts the list on screen.

import { showConfirmationModal } from "../shared/confirm.js";
import {
	closeAllBrowsers,
	isBrowserOpen,
	notifyChange,
	setBrowserOpen,
	subscribe,
} from "../shared/threadNavigator/state.js";
import css from "../shared/threadNavigator/style.css";
import { createThreadBrowser } from "../shared/threadNavigator/ThreadBrowser.jsx";
import { createThreadData } from "../shared/threadNavigator/threads.js";

const api = new BdApi("ThreadNavigator");
const { Webpack, DOM, UI, React, ReactDOM, Hooks } = api;

// BetterVencord (Vesktop/Vencord) has no process.platform.
const IS_MAC = navigator.platform.startsWith("Mac");

const ChannelStore = Webpack.getStore("ChannelStore");
const GuildStore = Webpack.getStore("GuildStore");
const ActiveJoinedThreadsStore = Webpack.getStore("ActiveJoinedThreadsStore");
const ReadStateStore = Webpack.getStore("ReadStateStore");
const JoinedThreadsStore = Webpack.getStore("JoinedThreadsStore");
const PermissionStore = Webpack.getStore("PermissionStore");
const UserStore = Webpack.getStore("UserStore");
const ChannelSectionStore = Webpack.getStore("ChannelSectionStore");
const FluxDispatcher = Webpack.getByKeys(
	"subscribe",
	"dispatch",
	"unsubscribe",
);
const transitionTo = Webpack.getByStrings("transitionTo - Transitioning to ", {
	searchExports: true,
});
// BetterVencord (Vesktop/Vencord) has no BdApi.Hooks, so fall back to Discord's own hook.
const useStateFromStores =
	Hooks?.useStateFromStores ??
	Webpack.getByStrings("useStateFromStores", { searchExports: true });
const createRoot =
	ReactDOM?.createRoot ??
	Webpack.getByKeys("createRoot", "hydrateRoot")?.createRoot;

// Discord's REST client adds the API base URL, authorization, and client
// headers; its methods take { url, body } and reject on non-2xx responses.
function findRestClient() {
	return Webpack.getModule(
		(m) =>
			["get", "post", "put", "patch", "del"].every(
				(key) => typeof m?.[key] === "function",
			),
		{ searchExports: true },
	);
}

// Discord's own thread right-click menu, found by its navId. It is loaded lazily,
// so it is looked up when needed and may be missing until a thread menu has been
// opened once.
let threadContextMenu = null;
function findThreadContextMenu() {
	if (threadContextMenu) return threadContextMenu;
	try {
		threadContextMenu = Webpack.getModule(
			(exported) =>
				typeof exported === "function" &&
				exported.toString().includes('"thread-context"'),
			{ searchExports: true },
		);
	} catch (error) {
		console.warn("[ThreadNavigator] Thread menu lookup failed", error);
	}
	return threadContextMenu ?? null;
}

async function copyText(text, toast) {
	try {
		if (globalThis.DiscordNative?.clipboard?.copy)
			DiscordNative.clipboard.copy(text);
		else await navigator.clipboard.writeText(text);
		UI.showToast(toast, { type: "success" });
	} catch (error) {
		console.error("[ThreadNavigator] Copy failed", error);
		UI.showToast("Could not copy to the clipboard.", { type: "error" });
	}
}

// Shows a fallback if what it wraps throws while rendering.
class Boundary extends React.Component {
	constructor(props) {
		super(props);
		this.state = { failed: false };
	}

	static getDerivedStateFromError() {
		return { failed: true };
	}

	componentDidCatch(error) {
		console.warn(
			`[ThreadNavigator] ${this.props.name} failed to render`,
			error,
		);
	}

	render() {
		return this.state.failed ? this.props.fallback() : this.props.children;
	}
}

// Same menu as right-clicking the thread in the channel list: Discord's own
// thread menu (with anything other plugins add to it) at the cursor.
function openThreadMenu(event, { thread, guildId, onOpen }) {
	event.preventDefault();
	event.stopPropagation();
	const channel = ChannelStore.getChannel(thread.id);
	const fallback = (menuProps) =>
		api.ContextMenu.buildMenu([
			{ label: "Open thread", action: () => onOpen(false) },
			{ label: "Open in new tab", action: () => onOpen(true) },
			{ type: "separator" },
			{
				label: "Copy link",
				action: () =>
					copyText(
						`https://discord.com/channels/${guildId}/${thread.id}`,
						"Link copied",
					),
			},
			{
				label: "Copy thread ID",
				action: () => copyText(thread.id, "Thread ID copied"),
			},
		])(menuProps);

	const NativeMenu = channel && findThreadContextMenu();
	if (NativeMenu) {
		api.ContextMenu.open(event, (menuProps) => (
			<Boundary name="Thread menu" fallback={() => fallback(menuProps)}>
				<NativeMenu
					{...menuProps}
					channel={channel}
					guild={GuildStore.getGuild(channel.guild_id)}
				/>
			</Boundary>
		));
		return;
	}

	// Not loaded yet: borrow the channel list's row if the thread is shown there.
	const row = document.querySelector(
		`[data-list-item-id="channels___${thread.id}"]`,
	);
	if (row) {
		row.dispatchEvent(
			new MouseEvent("contextmenu", {
				bubbles: true,
				cancelable: true,
				view: window,
				clientX: event.clientX,
				clientY: event.clientY,
			}),
		);
		return;
	}
	api.ContextMenu.open(event, fallback);
}

const data = createThreadData({
	stores: {
		ChannelStore,
		ActiveJoinedThreadsStore,
		ReadStateStore,
		JoinedThreadsStore,
		PermissionStore,
		UserStore,
	},
	getRest: findRestClient,
	dispatcher: FluxDispatcher,
});

module.exports = class ThreadNavigator {
	constructor(meta) {
		this.meta = meta;
		this.sync = this.sync.bind(this);
		this.scheduleSync = this.scheduleSync.bind(this);
		this.onNativeThreadsClick = this.onNativeThreadsClick.bind(this);
		this.onNativeThreadsKeyDown = this.onNativeThreadsKeyDown.bind(this);
	}

	start() {
		this.ui = createThreadBrowser({
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
			isMac: IS_MAC,
			navigate: (url) => {
				if (typeof transitionTo === "function") transitionTo(url);
				else
					UI.showToast("Discord thread navigation is unavailable.", {
						type: "error",
					});
			},
			toast: (text, type) => UI.showToast(text, { type }),
			confirm: ({ title, body, confirmText, onConfirm }) =>
				showConfirmationModal(title, body, {
					confirmText,
					cancelText: "Cancel",
					danger: true,
					onConfirm,
				}),
			openThreadMenu,
			openDiscovery: () => this.openNativeDiscovery(),
		});
		// Open and close right away, without waiting for the page to settle.
		this.unsubscribe = subscribe(this.sync);
		// Lists are open per ChungusTabs tab, and switching tabs selects a channel.
		FluxDispatcher?.subscribe?.("CHANNEL_SELECT", notifyChange);
		// Not named observer: BetterVencord calls a plugin's observer() on every DOM change.
		this.mutationObserver = new MutationObserver(this.scheduleSync);
		this.mutationObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
		window.addEventListener("popstate", this.scheduleSync);
		DOM.addStyle(css);
		this.scheduleSync();
	}

	stop() {
		this.mutationObserver?.disconnect();
		this.unsubscribe?.();
		FluxDispatcher?.unsubscribe?.("CHANNEL_SELECT", notifyChange);
		clearTimeout(this.timer);
		window.removeEventListener("popstate", this.scheduleSync);
		this.unmount();
		closeAllBrowsers();
		DOM.removeStyle();
	}

	scheduleSync() {
		if (this.timer) return;
		this.timer = setTimeout(() => {
			this.timer = null;
			this.sync();
		}, 150);
	}

	// The channel shown in the main chat, if it can have a list. A thread open
	// in full view can't, so it shows normally.
	currentChannel() {
		const match = location.pathname.match(/^\/channels\/\d+\/(\d+)/);
		return match
			? data.browsableChannel(ChannelStore?.getChannel?.(match[1]))
			: null;
	}

	// The main chat (thread sidebars are a section, not a main) and its header
	// toolbar with the Threads button.
	findLayout() {
		const chat = document.querySelector('main[class*="chatContent"]');
		if (!chat) return null;
		const toolbar = chat.parentElement?.parentElement?.querySelector(
			':scope > [class*="subtitleContainer"] section [class*="toolbar"]',
		);
		return { chat, toolbar };
	}

	sync() {
		const channel = this.currentChannel();
		const layout = channel && this.findLayout();
		if (!channel || !layout) {
			this.unmount();
			return;
		}
		if (layout.chat !== this.chat || !this.host?.isConnected) {
			this.unmount();
			this.mount(layout.chat);
		}
		this.mountNativeButton(layout.toolbar);
		this.channel = channel;
		const open = isBrowserOpen(channel.parentId);
		this.chat.toggleAttribute("data-tn-covered", open);
		this.nativeButton?.setAttribute("aria-pressed", String(open));

		// Only re-render when the list's channel changes; the list keeps
		// itself up to date from Discord's stores.
		const key = open ? JSON.stringify(channel) : "";
		if (key === this.renderedKey) return;
		this.renderedKey = key;
		const { ThreadBrowser } = this.ui;
		this.root.render(
			open ? (
				<Boundary
					key={channel.parentId}
					name="Thread list"
					fallback={() => (
						<div className="tn-browser">
							<div className="tn-empty">
								ThreadNavigator's thread list crashed.
							</div>
						</div>
					)}
				>
					<ThreadBrowser channel={channel} />
				</Boundary>
			) : null,
		);
	}

	// The list goes last inside Discord's chat element and covers it, so the
	// chat stays laid out underneath and keeps its scroll position.
	mount(chat) {
		this.chat = chat;
		this.host = document.createElement("div");
		this.host.className = "tn-host";
		chat.append(this.host);
		this.root = createRoot(this.host);
		this.renderedKey = null;
	}

	unmount() {
		this.restoreNativeButton();
		this.chat?.removeAttribute("data-tn-covered");
		const root = this.root;
		// React warns when a root is unmounted while it is rendering.
		if (root) queueMicrotask(() => root.unmount());
		this.host?.remove();
		this.chat = this.host = this.root = this.channel = null;
		this.renderedKey = null;
	}

	mountNativeButton(toolbar) {
		const button = toolbar?.querySelector(
			'[role="button"][aria-label="Threads"]',
		);
		if (button === this.nativeButton) return;
		this.restoreNativeButton();
		this.nativeButton = button ?? null;
		if (!button) return;
		this.nativeButtonTitle = button.title;
		button.title = "Toggle thread list";
		button.addEventListener("click", this.onNativeThreadsClick, true);
		button.addEventListener("keydown", this.onNativeThreadsKeyDown, true);
	}

	restoreNativeButton() {
		const button = this.nativeButton;
		if (!button) return;
		button.removeEventListener("click", this.onNativeThreadsClick, true);
		button.removeEventListener("keydown", this.onNativeThreadsKeyDown, true);
		button.title = this.nativeButtonTitle;
		button.removeAttribute("aria-pressed");
		this.nativeButton = null;
	}

	toggle() {
		if (this.channel)
			setBrowserOpen(
				this.channel.parentId,
				!isBrowserOpen(this.channel.parentId),
			);
	}

	onNativeThreadsKeyDown(event) {
		if (!["Enter", " "].includes(event.key)) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		this.toggle();
	}

	onNativeThreadsClick(event) {
		if (this.allowNativeOnce) {
			this.allowNativeOnce = false;
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		this.toggle();
	}

	openNativeDiscovery() {
		if (!this.nativeButton?.isConnected) return;
		this.allowNativeOnce = true;
		this.nativeButton.click();
		this.allowNativeOnce = false;
	}
};
