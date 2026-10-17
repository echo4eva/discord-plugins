/**
 * @name ThreadNavigator
 * @author echo4eva
 * @description A searchable thread list for any channel, with threads opening on the side.
 * @version 0.4.5
 * @source https://github.com/echo4eva/discord-plugins/blob/master/src/ThreadNavigator/index.jsx
 */
/*@cc_on
@if (@_jscript)

	// Offer to self-install for clueless users that try to run this directly.
	var shell = WScript.CreateObject("WScript.Shell");
	var fs = new ActiveXObject("Scripting.FileSystemObject");
	var pathPlugins = shell.ExpandEnvironmentStrings("%APPDATA%\BetterDiscord\plugins");
	var pathSelf = WScript.ScriptFullName;
	// Put the user at ease by addressing them in the first person
	shell.Popup("It looks like you've mistakenly tried to run me directly. \n(Don't do that!)", 0, "I'm a plugin for BetterDiscord", 0x30);
	if (fs.GetParentFolderName(pathSelf) === fs.GetAbsolutePathName(pathPlugins)) {
		shell.Popup("I'm in the correct folder already.", 0, "I'm already installed", 0x40);
	} else if (!fs.FolderExists(pathPlugins)) {
		shell.Popup("I can't find the BetterDiscord plugins folder.\nAre you sure it's even installed?", 0, "Can't install myself", 0x10);
	} else if (shell.Popup("Should I copy myself to BetterDiscord's plugins folder for you?", 0, "Do you need some help?", 0x34) === 6) {
		fs.CopyFile(pathSelf, fs.BuildPath(pathPlugins, fs.GetFileName(pathSelf)), true);
		// Show the user where to put plugins in the future
		shell.Exec("explorer " + pathPlugins);
		shell.Popup("I'm installed!", 0, "Successfully installed", 0x40);
	}
	WScript.Quit();

@else@*/
const CHANGES = {
	"0.4.5": {
		added: ["Ctrl-click a thread name to open it in a new tab on Windows"],
	},
	"0.4.4": {
		added: [
			"ChannelTabsMac per-tab scroll memory, drag markers for tabs and bookmarks, copy tab link, and closable tab folders",
			"ThreadNavigator bulk thread actions, Discord's thread right-click menu, and a per-tab browser",
			"CategoryAlerts alerts for new messages, with separate sounds and volume",
			"CategoryAlerts plugin for new channels in watched categories",
			"Organize ChannelTabsMac tabs in folders",
			"Navigate tabs by number and open servers in tabs",
			"Close Discord window from last tab shortcut",
		],
	},
	"0.2.3": {
		fixed: ["Make middle thread browser scrollable"],
	},
	"0.2.2": {
		fixed: ["Keep thread browser open across tab switches"],
		added: [
			"Open ChannelTabsMac bookmarks with tab shortcut",
			"Configurable close-tab shortcut for ChannelTabsMac",
		],
	},
	"0.2.1": {
		improved: ["Fill thread browser and match Discord scrolling"],
	},
	"0.2.0": {
		improved: ["Keep thread browser beside side chat"],
	},
	"0.1.0": {
		added: ["thread sidebar and full browser for Discord"],
	},
};
// src/ThreadNavigator/index.jsx
var api = new BdApi("ThreadNavigator");
var { Webpack, DOM, UI, React } = api;
var ChannelStore = Webpack.getStore("ChannelStore");
var GuildStore = Webpack.getStore("GuildStore");
var ActiveThreadsStore = Webpack.getStore("ActiveJoinedThreadsStore");
var ReadStateStore = Webpack.getStore("ReadStateStore");
var JoinedThreadsStore = Webpack.getStore("JoinedThreadsStore");
var PermissionStore = Webpack.getStore("PermissionStore");
var UserStore = Webpack.getStore("UserStore");
var FluxDispatcher = Webpack.getByKeys("subscribe", "dispatch", "unsubscribe");
var transitionTo = Webpack.getByStrings("transitionTo - Transitioning to ", {
	searchExports: true,
});
var threadContextMenu = null;
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
var ThreadMenuBoundary = class extends React.Component {
	constructor(props) {
		super(props);
		this.state = { failed: false };
	}
	static getDerivedStateFromError() {
		return { failed: true };
	}
	componentDidCatch(error) {
		console.warn("[ThreadNavigator] Thread menu failed to render", error);
	}
	render() {
		return this.state.failed ? this.props.fallback() : this.props.children;
	}
};
var css = `
.tn-full-active > main[class*="chatContent"] { display: none !important; }
.tn-browser { display: none; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; color: var(--text-default); background: var(--background-base-low); }
.tn-full-active > .tn-browser { display: flex; }
.tn-browser-bar { display: flex; align-items: center; gap: 10px; padding: 16px 16px 8px; flex-shrink: 0; }
.tn-browser-title { min-width: 0; flex: 1; font-size: 20px; font-weight: 700; }
.tn-browser-close, .tn-tab-action { border: 0; border-radius: 6px; color: var(--text-muted); background: transparent; cursor: pointer; font: inherit; }
.tn-browser-close { width: 30px; height: 30px; font-size: 22px; line-height: 1; }
.tn-browser-close:hover, .tn-tab-action:hover { color: var(--text-default); background: var(--background-modifier-hover); }
.tn-browser-controls { display: flex; gap: 8px; padding: 4px 16px 12px; flex-shrink: 0; }
.tn-search { min-width: 0; flex: 1; box-sizing: border-box; border: 0; outline: 0; border-radius: 6px; padding: 8px 10px; color: var(--text-default); background: var(--background-base-lower); font: inherit; font-size: 13px; }
.tn-filter, .tn-discover { border: 0; border-radius: 6px; padding: 6px 10px; background: var(--background-base-lower); color: var(--text-default); font: inherit; cursor: pointer; }
.tn-browser > .tn-browser-list { display: flex; flex: 1 1 0; flex-direction: column; gap: 5px; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 4px 8px 24px 16px; scrollbar-width: thin; scrollbar-color: var(--scrollbar-auto-thumb, var(--background-modifier-hover)) var(--scrollbar-auto-track, transparent); }
.tn-browser-list::-webkit-scrollbar { width: 8px; }
.tn-browser-list::-webkit-scrollbar-thumb { border-radius: 4px; background: var(--scrollbar-auto-thumb, var(--background-modifier-hover)); }
.tn-browser-list::-webkit-scrollbar-track { background: var(--scrollbar-auto-track, transparent); }
.tn-item { display: flex; flex-shrink: 0; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--border-subtle); border-radius: 7px; background: var(--background-base-lower); color: var(--text-default); }
.tn-item:hover { background: var(--background-modifier-hover); }
.tn-item-selected { border-color: var(--brand-500); background: var(--background-modifier-selected); }
.tn-item-link { display: block; min-width: 0; flex: 1; color: inherit; text-decoration: none; }
.tn-item-main { display: block; min-width: 0; }
.tn-item-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
.tn-item-meta { display: block; margin-top: 4px; color: var(--text-muted); font-size: 11px; }
.tn-item-mentioned { border-left: 3px solid hsl(359, calc(var(--saturation-factor, 1) * 82.6%), 59.4%); }
.tn-item-unread:not(.tn-item-mentioned) { border-left: 3px solid hsl(235, calc(var(--saturation-factor, 1) * 86%), 65%); }
.tn-item-unread .tn-item-name { font-weight: 700; }
.tn-badges { display: flex; flex-shrink: 0; align-items: center; gap: 4px; }
.tn-badge { box-sizing: border-box; min-width: 8px; height: 16px; padding: 0 5px; border-radius: 8px; color: #fff; font-size: 12px; font-weight: 600; line-height: 16px; text-align: center; }
.tn-badge-mention { background-color: hsl(359, calc(var(--saturation-factor, 1) * 82.6%), 59.4%); }
.tn-badge-unread { background-color: hsl(235, calc(var(--saturation-factor, 1) * 86%), 65%); }
.tn-tab-action { flex-shrink: 0; width: 28px; height: 28px; font-size: 17px; line-height: 1; }
.tn-empty, .tn-load { padding: 18px 12px; color: var(--text-muted); text-align: center; font-size: 13px; }
.tn-select-toggle[aria-pressed="true"] { color: var(--white-500, #fff); background: var(--brand-500); }
.tn-check { flex-shrink: 0; width: 16px; height: 16px; margin: 0; accent-color: var(--brand-500); cursor: pointer; }
.tn-selecting .tn-item-link { cursor: pointer; user-select: none; }
.tn-item-checked { border-color: var(--brand-500); background: var(--background-modifier-selected); }
.tn-bulk { display: none; flex-shrink: 0; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 16px; border-top: 1px solid var(--border-subtle); background: var(--background-base-lower); }
.tn-selecting > .tn-bulk { display: flex; }
.tn-bulk-count { margin-right: auto; color: var(--text-muted); font-size: 13px; }
.tn-bulk button { border: 0; border-radius: 6px; padding: 6px 10px; color: var(--text-default); background: var(--background-modifier-hover); font: inherit; font-size: 13px; cursor: pointer; }
.tn-bulk button:hover:not(:disabled) { background: var(--background-modifier-selected); }
.tn-bulk button:disabled { opacity: 0.45; cursor: default; }
.tn-bulk .tn-danger { color: var(--text-feedback-critical, var(--status-danger)); }
`;
var MANAGE_THREADS = 1n << 34n;
var BULK_DELAY = 300;
var BULK_ACTIONS = [
	{
		id: "join",
		label: "Join",
		verb: "Joining",
		past: "Joined",
		applies: (thread) => !thread.joined && !thread.archived,
		request: (thread) => ["put", `/channels/${thread.id}/thread-members/@me`],
	},
	{
		id: "leave",
		label: "Leave",
		verb: "Leaving",
		past: "Left",
		applies: (thread) => thread.joined,
		request: (thread) => ["del", `/channels/${thread.id}/thread-members/@me`],
	},
	{
		id: "read",
		label: "Mark read",
		past: "Marked read",
		applies: (thread) => thread.unread,
	},
	{
		id: "close",
		label: "Close",
		verb: "Closing",
		past: "Closed",
		confirm: true,
		applies: (thread, can) => !thread.archived && can.moderate,
		request: (thread) => [
			"patch",
			`/channels/${thread.id}`,
			{ archived: true },
		],
	},
	{
		id: "lock",
		label: "Close & lock",
		verb: "Locking",
		past: "Closed and locked",
		confirm: true,
		applies: (thread, can) =>
			(!thread.archived || !thread.locked) && can.manage,
		request: (thread) => [
			"patch",
			`/channels/${thread.id}`,
			{ archived: true, locked: true },
		],
	},
	{
		id: "reopen",
		label: "Reopen",
		verb: "Reopening",
		past: "Reopened",
		applies: (thread, can) =>
			thread.archived && (can.manage || (can.moderate && !thread.locked)),
		request: (thread) => [
			"patch",
			`/channels/${thread.id}`,
			thread.locked ? { archived: false, locked: false } : { archived: false },
		],
	},
];
function findRestClient() {
	return Webpack.getModule(
		(m) =>
			["get", "post", "put", "patch", "del"].every(
				(key) => typeof m?.[key] === "function",
			),
		{ searchExports: true },
	);
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function node(tag, className, text) {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text !== void 0) element.textContent = text;
	return element;
}
function storeThreads(store, method, ...args) {
	try {
		return store?.[method]?.(...args) ?? [];
	} catch {
		return [];
	}
}
function attentionRank(thread) {
	if (thread.mentions > 0) return 0;
	return thread.unread ? 1 : 2;
}
var DISCORD_EPOCH = 1420070400000n;
function snowflakeTime(id) {
	try {
		return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
	} catch {
		return 0;
	}
}
module.exports = class ThreadNavigator {
	constructor(meta) {
		this.meta = meta;
		this.sync = this.sync.bind(this);
		this.scheduleSync = this.scheduleSync.bind(this);
		this.onNativeThreadsClick = this.onNativeThreadsClick.bind(this);
		this.onNativeThreadsKeyDown = this.onNativeThreadsKeyDown.bind(this);
	}
	start() {
		this.openChannels = /* @__PURE__ */ new Set();
		this.browserQuery = "";
		this.browserFilter = "active";
		this.browserMembership = "any";
		this.browserLimit = 40;
		this.selecting = false;
		this.readAt = /* @__PURE__ */ new Map();
		this.wasUnread = /* @__PURE__ */ new Map();
		this.selected = /* @__PURE__ */ new Set();
		this.anchorId = null;
		this.bulkRun = null;
		this.observer = new MutationObserver(this.scheduleSync);
		this.observer.observe(document.body, { childList: true, subtree: true });
		for (const store of this.stores())
			store?.addChangeListener?.(this.scheduleSync);
		window.addEventListener("popstate", this.scheduleSync);
		DOM.addStyle(css);
		this.scheduleSync();
	}
	stop() {
		this.observer?.disconnect();
		clearTimeout(this.timer);
		if (this.bulkRun) this.bulkRun.cancelled = true;
		for (const store of this.stores())
			store?.removeChangeListener?.(this.scheduleSync);
		window.removeEventListener("popstate", this.scheduleSync);
		this.unmount();
		DOM.removeStyle();
	}
	// The browser is open per channel, so a tab on another channel shows its
	// normal chat and returning to this channel brings the browser back.
	get full() {
		return Boolean(
			this.channel && this.openChannels.has(this.browserKey(this.channel)),
		);
	}
	// Open state belongs to a tab and a channel, so a new tab on a thread from
	// this channel starts with normal chat. Without ChannelTabsMac it is just
	// per channel.
	browserKey(channel) {
		const tabId = globalThis.__ChannelTabsMacTabAPI?.getActiveTabId?.() ?? "";
		return `${tabId}:${channel.parentId}`;
	}
	stores() {
		return [
			ChannelStore,
			ActiveThreadsStore,
			ReadStateStore,
			JoinedThreadsStore,
		];
	}
	scheduleSync() {
		if (this.timer) return;
		this.timer = setTimeout(() => {
			this.timer = null;
			this.sync();
		}, 150);
	}
	currentChannel() {
		const match = location.pathname.match(
			/^\/channels\/(\d+)\/(\d+)(?:\/threads\/(\d+))?/,
		);
		if (!match) return null;
		const [, guildId, selectedId, sideThreadId] = match;
		const selected = ChannelStore?.getChannel?.(selectedId);
		if (!selected) return null;
		const isThread = [10, 11, 12].includes(selected.type);
		const parentId = isThread ? selected.parent_id : selectedId;
		const parent = ChannelStore.getChannel(parentId);
		if (!parent || ![0, 5].includes(parent.type)) return null;
		return {
			guildId,
			parentId,
			selectedThreadId: sideThreadId || (isThread ? selectedId : null),
			name: parent.name || "Channel",
		};
	}
	findLayout() {
		for (const chat of document.querySelectorAll(
			'main[class*="chatContent"]',
		)) {
			const content = chat.parentElement;
			const toolbar = content.parentElement?.querySelector(
				':scope > [class*="subtitleContainer"] section [class*="toolbar"]',
			);
			if (!toolbar) continue;
			return { content, chat, toolbar };
		}
		return null;
	}
	sync() {
		const channel = this.currentChannel();
		const layout = channel && this.findLayout();
		if (!channel || !layout) {
			this.unmount();
			return;
		}
		if (this.content !== layout.content || !this.browser?.isConnected) {
			this.unmount();
			this.mount(layout);
		}
		this.mountNativeButton(layout.toolbar);
		if (this.channel?.parentId !== channel.parentId) {
			this.browserLimit = 40;
			if (!this.bulkRun) this.selecting = false;
			this.selected.clear();
			this.anchorId = null;
		}
		this.channel = channel;
		this.applyMode();
		const threads = this.getThreads(channel);
		const signature = JSON.stringify([
			channel.parentId,
			channel.selectedThreadId,
			threads.map((thread) => [
				thread.id,
				thread.name,
				thread.archived,
				thread.unread,
				thread.unreadCount,
				thread.unreadEstimated,
				thread.mentions,
				thread.lastMessageId,
				thread.readAt,
				thread.joined,
				thread.locked,
			]),
		]);
		if (signature !== this.signature) {
			this.signature = signature;
			this.threads = threads;
			const ids = new Set(threads.map((thread) => thread.id));
			for (const id of this.selected)
				if (!ids.has(id)) this.selected.delete(id);
			this.renderBrowser();
		}
	}
	getThreads({ guildId, parentId }) {
		const byId = /* @__PURE__ */ new Map();
		const joinedIds = /* @__PURE__ */ new Set();
		for (const thread of storeThreads(
			ChannelStore,
			"getAllThreadsForParent",
			parentId,
		))
			if (thread?.id) byId.set(thread.id, thread);
		for (const method of [
			"getActiveJoinedThreadsForParent",
			"getActiveUnjoinedThreadsForParent",
		]) {
			const entries = storeThreads(
				ActiveThreadsStore,
				method,
				guildId,
				parentId,
			);
			for (const value of Object.values(entries)) {
				const thread = value?.channel ?? value;
				if (!thread?.id) continue;
				byId.set(thread.id, thread);
				if (method === "getActiveJoinedThreadsForParent")
					joinedIds.add(thread.id);
			}
		}
		return [...byId.values()]
			.map((thread) => ({
				id: thread.id,
				record: thread,
				name: thread.name || "Untitled thread",
				archived: Boolean(
					thread.threadMetadata?.archived ?? thread.thread_metadata?.archived,
				),
				locked: Boolean(
					thread.threadMetadata?.locked ?? thread.thread_metadata?.locked,
				),
				joined:
					typeof JoinedThreadsStore?.hasJoined === "function"
						? Boolean(JoinedThreadsStore.hasJoined(thread.id))
						: joinedIds.has(thread.id),
				ownerId: thread.ownerId ?? thread.owner_id,
				unread: Boolean(ReadStateStore?.hasUnread?.(thread.id)),
				unreadCount: ReadStateStore?.getUnreadCount?.(thread.id) ?? 0,
				unreadEstimated: Boolean(ReadStateStore?.isEstimated?.(thread.id)),
				mentions: ReadStateStore?.getMentionCount?.(thread.id) ?? 0,
				lastMessageId:
					thread.lastMessageId || thread.last_message_id || thread.id,
			}))
			.map((thread) => {
				const needsAttention = thread.unread || thread.mentions > 0;
				if (this.wasUnread.get(thread.id) && !needsAttention)
					this.readAt.set(thread.id, Date.now());
				this.wasUnread.set(thread.id, needsAttention);
				const readAt = needsAttention ? 0 : (this.readAt.get(thread.id) ?? 0);
				return {
					...thread,
					readAt,
					activity: Math.max(snowflakeTime(thread.lastMessageId), readAt),
				};
			})
			.sort(
				(a, b) =>
					attentionRank(a) - attentionRank(b) || b.activity - a.activity,
			);
	}
	mount({ content, chat }) {
		this.content = content;
		this.chat = chat;
		this.signature = null;
		this.browser = node("div", "tn-browser");
		this.browser.addEventListener("keydown", (event) =>
			this.onBrowserKeyDown(event),
		);
		const bar = node("div", "tn-browser-bar");
		this.browserTitle = node("div", "tn-browser-title", "Threads");
		const close = node("button", "tn-browser-close", "\xD7");
		close.type = "button";
		close.title = "Return to channel chat";
		close.setAttribute("aria-label", "Return to channel chat");
		close.addEventListener("click", () => this.setFull(false));
		bar.append(this.browserTitle, close);
		const controls = node("div", "tn-browser-controls");
		const search = node("input", "tn-search");
		search.type = "search";
		search.placeholder = "Search threads";
		search.setAttribute("aria-label", "Search threads in browser");
		search.value = this.browserQuery;
		search.addEventListener("input", () => {
			this.browserQuery = search.value;
			this.browserLimit = 40;
			this.renderBrowser();
		});
		const filter = node("select", "tn-filter");
		filter.setAttribute("aria-label", "Filter threads");
		for (const [value, label] of [
			["active", "Active"],
			["archived", "Archived (loaded)"],
			["all", "All loaded"],
		]) {
			const option = node("option", "", label);
			option.value = value;
			filter.append(option);
		}
		filter.value = this.browserFilter;
		filter.addEventListener("change", () => {
			this.browserFilter = filter.value;
			this.browserLimit = 40;
			this.renderBrowser();
		});
		const membership = node("select", "tn-filter");
		membership.setAttribute("aria-label", "Filter threads by membership");
		for (const [value, label] of [
			["any", "Joined or not"],
			["joined", "Joined"],
			["unjoined", "Not joined"],
		]) {
			const option = node("option", "", label);
			option.value = value;
			membership.append(option);
		}
		membership.value = this.browserMembership;
		membership.addEventListener("change", () => {
			this.browserMembership = membership.value;
			this.browserLimit = 40;
			this.renderBrowser();
		});
		this.selectToggle = node(
			"button",
			"tn-discover tn-select-toggle",
			"Select",
		);
		this.selectToggle.type = "button";
		this.selectToggle.title =
			"Select threads for bulk actions (Shift-click a thread)";
		this.selectToggle.addEventListener("click", () =>
			this.setSelecting(!this.selecting),
		);
		const discover = node("button", "tn-discover", "Discord discovery");
		discover.type = "button";
		discover.title = "Open Discord's thread discovery";
		discover.addEventListener("click", () => this.openNativeDiscovery());
		controls.append(search, filter, membership, this.selectToggle, discover);
		this.browserList = node("div", "tn-browser-list");
		this.browserList.addEventListener("scroll", () => {
			if (this.browserLimit >= (this.browserTotal ?? 0)) return;
			if (
				this.browserList.scrollTop + this.browserList.clientHeight >=
				this.browserList.scrollHeight - 240
			) {
				this.browserLimit += 40;
				this.renderBrowser();
			}
		});
		this.bulkBar = node("div", "tn-bulk");
		this.browser.append(bar, controls, this.browserList, this.bulkBar);
		content.insertBefore(this.browser, chat);
	}
	mountNativeButton(toolbar) {
		const button = toolbar?.querySelector(
			'[role="button"][aria-label="Threads"]',
		);
		if (button === this.nativeButton) return;
		this.nativeButton?.removeEventListener(
			"click",
			this.onNativeThreadsClick,
			true,
		);
		this.nativeButton?.removeEventListener(
			"keydown",
			this.onNativeThreadsKeyDown,
			true,
		);
		if (this.nativeButton) this.nativeButton.title = this.nativeButtonTitle;
		this.nativeButton = button ?? null;
		if (!button) return;
		this.nativeButtonTitle = button.title;
		button.title = "Toggle thread browser";
		button.addEventListener("click", this.onNativeThreadsClick, true);
		button.addEventListener("keydown", this.onNativeThreadsKeyDown, true);
		button.setAttribute("aria-pressed", String(this.full));
	}
	onNativeThreadsKeyDown(event) {
		if (!["Enter", " "].includes(event.key)) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		this.setFull(!this.full);
	}
	onNativeThreadsClick(event) {
		if (this.allowNativeOnce) {
			this.allowNativeOnce = false;
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		this.setFull(!this.full);
	}
	openNativeDiscovery() {
		if (!this.nativeButton?.isConnected) return;
		this.allowNativeOnce = true;
		this.nativeButton.click();
		this.allowNativeOnce = false;
	}
	unmount() {
		this.nativeButton?.removeEventListener(
			"click",
			this.onNativeThreadsClick,
			true,
		);
		this.nativeButton?.removeEventListener(
			"keydown",
			this.onNativeThreadsKeyDown,
			true,
		);
		if (this.nativeButton) {
			this.nativeButton.title = this.nativeButtonTitle;
			this.nativeButton.removeAttribute("aria-pressed");
		}
		this.nativeButton = null;
		this.content?.classList.remove("tn-full-active");
		this.browser?.remove();
		this.content = this.browser = this.bulkBar = this.selectToggle = null;
		this.signature = null;
	}
	applyMode() {
		this.content?.classList.toggle("tn-full-active", this.full);
		this.nativeButton?.setAttribute("aria-pressed", String(this.full));
	}
	setFull(full) {
		if (!this.channel || full === this.full) return;
		if (full) this.openChannels.add(this.browserKey(this.channel));
		else this.openChannels.delete(this.browserKey(this.channel));
		if (!full && !this.bulkRun) this.setSelecting(false);
		this.applyMode();
		this.renderBrowser();
	}
	makeThreadItem(thread) {
		const selected = thread.id === this.channel.selectedThreadId;
		const checked = this.selecting && this.selected.has(thread.id);
		const item = node(
			"div",
			"tn-item" +
				(thread.unread || thread.mentions ? " tn-item-unread" : "") +
				(thread.mentions ? " tn-item-mentioned" : "") +
				(selected ? " tn-item-selected" : "") +
				(checked ? " tn-item-checked" : ""),
		);
		if (this.selecting) {
			const check = node("input", "tn-check");
			check.type = "checkbox";
			check.checked = checked;
			check.setAttribute("aria-label", `Select ${thread.name}`);
			check.addEventListener("click", (event) => {
				event.stopPropagation();
				this.selectThread(thread, event.shiftKey);
			});
			item.append(check);
		}
		item.addEventListener("contextmenu", (event) =>
			this.openThreadMenu(event, thread),
		);
		const link = node("a", "tn-item-link");
		link.href = `/channels/${this.channel.guildId}/${this.channel.parentId}/threads/${thread.id}`;
		link.title = thread.name;
		link.addEventListener("click", (event) => {
			if (event.button !== 0) return;
			event.preventDefault();
			if (this.selecting || event.shiftKey) {
				if (!this.selecting) this.setSelecting(true);
				this.selectThread(thread, event.shiftKey);
				return;
			}
			this.openThread(
				thread,
				process.platform === "darwin" ? event.metaKey : event.ctrlKey,
			);
		});
		const main = node("span", "tn-item-main");
		main.append(node("span", "tn-item-name", thread.name));
		const details = [
			thread.archived ? "Archived" : "Active",
			thread.locked ? "Locked" : "",
			thread.joined ? "Joined" : "",
			selected ? "Open on right" : "",
		]
			.filter(Boolean)
			.join(" \xB7 ");
		main.append(node("span", "tn-item-meta", details));
		link.append(main);
		item.append(link);
		const badges = node("span", "tn-badges");
		if (thread.mentions) {
			const badge = node("span", "tn-badge tn-badge-mention", thread.mentions);
			badge.title = `${thread.mentions} mention${thread.mentions === 1 ? "" : "s"}`;
			badges.append(badge);
		}
		if (thread.unread) {
			const estimate = thread.unreadEstimated ? "+" : "";
			const badge = node(
				"span",
				"tn-badge tn-badge-unread",
				thread.unreadCount ? thread.unreadCount + estimate : "New",
			);
			badge.title = thread.unreadCount
				? `${thread.unreadCount}${estimate} unread message${thread.unreadCount === 1 ? "" : "s"}`
				: "Unread messages";
			badges.append(badge);
		}
		if (badges.childElementCount) item.append(badges);
		const tab = node("button", "tn-tab-action", "\u2197");
		tab.type = "button";
		tab.title = "Open in ChannelTabsMac tab";
		tab.setAttribute("aria-label", `Open ${thread.name} in a new tab`);
		tab.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.openThread(thread, true);
		});
		item.append(tab);
		return item;
	}
	visibleThreads() {
		const query = this.browserQuery.trim().toLocaleLowerCase();
		return (this.threads ?? []).filter(
			(thread) =>
				(this.browserFilter === "all" ||
					(this.browserFilter === "archived") === thread.archived) &&
				(this.browserMembership === "any" ||
					(this.browserMembership === "joined") === thread.joined) &&
				thread.name.toLocaleLowerCase().includes(query),
		);
	}
	renderBrowser() {
		if (!this.browserList || !this.channel) return;
		this.renderBulkBar();
		if (!this.full) {
			if (this.browserList.childElementCount)
				this.browserList.replaceChildren();
			return;
		}
		this.browserTitle.textContent = `Threads in #${this.channel.name}`;
		const scrollTop = this.browserList.scrollTop;
		this.browserList.replaceChildren();
		const threads = this.visibleThreads();
		this.browserTotal = threads.length;
		if (threads.length) {
			this.browserList.append(
				...threads
					.slice(0, this.browserLimit)
					.map((thread) => this.makeThreadItem(thread)),
			);
			if (threads.length > this.browserLimit)
				this.browserList.append(
					node(
						"div",
						"tn-load",
						`Showing ${this.browserLimit} of ${threads.length}. Scroll for more.`,
					),
				);
			this.browserList.scrollTop = scrollTop;
			return;
		}
		this.browserList.append(
			node("div", "tn-empty", "No matching threads loaded for this channel."),
		);
	}
	onBrowserKeyDown(event) {
		if (!this.selecting) return;
		const typing = event.target.matches?.("input:not([type=checkbox]), select");
		if (event.key === "Escape" && !typing) {
			event.preventDefault();
			this.setSelecting(false);
		} else if (
			event.key.toLowerCase() === "a" &&
			(event.metaKey || event.ctrlKey) &&
			!typing
		) {
			event.preventDefault();
			this.toggleAllVisible(true);
		}
	}
	setSelecting(selecting) {
		if (selecting === this.selecting) return;
		this.selecting = selecting;
		if (!selecting) {
			this.selected.clear();
			this.anchorId = null;
		}
		this.selectToggle?.setAttribute("aria-pressed", String(selecting));
		this.renderBrowser();
	}
	selectThread(thread, range) {
		const visible = this.visibleThreads();
		const from = range
			? visible.findIndex((item) => item.id === this.anchorId)
			: -1;
		const to = visible.findIndex((item) => item.id === thread.id);
		if (from !== -1 && to !== -1) {
			const [start, end] = from < to ? [from, to] : [to, from];
			for (const item of visible.slice(start, end + 1))
				this.selected.add(item.id);
		} else if (this.selected.has(thread.id)) this.selected.delete(thread.id);
		else this.selected.add(thread.id);
		this.anchorId = thread.id;
		this.renderBrowser();
	}
	toggleAllVisible(select) {
		const visible = this.visibleThreads();
		select ??= !visible.every((thread) => this.selected.has(thread.id));
		for (const thread of visible)
			if (select) this.selected.add(thread.id);
			else this.selected.delete(thread.id);
		this.renderBrowser();
	}
	selectedThreads() {
		return (this.threads ?? []).filter((thread) =>
			this.selected.has(thread.id),
		);
	}
	permissions(thread) {
		let manage = true;
		try {
			if (typeof PermissionStore?.can === "function")
				manage = Boolean(PermissionStore.can(MANAGE_THREADS, thread.record));
		} catch {}
		const owner =
			thread.ownerId && thread.ownerId === UserStore?.getCurrentUser?.()?.id;
		return { manage, moderate: manage || owner };
	}
	actionTargets(action, threads = this.selectedThreads()) {
		return threads.filter((thread) =>
			action.applies(thread, this.permissions(thread)),
		);
	}
	renderBulkBar() {
		if (!this.bulkBar) return;
		this.browser.classList.toggle("tn-selecting", this.selecting);
		this.selectToggle?.setAttribute("aria-pressed", String(this.selecting));
		if (!this.selecting) {
			this.bulkBar.replaceChildren();
			return;
		}
		const visible = this.visibleThreads();
		const selected = this.selectedThreads();
		const shown = visible.filter((thread) =>
			this.selected.has(thread.id),
		).length;
		const all = node("input", "tn-check");
		all.type = "checkbox";
		all.checked = visible.length > 0 && shown === visible.length;
		all.indeterminate = shown > 0 && !all.checked;
		all.title = all.checked
			? "Deselect shown threads"
			: `Select all ${visible.length} shown threads`;
		all.setAttribute("aria-label", all.title);
		all.disabled = Boolean(this.bulkRun) || !visible.length;
		all.addEventListener("click", () => this.toggleAllVisible());
		const run = this.bulkRun;
		const hidden = selected.length - shown;
		const count = node(
			"span",
			"tn-bulk-count",
			run
				? `${run.verb} ${run.done} of ${run.total}\u2026`
				: `${selected.length} selected` +
						(hidden ? ` \xB7 ${hidden} hidden by filters` : ""),
		);
		const buttons = [];
		const button = (
			text,
			onClick,
			{ disabled = false, danger = false } = {},
		) => {
			const element = node("button", danger ? "tn-danger" : "", text);
			element.type = "button";
			element.disabled = disabled;
			element.addEventListener("click", onClick);
			buttons.push(element);
			return element;
		};
		if (run) button("Stop", () => (run.cancelled = true));
		else {
			for (const action of BULK_ACTIONS) {
				const targets = this.actionTargets(action, selected);
				const element = button(
					targets.length ? `${action.label} (${targets.length})` : action.label,
					() => this.runBulk(action),
					{ disabled: !targets.length, danger: action.confirm },
				);
				if (!targets.length && selected.length)
					element.title = `None of the selected threads can be ${action.past.toLowerCase()}`;
			}
			button(
				"Clear",
				() => {
					this.selected.clear();
					this.renderBrowser();
				},
				{ disabled: !selected.length },
			);
		}
		button("Done", () => this.setSelecting(false), { disabled: Boolean(run) });
		this.bulkBar.replaceChildren(all, count, ...buttons);
	}
	runBulk(action) {
		if (this.bulkRun) return;
		const targets = this.actionTargets(action);
		if (!targets.length) return;
		if (!action.confirm) {
			this.executeBulk(action, targets);
			return;
		}
		const names = targets.slice(0, 5).map((thread) => `\u2022 ${thread.name}`);
		if (targets.length > 5) names.push(`\u2026and ${targets.length - 5} more`);
		UI.showConfirmationModal(
			`${action.label} ${targets.length} thread${targets.length === 1 ? "" : "s"}?`,
			React.createElement(
				"div",
				null,
				names.map((name, index) =>
					React.createElement("div", { key: index }, name),
				),
			),
			{
				confirmText: action.label,
				cancelText: "Cancel",
				danger: true,
				onConfirm: () => this.executeBulk(action, targets),
			},
		);
	}
	async executeBulk(action, targets) {
		const plural = (n) => `${n} thread${n === 1 ? "" : "s"}`;
		if (action.id === "read") {
			if (typeof FluxDispatcher?.dispatch !== "function") {
				UI.showToast("Discord's read-state actions are unavailable.", {
					type: "error",
				});
				return;
			}
			for (let i = 0; i < targets.length; i += 100)
				FluxDispatcher.dispatch({
					type: "BULK_ACK",
					context: "APP",
					channels: targets.slice(i, i + 100).map((thread) => ({
						channelId: thread.id,
						messageId:
							ReadStateStore?.lastMessageId?.(thread.id) ??
							thread.record.lastMessageId ??
							thread.lastMessageId,
						readStateType: 0,
					})),
				});
			UI.showToast(`Marked ${plural(targets.length)} read.`, {
				type: "success",
			});
			return;
		}
		const rest = findRestClient();
		if (!rest) {
			UI.showToast("Discord's request client is unavailable.", {
				type: "error",
			});
			return;
		}
		const run = (this.bulkRun = {
			verb: action.verb,
			done: 0,
			total: targets.length,
			cancelled: false,
		});
		this.renderBulkBar();
		const failures = [];
		for (const thread of targets) {
			if (run.cancelled) break;
			const [method, url, body] = action.request(thread);
			try {
				await this.request(rest, method, url, body);
			} catch (error) {
				failures.push({ thread, error });
			}
			run.done++;
			this.renderBulkBar();
			if (run.done < run.total && !run.cancelled) await sleep(BULK_DELAY);
		}
		this.bulkRun = null;
		this.renderBrowser();
		const succeeded = run.done - failures.length;
		const parts = [`${action.past} ${plural(succeeded)}.`];
		if (failures.length) {
			const reason = failures[0].error?.body?.message;
			parts.push(
				`${plural(failures.length)} failed` + (reason ? `: ${reason}` : "."),
			);
			console.warn("[ThreadNavigator] Bulk action failures", failures);
		}
		if (run.cancelled && run.done < run.total)
			parts.push(`Stopped with ${run.total - run.done} left.`);
		UI.showToast(parts.join(" "), {
			type: failures.length ? (succeeded ? "warning" : "error") : "success",
		});
	}
	async request(rest, method, url, body) {
		for (let attempt = 0; ; attempt++) {
			try {
				return await rest[method]({ url, body });
			} catch (error) {
				if (error?.status !== 429 || attempt >= 3) throw error;
				await sleep(Math.max(1, error.body?.retry_after ?? 1) * 1e3);
			}
		}
	}
	// Same menu as right-clicking the thread in the channel list: Discord's own
	// thread menu (with anything other plugins add to it) at the cursor.
	openThreadMenu(event, thread) {
		event.preventDefault();
		event.stopPropagation();
		const channel = ChannelStore.getChannel(thread.id);
		const fallback = (menuProps) =>
			api.ContextMenu.buildMenu([
				{
					label: "Open thread",
					action: () => this.openThread(thread, false),
				},
				{
					label: "Open in new tab",
					action: () => this.openThread(thread, true),
				},
				{ type: "separator" },
				{
					label: "Copy link",
					action: () =>
						copyText(
							`https://discord.com/channels/${this.channel.guildId}/${thread.id}`,
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
			api.ContextMenu.open(event, (menuProps) =>
				React.createElement(
					ThreadMenuBoundary,
					{ fallback: () => fallback(menuProps) },
					React.createElement(NativeMenu, {
						...menuProps,
						channel,
						guild: GuildStore.getGuild(channel.guild_id),
					}),
				),
			);
			return;
		}
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
	openThread(thread, inTab) {
		if (inTab) {
			if (
				globalThis.__ChannelTabsMacTabAPI?.openChannelInTab(
					this.channel.guildId,
					thread.id,
					`#${thread.name}`,
				)
			)
				return;
			UI.showToast("Enable ChannelTabsMac to open a new tab.", {
				type: "info",
			});
			return;
		}
		const url = `/channels/${this.channel.guildId}/${this.channel.parentId}/threads/${thread.id}`;
		if (typeof transitionTo === "function") transitionTo(url);
		else
			UI.showToast("Discord thread navigation is unavailable.", {
				type: "error",
			});
	}
};
/*@end@*/
