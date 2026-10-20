/**
 * @name ThreadNavigator
 * @author echo4eva
 * @description A searchable thread list for any channel, with threads opening on the side.
 * @version 0.5.0
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
	"0.5.0": {
		added: ["Native Vencord plugins with shared React interfaces"],
	},
	"0.4.5": {
		added: ["Ctrl-click a thread name to open it in a new tab on Windows"],
	},
	"0.4.4": {
		added: [
			"ThreadNavigator bulk thread actions, Discord's thread right-click menu, and a per-tab browser",
		],
	},
	"0.2.3": {
		fixed: ["Make middle thread browser scrollable"],
	},
	"0.2.2": {
		fixed: ["Keep thread browser open across tab switches"],
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
// src/shared/confirm.js
function showConfirmationModal(title, content, options = {}) {
	const alerts =
		window.BdCompatLayer && globalThis.Vencord?.Webpack?.Common?.Alerts;
	if (!alerts?.show)
		return BdApi.UI.showConfirmationModal(title, content, options);
	alerts.show({
		title,
		body: content,
		confirmText: options.confirmText ?? "Okay",
		cancelText:
			options.cancelText === null ? void 0 : (options.cancelText ?? "Cancel"),
		onConfirm: options.onConfirm,
		onCancel: options.onCancel,
	});
}

// src/shared/threadNavigator/state.js
var tabApi = () =>
	globalThis.__ChannelTabsTabAPI ?? globalThis.__ChannelTabsMacTabAPI;
var browserKey = (parentId) =>
	`${tabApi()?.getActiveTabId?.() ?? ""}:${parentId}`;
var openBrowsers = /* @__PURE__ */ new Set();
var listeners = /* @__PURE__ */ new Set();
function subscribe(listener) {
	listeners.add(listener);
	window.addEventListener("chungus-tabs-change", listener);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("chungus-tabs-change", listener);
	};
}
function notifyChange() {
	for (const listener of listeners) listener();
}
function isBrowserOpen(parentId) {
	return parentId != null && openBrowsers.has(browserKey(parentId));
}
function setBrowserOpen(parentId, open) {
	if (open === isBrowserOpen(parentId)) return;
	if (open) openBrowsers.add(browserKey(parentId));
	else openBrowsers.delete(browserKey(parentId));
	notifyChange();
}
function closeAllBrowsers() {
	openBrowsers.clear();
	notifyChange();
}
var lastFilters = {
	query: "",
	status: "active",
	membership: "any",
};

// src/shared/threadNavigator/style.css
var style_default =
	'/* The list covers the chat while it is open. The chat stays laid out\n   underneath, only invisible, so its scroll position survives. The Vencord\n   version marks the chat with a class, the BetterDiscord version with an\n   attribute React leaves alone. */\n:is(.tn-chat-covered, [data-tn-covered]) {\n	position: relative;\n}\n:is(.tn-chat-covered, [data-tn-covered]) > :not(.tn-host) {\n	visibility: hidden;\n}\n.tn-host {\n	display: none;\n}\n:is(.tn-chat-covered, [data-tn-covered]) > .tn-host {\n	display: flex;\n	position: absolute;\n	inset: 0;\n	z-index: 1;\n}\n.tn-browser {\n	display: flex;\n	flex: 1;\n	flex-direction: column;\n	min-width: 0;\n	min-height: 0;\n	overflow: hidden;\n	color: var(--text-default);\n	background: var(--background-base-low);\n}\n.tn-browser-bar {\n	display: flex;\n	align-items: center;\n	gap: 10px;\n	padding: 16px 16px 8px;\n	flex-shrink: 0;\n}\n.tn-browser-title {\n	min-width: 0;\n	flex: 1;\n	font-size: 20px;\n	font-weight: 700;\n}\n.tn-browser-close,\n.tn-tab-action {\n	border: 0;\n	border-radius: 6px;\n	color: var(--text-muted);\n	background: transparent;\n	cursor: pointer;\n	font: inherit;\n}\n.tn-browser-close {\n	width: 30px;\n	height: 30px;\n	font-size: 22px;\n	line-height: 1;\n}\n.tn-browser-close:hover,\n.tn-tab-action:hover {\n	color: var(--text-default);\n	background: var(--background-modifier-hover);\n}\n.tn-browser-controls {\n	display: flex;\n	flex-wrap: wrap;\n	gap: 8px;\n	padding: 4px 16px 12px;\n	flex-shrink: 0;\n}\n.tn-search {\n	min-width: 0;\n	flex: 1 1 180px;\n	box-sizing: border-box;\n	border: 0;\n	outline: 0;\n	border-radius: 6px;\n	padding: 8px 10px;\n	color: var(--text-default);\n	background: var(--background-base-lower);\n	font: inherit;\n	font-size: 13px;\n}\n.tn-filter,\n.tn-discover {\n	border: 0;\n	border-radius: 6px;\n	padding: 6px 10px;\n	background: var(--background-base-lower);\n	color: var(--text-default);\n	font: inherit;\n	cursor: pointer;\n}\n.tn-browser > .tn-browser-list {\n	display: flex;\n	flex: 1 1 0;\n	flex-direction: column;\n	gap: 5px;\n	min-height: 0;\n	overflow-x: hidden;\n	overflow-y: auto;\n	padding: 4px 8px 24px 16px;\n	scrollbar-width: thin;\n	scrollbar-color: var(--scrollbar-auto-thumb, var(--background-modifier-hover))\n		var(--scrollbar-auto-track, transparent);\n}\n.tn-browser-list::-webkit-scrollbar {\n	width: 8px;\n}\n.tn-browser-list::-webkit-scrollbar-thumb {\n	border-radius: 4px;\n	background: var(--scrollbar-auto-thumb, var(--background-modifier-hover));\n}\n.tn-browser-list::-webkit-scrollbar-track {\n	background: var(--scrollbar-auto-track, transparent);\n}\n.tn-item {\n	display: flex;\n	flex-shrink: 0;\n	align-items: center;\n	gap: 8px;\n	width: 100%;\n	box-sizing: border-box;\n	padding: 10px 12px;\n	border: 1px solid var(--border-subtle);\n	border-radius: 7px;\n	background: var(--background-base-lower);\n	color: var(--text-default);\n}\n.tn-item:hover {\n	background: var(--background-modifier-hover);\n}\n.tn-item-selected {\n	border-color: var(--brand-500);\n	background: var(--background-modifier-selected);\n}\n.tn-item-link {\n	display: block;\n	min-width: 0;\n	flex: 1;\n	color: inherit;\n	text-decoration: none;\n}\n.tn-item-main {\n	display: block;\n	min-width: 0;\n}\n.tn-item-name {\n	display: block;\n	overflow: hidden;\n	text-overflow: ellipsis;\n	white-space: nowrap;\n	font-size: 13px;\n	font-weight: 600;\n}\n.tn-item-meta {\n	display: block;\n	margin-top: 4px;\n	color: var(--text-muted);\n	font-size: 11px;\n}\n.tn-item-mentioned {\n	border-left: 3px solid\n		hsl(359, calc(var(--saturation-factor, 1) * 82.6%), 59.4%);\n}\n.tn-item-unread:not(.tn-item-mentioned) {\n	border-left: 3px solid hsl(235, calc(var(--saturation-factor, 1) * 86%), 65%);\n}\n.tn-item-unread .tn-item-name {\n	font-weight: 700;\n}\n.tn-badges {\n	display: flex;\n	flex-shrink: 0;\n	align-items: center;\n	gap: 4px;\n}\n.tn-badge {\n	box-sizing: border-box;\n	min-width: 8px;\n	height: 16px;\n	padding: 0 5px;\n	border-radius: 8px;\n	color: #fff;\n	font-size: 12px;\n	font-weight: 600;\n	line-height: 16px;\n	text-align: center;\n}\n.tn-badge-mention {\n	background-color: hsl(359, calc(var(--saturation-factor, 1) * 82.6%), 59.4%);\n}\n.tn-badge-unread {\n	background-color: hsl(235, calc(var(--saturation-factor, 1) * 86%), 65%);\n}\n.tn-tab-action {\n	flex-shrink: 0;\n	width: 28px;\n	height: 28px;\n	font-size: 17px;\n	line-height: 1;\n}\n.tn-empty,\n.tn-load {\n	padding: 18px 12px;\n	color: var(--text-muted);\n	text-align: center;\n	font-size: 13px;\n}\n.tn-select-toggle[aria-pressed="true"] {\n	color: var(--white-500, #fff);\n	background: var(--brand-500);\n}\n.tn-check {\n	flex-shrink: 0;\n	width: 16px;\n	height: 16px;\n	margin: 0;\n	accent-color: var(--brand-500);\n	cursor: pointer;\n}\n.tn-selecting .tn-item-link {\n	cursor: pointer;\n	user-select: none;\n}\n.tn-item-checked {\n	border-color: var(--brand-500);\n	background: var(--background-modifier-selected);\n}\n.tn-bulk {\n	display: flex;\n	flex-shrink: 0;\n	flex-wrap: wrap;\n	align-items: center;\n	gap: 6px;\n	padding: 10px 16px;\n	border-top: 1px solid var(--border-subtle);\n	background: var(--background-base-lower);\n}\n.tn-bulk-count {\n	margin-right: auto;\n	color: var(--text-muted);\n	font-size: 13px;\n}\n.tn-bulk button {\n	border: 0;\n	border-radius: 6px;\n	padding: 6px 10px;\n	color: var(--text-default);\n	background: var(--background-modifier-hover);\n	font: inherit;\n	font-size: 13px;\n	cursor: pointer;\n}\n.tn-bulk button:hover:not(:disabled) {\n	background: var(--background-modifier-selected);\n}\n.tn-bulk button:disabled {\n	opacity: 0.45;\n	cursor: default;\n}\n.tn-bulk .tn-danger {\n	color: var(--text-feedback-critical, var(--status-danger));\n}\n';

// src/shared/threadNavigator/threads.js
var BROWSABLE_PARENT_TYPES = [0, 5];
var DISCORD_EPOCH = 1420070400000n;
var MANAGE_THREADS = 1n << 34n;
var BULK_DELAY = 300;
var PAGE = 40;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var plural = (n) => `${n} thread${n === 1 ? "" : "s"}`;
function snowflakeTime(id) {
	try {
		return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
	} catch {
		return 0;
	}
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
var SHOWN_FIELDS = [
	"id",
	"name",
	"archived",
	"locked",
	"joined",
	"unread",
	"unreadCount",
	"unreadEstimated",
	"mentions",
	"lastMessageId",
	"readAt",
];
function sameThreads(a, b) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++)
		for (const field of SHOWN_FIELDS)
			if (a[i][field] !== b[i][field]) return false;
	return true;
}
function filterThreads(threads, { query, status, membership }) {
	const needle = query.trim().toLocaleLowerCase();
	return threads.filter(
		(thread) =>
			(status === "all" || (status === "archived") === thread.archived) &&
			(membership === "any" || (membership === "joined") === thread.joined) &&
			thread.name.toLocaleLowerCase().includes(needle),
	);
}
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
function createThreadData({ stores, getRest, dispatcher }) {
	const {
		ChannelStore: ChannelStore2,
		ActiveJoinedThreadsStore: ActiveJoinedThreadsStore2,
		ReadStateStore: ReadStateStore2,
		JoinedThreadsStore: JoinedThreadsStore2,
		PermissionStore: PermissionStore2,
		UserStore: UserStore2,
	} = stores;
	const readAt = /* @__PURE__ */ new Map();
	const wasUnread = /* @__PURE__ */ new Map();
	function browsableChannel(channel) {
		if (!channel?.guild_id || !BROWSABLE_PARENT_TYPES.includes(channel.type))
			return null;
		return {
			guildId: channel.guild_id,
			parentId: channel.id,
			name: channel.name || "Channel",
		};
	}
	function getThreads({ guildId, parentId }) {
		const byId = /* @__PURE__ */ new Map();
		const joinedIds = /* @__PURE__ */ new Set();
		for (const thread of storeThreads(
			ChannelStore2,
			"getAllThreadsForParent",
			parentId,
		))
			if (thread?.id) byId.set(thread.id, thread);
		for (const method of [
			"getActiveJoinedThreadsForParent",
			"getActiveUnjoinedThreadsForParent",
		]) {
			const entries = storeThreads(
				ActiveJoinedThreadsStore2,
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
			.map((thread) => {
				const unread = Boolean(ReadStateStore2?.hasUnread?.(thread.id));
				const mentions = ReadStateStore2?.getMentionCount?.(thread.id) ?? 0;
				const needsAttention = unread || mentions > 0;
				if (wasUnread.get(thread.id) && !needsAttention)
					readAt.set(thread.id, Date.now());
				wasUnread.set(thread.id, needsAttention);
				const read = needsAttention ? 0 : (readAt.get(thread.id) ?? 0);
				const lastMessageId =
					thread.lastMessageId || thread.last_message_id || thread.id;
				return {
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
						typeof JoinedThreadsStore2?.hasJoined === "function"
							? Boolean(JoinedThreadsStore2.hasJoined(thread.id))
							: joinedIds.has(thread.id),
					ownerId: thread.ownerId ?? thread.owner_id,
					unread,
					unreadCount: ReadStateStore2?.getUnreadCount?.(thread.id) ?? 0,
					unreadEstimated: Boolean(ReadStateStore2?.isEstimated?.(thread.id)),
					mentions,
					lastMessageId,
					readAt: read,
					activity: Math.max(snowflakeTime(lastMessageId), read),
				};
			})
			.sort(
				(a, b) =>
					attentionRank(a) - attentionRank(b) || b.activity - a.activity,
			);
	}
	function permissions(thread) {
		let manage = true;
		try {
			if (typeof PermissionStore2?.can === "function")
				manage = Boolean(PermissionStore2.can(MANAGE_THREADS, thread.record));
		} catch {}
		const owner =
			thread.ownerId && thread.ownerId === UserStore2?.getCurrentUser?.()?.id;
		return { manage, moderate: manage || owner };
	}
	function actionTargets(action, threads) {
		return threads.filter((thread) =>
			action.applies(thread, permissions(thread)),
		);
	}
	function markRead(threads) {
		for (let i = 0; i < threads.length; i += 100)
			dispatcher.dispatch({
				type: "BULK_ACK",
				context: "APP",
				channels: threads.slice(i, i + 100).map((thread) => ({
					channelId: thread.id,
					messageId:
						ReadStateStore2?.lastMessageId?.(thread.id) ??
						thread.record.lastMessageId ??
						thread.lastMessageId,
					readStateType: 0,
				})),
			});
	}
	async function request(method, url, body) {
		const client = getRest();
		if (!client) throw new Error("Discord's request client is unavailable.");
		for (let attempt = 0; ; attempt++) {
			try {
				return await client[method]({ url, body });
			} catch (error) {
				if (error?.status !== 429 || attempt >= 3) throw error;
				await sleep(Math.max(1, error.body?.retry_after ?? 1) * 1e3);
			}
		}
	}
	return {
		browsableChannel,
		getThreads,
		actionTargets,
		markRead,
		request,
		BULK_DELAY,
	};
}

// src/shared/threadNavigator/ThreadBrowser.jsx
var ITEM_FIELDS = [
	"name",
	"archived",
	"locked",
	"joined",
	"unread",
	"unreadCount",
	"unreadEstimated",
	"mentions",
];
var classes = (...names) => names.filter(Boolean).join(" ");
function createThreadBrowser(platform) {
	const {
		React: React2,
		useStateFromStores: useStateFromStores2,
		data: data2,
		threadStores,
		ChannelSectionStore: ChannelSectionStore2,
		isMac,
	} = platform;
	const { useCallback, useMemo, useRef, useState } = React2;
	function ThreadItemView({
		thread,
		href,
		open,
		selecting,
		checked,
		handlers,
	}) {
		const details = [
			thread.archived ? "Archived" : "Active",
			thread.locked && "Locked",
			thread.joined && "Joined",
			open && "Open on right",
		]
			.filter(Boolean)
			.join(" \xB7 ");
		const estimate = thread.unreadEstimated ? "+" : "";
		return /* @__PURE__ */ React2.createElement(
			"div",
			{
				className: classes(
					"tn-item",
					(thread.unread || thread.mentions > 0) && "tn-item-unread",
					thread.mentions > 0 && "tn-item-mentioned",
					open && "tn-item-selected",
					checked && "tn-item-checked",
				),
				onContextMenu: (event) => handlers.menu(thread, event),
			},
			selecting &&
				/* @__PURE__ */ React2.createElement("input", {
					className: "tn-check",
					type: "checkbox",
					checked,
					"aria-label": `Select ${thread.name}`,
					onClick: (event) => handlers.check(thread, event),
					onChange: () => {},
				}),
			/* @__PURE__ */ React2.createElement(
				"a",
				{
					className: "tn-item-link",
					href,
					title: thread.name,
					onClick: (event) => handlers.click(thread, event),
				},
				/* @__PURE__ */ React2.createElement(
					"span",
					{ className: "tn-item-main" },
					/* @__PURE__ */ React2.createElement(
						"span",
						{ className: "tn-item-name" },
						thread.name,
					),
					/* @__PURE__ */ React2.createElement(
						"span",
						{ className: "tn-item-meta" },
						details,
					),
				),
			),
			(thread.mentions > 0 || thread.unread) &&
				/* @__PURE__ */ React2.createElement(
					"span",
					{ className: "tn-badges" },
					thread.mentions > 0 &&
						/* @__PURE__ */ React2.createElement(
							"span",
							{
								className: "tn-badge tn-badge-mention",
								title: `${thread.mentions} mention${thread.mentions === 1 ? "" : "s"}`,
							},
							thread.mentions,
						),
					thread.unread &&
						/* @__PURE__ */ React2.createElement(
							"span",
							{
								className: "tn-badge tn-badge-unread",
								title: thread.unreadCount
									? `${thread.unreadCount}${estimate} unread message${thread.unreadCount === 1 ? "" : "s"}`
									: "Unread messages",
							},
							thread.unreadCount ? thread.unreadCount + estimate : "New",
						),
				),
			/* @__PURE__ */ React2.createElement(
				"button",
				{
					className: "tn-tab-action",
					type: "button",
					title: "Open in a ChungusTabs tab",
					"aria-label": `Open ${thread.name} in a new tab`,
					onClick: (event) => {
						event.preventDefault();
						event.stopPropagation();
						handlers.openInTab(thread);
					},
				},
				"\u2197",
			),
		);
	}
	const ThreadItem = React2.memo(
		ThreadItemView,
		(a, b) =>
			a.open === b.open &&
			a.selecting === b.selecting &&
			a.checked === b.checked &&
			a.href === b.href &&
			ITEM_FIELDS.every((field) => a.thread[field] === b.thread[field]),
	);
	function ThreadBrowser({ channel }) {
		const { guildId, parentId } = channel;
		const threads = useStateFromStores2(
			threadStores(),
			() => data2.getThreads(channel),
			[guildId, parentId],
			sameThreads,
		);
		const sidebarThreadId = useStateFromStores2(
			[ChannelSectionStore2],
			() =>
				ChannelSectionStore2?.getCurrentSidebarChannelId?.(parentId) ?? null,
			[parentId],
		);
		const [filters, setFilterState] = useState(() => ({ ...lastFilters }));
		const [limit, setLimit] = useState(PAGE);
		const [selecting, setSelectingState] = useState(false);
		const [selected, setSelected] = useState(() => /* @__PURE__ */ new Set());
		const [run, setRun] = useState(null);
		const runRef = useRef(null);
		const anchorId = useRef(null);
		const visible = useMemo(
			() => filterThreads(threads, filters),
			[threads, filters],
		);
		const selectedThreads = useMemo(
			() => threads.filter((thread) => selected.has(thread.id)),
			[threads, selected],
		);
		const setFilters = (change) => {
			Object.assign(lastFilters, change);
			setFilterState((current) => ({ ...current, ...change }));
			setLimit(PAGE);
		};
		const setSelecting = (value) => {
			setSelectingState(value);
			if (!value) {
				setSelected(/* @__PURE__ */ new Set());
				anchorId.current = null;
			}
		};
		const openThread = (thread, inTab) => {
			if (inTab) {
				if (tabApi()?.openChannelInTab(guildId, thread.id, `#${thread.name}`))
					return;
				platform.toast("Enable ChungusTabs to open a new tab.", "info");
				return;
			}
			platform.navigate(
				`/channels/${guildId}/${parentId}/threads/${thread.id}`,
			);
		};
		const selectThread = (thread, range) => {
			setSelected((current) => {
				const next = new Set(current);
				const from = range
					? visible.findIndex((item) => item.id === anchorId.current)
					: -1;
				const to = visible.findIndex((item) => item.id === thread.id);
				if (from !== -1 && to !== -1) {
					const [start, end] = from < to ? [from, to] : [to, from];
					for (const item of visible.slice(start, end + 1)) next.add(item.id);
				} else if (next.has(thread.id)) next.delete(thread.id);
				else next.add(thread.id);
				return next;
			});
			anchorId.current = thread.id;
		};
		const toggleAllVisible = (select) => {
			setSelected((current) => {
				const next = new Set(current);
				const all = select ?? !visible.every((thread) => next.has(thread.id));
				for (const thread of visible)
					if (all) next.add(thread.id);
					else next.delete(thread.id);
				return next;
			});
		};
		const latest = useRef(null);
		latest.current = { openThread, selectThread, selecting, setSelecting };
		const handlers = useMemo(
			() => ({
				click(thread, event) {
					if (event.button !== 0) return;
					event.preventDefault();
					const {
						selecting: selecting2,
						setSelecting: setSelecting2,
						selectThread: selectThread2,
						openThread: openThread2,
					} = latest.current;
					if (selecting2 || event.shiftKey) {
						if (!selecting2) setSelecting2(true);
						selectThread2(thread, event.shiftKey);
						return;
					}
					openThread2(thread, isMac ? event.metaKey : event.ctrlKey);
				},
				check(thread, event) {
					event.stopPropagation();
					latest.current.selectThread(thread, event.shiftKey);
				},
				menu(thread, event) {
					platform.openThreadMenu(event, {
						thread,
						guildId,
						onOpen: (inTab) => latest.current.openThread(thread, inTab),
					});
				},
				openInTab(thread) {
					latest.current.openThread(thread, true);
				},
			}),
			[guildId],
		);
		const executeBulk = async (action, targets) => {
			if (action.id === "read") {
				data2.markRead(targets);
				platform.toast(`Marked ${plural(targets.length)} read.`, "success");
				return;
			}
			const state = {
				verb: action.verb,
				done: 0,
				total: targets.length,
				cancelled: false,
			};
			runRef.current = state;
			setRun({ ...state });
			const failures = [];
			for (const thread of targets) {
				if (state.cancelled) break;
				const [method, url, body] = action.request(thread);
				try {
					await data2.request(method, url, body);
				} catch (error) {
					failures.push({ thread, error });
				}
				state.done++;
				setRun({ ...state });
				if (state.done < state.total && !state.cancelled)
					await sleep(data2.BULK_DELAY);
			}
			runRef.current = null;
			setRun(null);
			const succeeded = state.done - failures.length;
			const parts = [`${action.past} ${plural(succeeded)}.`];
			if (failures.length) {
				const reason = failures[0].error?.body?.message;
				parts.push(
					`${plural(failures.length)} failed` + (reason ? `: ${reason}` : "."),
				);
				console.warn("[ThreadNavigator] Bulk action failures", failures);
			}
			if (state.cancelled && state.done < state.total)
				parts.push(`Stopped with ${state.total - state.done} left.`);
			platform.toast(
				parts.join(" "),
				failures.length ? (succeeded ? "warning" : "error") : "success",
			);
		};
		const runBulk = (action) => {
			if (runRef.current) return;
			const targets = data2.actionTargets(action, selectedThreads);
			if (!targets.length) return;
			const start = () => void executeBulk(action, targets);
			if (!action.confirm) return start();
			const names = targets
				.slice(0, 5)
				.map((thread) => `\u2022 ${thread.name}`);
			if (targets.length > 5)
				names.push(`\u2026and ${targets.length - 5} more`);
			platform.confirm({
				title: `${action.label} ${plural(targets.length)}?`,
				body: /* @__PURE__ */ React2.createElement(
					"div",
					null,
					names.map((name, index) =>
						/* @__PURE__ */ React2.createElement("div", { key: index }, name),
					),
				),
				confirmText: action.label,
				onConfirm: start,
			});
		};
		const onKeyDown = (event) => {
			event.stopPropagation();
			if (!selecting) return;
			const typing = event.target.matches?.(
				"input:not([type=checkbox]), select",
			);
			if (event.key === "Escape" && !typing) {
				event.preventDefault();
				setSelecting(false);
			} else if (
				event.key.toLowerCase() === "a" &&
				(event.metaKey || event.ctrlKey) &&
				!typing
			) {
				event.preventDefault();
				toggleAllVisible(true);
			}
		};
		const onScroll = useCallback(
			(event) => {
				const list = event.currentTarget;
				if (list.scrollTop + list.clientHeight >= list.scrollHeight - 240)
					setLimit((current) =>
						current < visible.length ? current + PAGE : current,
					);
			},
			[visible.length],
		);
		const shown = visible.filter((thread) => selected.has(thread.id)).length;
		const hidden = selectedThreads.length - shown;
		const allShownChecked = visible.length > 0 && shown === visible.length;
		return /* @__PURE__ */ React2.createElement(
			"div",
			{
				className: classes("tn-browser", selecting && "tn-selecting"),
				onKeyDown,
			},
			/* @__PURE__ */ React2.createElement(
				"div",
				{ className: "tn-browser-bar" },
				/* @__PURE__ */ React2.createElement(
					"div",
					{ className: "tn-browser-title" },
					"Threads in #",
					channel.name,
				),
				/* @__PURE__ */ React2.createElement(
					"button",
					{
						className: "tn-browser-close",
						type: "button",
						title: "Return to channel chat",
						"aria-label": "Return to channel chat",
						onClick: () => setBrowserOpen(parentId, false),
					},
					"\xD7",
				),
			),
			/* @__PURE__ */ React2.createElement(
				"div",
				{ className: "tn-browser-controls" },
				/* @__PURE__ */ React2.createElement("input", {
					className: "tn-search",
					type: "search",
					placeholder: "Search threads",
					"aria-label": "Search threads in browser",
					value: filters.query,
					onChange: (event) => setFilters({ query: event.currentTarget.value }),
				}),
				/* @__PURE__ */ React2.createElement(
					"select",
					{
						className: "tn-filter",
						"aria-label": "Filter threads",
						value: filters.status,
						onChange: (event) =>
							setFilters({ status: event.currentTarget.value }),
					},
					/* @__PURE__ */ React2.createElement(
						"option",
						{ value: "active" },
						"Active",
					),
					/* @__PURE__ */ React2.createElement(
						"option",
						{ value: "archived" },
						"Archived (loaded)",
					),
					/* @__PURE__ */ React2.createElement(
						"option",
						{ value: "all" },
						"All loaded",
					),
				),
				/* @__PURE__ */ React2.createElement(
					"select",
					{
						className: "tn-filter",
						"aria-label": "Filter threads by membership",
						value: filters.membership,
						onChange: (event) =>
							setFilters({ membership: event.currentTarget.value }),
					},
					/* @__PURE__ */ React2.createElement(
						"option",
						{ value: "any" },
						"Joined or not",
					),
					/* @__PURE__ */ React2.createElement(
						"option",
						{ value: "joined" },
						"Joined",
					),
					/* @__PURE__ */ React2.createElement(
						"option",
						{ value: "unjoined" },
						"Not joined",
					),
				),
				/* @__PURE__ */ React2.createElement(
					"button",
					{
						className: "tn-discover tn-select-toggle",
						type: "button",
						"aria-pressed": selecting,
						title: "Select threads for bulk actions (Shift-click a thread)",
						onClick: () => setSelecting(!selecting),
					},
					"Select",
				),
				/* @__PURE__ */ React2.createElement(
					"button",
					{
						className: "tn-discover",
						type: "button",
						title: "Open Discord's thread discovery",
						onClick: () => platform.openDiscovery(parentId),
					},
					"Discord discovery",
				),
			),
			/* @__PURE__ */ React2.createElement(
				"div",
				{ className: "tn-browser-list", onScroll },
				visible.length === 0 &&
					/* @__PURE__ */ React2.createElement(
						"div",
						{ className: "tn-empty" },
						"No matching threads loaded for this channel.",
					),
				visible.slice(0, limit).map((thread) =>
					/* @__PURE__ */ React2.createElement(ThreadItem, {
						key: thread.id,
						thread,
						href: `/channels/${guildId}/${parentId}/threads/${thread.id}`,
						open: thread.id === sidebarThreadId,
						selecting,
						checked: selecting && selected.has(thread.id),
						handlers,
					}),
				),
				visible.length > limit &&
					/* @__PURE__ */ React2.createElement(
						"div",
						{ className: "tn-load" },
						"Showing ",
						limit,
						" of ",
						visible.length,
						". Scroll for more.",
					),
			),
			selecting &&
				/* @__PURE__ */ React2.createElement(
					"div",
					{ className: "tn-bulk" },
					/* @__PURE__ */ React2.createElement("input", {
						className: "tn-check",
						type: "checkbox",
						checked: allShownChecked,
						ref: (element) => {
							if (element)
								element.indeterminate = shown > 0 && !allShownChecked;
						},
						title: allShownChecked
							? "Deselect shown threads"
							: `Select all ${visible.length} shown threads`,
						disabled: Boolean(run) || !visible.length,
						onChange: () => toggleAllVisible(),
					}),
					/* @__PURE__ */ React2.createElement(
						"span",
						{ className: "tn-bulk-count" },
						run
							? `${run.verb} ${run.done} of ${run.total}\u2026`
							: `${selectedThreads.length} selected` +
									(hidden ? ` \xB7 ${hidden} hidden by filters` : ""),
					),
					run
						? /* @__PURE__ */ React2.createElement(
								"button",
								{
									type: "button",
									onClick: () => {
										if (runRef.current) runRef.current.cancelled = true;
									},
								},
								"Stop",
							)
						: /* @__PURE__ */ React2.createElement(
								React2.Fragment,
								null,
								BULK_ACTIONS.map((action) => {
									const count = data2.actionTargets(
										action,
										selectedThreads,
									).length;
									return /* @__PURE__ */ React2.createElement(
										"button",
										{
											key: action.id,
											type: "button",
											className: action.confirm ? "tn-danger" : void 0,
											disabled: !count,
											title:
												!count && selectedThreads.length
													? `None of the selected threads can be ${action.past.toLowerCase()}`
													: void 0,
											onClick: () => runBulk(action),
										},
										count ? `${action.label} (${count})` : action.label,
									);
								}),
								/* @__PURE__ */ React2.createElement(
									"button",
									{
										type: "button",
										disabled: !selectedThreads.length,
										onClick: () => setSelected(/* @__PURE__ */ new Set()),
									},
									"Clear",
								),
							),
					/* @__PURE__ */ React2.createElement(
						"button",
						{
							type: "button",
							disabled: Boolean(run),
							onClick: () => setSelecting(false),
						},
						"Done",
					),
				),
		);
	}
	function useBrowserOpen(parentId) {
		return React2.useSyncExternalStore(subscribe, () =>
			isBrowserOpen(parentId),
		);
	}
	return { ThreadBrowser, useBrowserOpen };
}

// src/ThreadNavigator/index.jsx
var api = new BdApi("ThreadNavigator");
var { Webpack, DOM, UI, React, ReactDOM, Hooks } = api;
var IS_MAC = navigator.platform.startsWith("Mac");
var ChannelStore = Webpack.getStore("ChannelStore");
var GuildStore = Webpack.getStore("GuildStore");
var ActiveJoinedThreadsStore = Webpack.getStore("ActiveJoinedThreadsStore");
var ReadStateStore = Webpack.getStore("ReadStateStore");
var JoinedThreadsStore = Webpack.getStore("JoinedThreadsStore");
var PermissionStore = Webpack.getStore("PermissionStore");
var UserStore = Webpack.getStore("UserStore");
var ChannelSectionStore = Webpack.getStore("ChannelSectionStore");
var FluxDispatcher = Webpack.getByKeys("subscribe", "dispatch", "unsubscribe");
var transitionTo = Webpack.getByStrings("transitionTo - Transitioning to ", {
	searchExports: true,
});
var useStateFromStores =
	Hooks?.useStateFromStores ??
	Webpack.getByStrings("useStateFromStores", { searchExports: true });
var createRoot =
	ReactDOM?.createRoot ??
	Webpack.getByKeys("createRoot", "hydrateRoot")?.createRoot;
function findRestClient() {
	return Webpack.getModule(
		(m) =>
			["get", "post", "put", "patch", "del"].every(
				(key) => typeof m?.[key] === "function",
			),
		{ searchExports: true },
	);
}
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
var Boundary = class extends React.Component {
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
};
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
		api.ContextMenu.open(event, (menuProps) =>
			/* @__PURE__ */ React.createElement(
				Boundary,
				{ name: "Thread menu", fallback: () => fallback(menuProps) },
				/* @__PURE__ */ React.createElement(NativeMenu, {
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
var data = createThreadData({
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
		this.unsubscribe = subscribe(this.sync);
		FluxDispatcher?.subscribe?.("CHANNEL_SELECT", notifyChange);
		this.mutationObserver = new MutationObserver(this.scheduleSync);
		this.mutationObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
		window.addEventListener("popstate", this.scheduleSync);
		DOM.addStyle(style_default);
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
		const key = open ? JSON.stringify(channel) : "";
		if (key === this.renderedKey) return;
		this.renderedKey = key;
		const { ThreadBrowser } = this.ui;
		this.root.render(
			open
				? /* @__PURE__ */ React.createElement(
						Boundary,
						{
							key: channel.parentId,
							name: "Thread list",
							fallback: () =>
								/* @__PURE__ */ React.createElement(
									"div",
									{ className: "tn-browser" },
									/* @__PURE__ */ React.createElement(
										"div",
										{ className: "tn-empty" },
										"ThreadNavigator's thread list crashed.",
									),
								),
						},
						/* @__PURE__ */ React.createElement(ThreadBrowser, { channel }),
					)
				: null,
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
/*@end@*/
