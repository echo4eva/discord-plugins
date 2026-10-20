// One tab bar, bookmark bar, settings model and stylesheet for both platforms.
// Called only after Discord has supplied React and its stores.
export function createChannelTabs(platform) {
	//#region Module/Variable Definitions

	let pluginMeta;
	// BetterVencord (Vesktop/Vencord) has no process.platform.
	const IS_MAC = navigator.platform.startsWith("Mac");
	// Recordable tab shortcuts, with each platform's usual defaults.
	const TAB_SHORTCUTS = {
		closeTab: {
			setting: "closeTabShortcut",
			default: IS_MAC ? ["Meta", "W"] : ["Control", "W"],
		},
		newTab: {
			setting: "newTabShortcut",
			default: IS_MAC ? ["Meta", "T"] : ["Control", "T"],
		},
		previousTab: {
			setting: "previousTabShortcut",
			default: ["Control", "PageUp"],
		},
		nextTab: {
			setting: "nextTabShortcut",
			default: ["Control", "PageDown"],
		},
	};

	function getShortcut(settings, id) {
		const { setting, default: fallback } = TAB_SHORTCUTS[id];
		return settings[setting] ?? [...fallback];
	}

	// "meta" means the platform's main modifier: Command on macOS, Ctrl elsewhere.
	function getNumberTabModifier(settings) {
		return (
			settings.numberTabShortcut ??
			(settings.commandNumberTabs === false ? "off" : "meta")
		);
	}

	const KEY_NAMES = { pageup: "PgUp", pagedown: "PgDn", escape: "Esc" };

	function formatShortcut(shortcut) {
		if (!Array.isArray(shortcut) || shortcut.length === 0) return "Off";
		return shortcut
			.map((part) => {
				const key = String(part).toLowerCase();
				if (key === "alt" || key === "option") return IS_MAC ? "Option" : "Alt";
				if (key === "meta" || key === "command" || key === "cmd")
					return IS_MAC ? "Command" : "Meta";
				if (key === "control" || key === "ctrl") return "Ctrl";
				if (key === "shift") return "Shift";
				if (KEY_NAMES[key]) return KEY_NAMES[key];
				return key.length === 1
					? key.toUpperCase()
					: key[0].toUpperCase() + key.slice(1);
			})
			.join(" + ");
	}

	function matchesShortcut(event, shortcut) {
		if (!Array.isArray(shortcut) || shortcut.length === 0) return false;
		const parts = shortcut.map((part) => String(part).toLowerCase());
		const modifiers = {
			alt: parts.some((part) => part === "alt" || part === "option"),
			ctrl: parts.some((part) => part === "control" || part === "ctrl"),
			meta: parts.some((part) => ["meta", "command", "cmd"].includes(part)),
			shift: parts.includes("shift"),
		};
		if (
			event.altKey !== modifiers.alt ||
			event.ctrlKey !== modifiers.ctrl ||
			event.metaKey !== modifiers.meta ||
			event.shiftKey !== modifiers.shift
		)
			return false;
		const keys = parts.filter(
			(part) =>
				![
					"alt",
					"option",
					"control",
					"ctrl",
					"meta",
					"command",
					"cmd",
					"shift",
				].includes(part),
		);
		if (keys.length !== 1) return false;
		const key = keys[0];
		const code = String(event.code ?? "").toLowerCase();
		return (
			code === key ||
			code === `key${key}` ||
			code === `digit${key}` ||
			String(event.key ?? "").toLowerCase() === key ||
			(key.length === 1 && event.keyCode === key.toUpperCase().charCodeAt(0))
		);
	}

	// Click shortcuts store "meta" for the platform's main modifier: Command on
	// macOS, Ctrl elsewhere.
	function matchesClickShortcut(event, shortcut) {
		if (shortcut === "off") return false;
		if (!IS_MAC) shortcut = shortcut.replace("meta", "ctrl");
		return (
			[
				event.metaKey && "meta",
				event.altKey && "alt",
				event.ctrlKey && "ctrl",
				event.shiftKey && "shift",
			]
				.filter(Boolean)
				.join("+") === shortcut
		);
	}

	function getNumberedTabIndex(event, modifier) {
		if (modifier === "off" || event.shiftKey || event.isComposing) return -1;
		const wanted = modifier === "alt" ? "alt" : IS_MAC ? "meta" : "ctrl";
		if (
			event.metaKey !== (wanted === "meta") ||
			event.ctrlKey !== (wanted === "ctrl") ||
			event.altKey !== (wanted === "alt")
		)
			return -1;
		const digit =
			/^(?:Digit|Numpad)([1-9])$/.exec(event.code ?? "")?.[1] ??
			/^[1-9]$/.exec(event.key ?? "")?.[0];
		return digit ? Number(digit) - 1 : -1;
	}

	function getTabDisplayItems(tabs, folders) {
		const items = [];
		const shownFolders = new Set();
		const validFolders = new Map(folders.map((folder) => [folder.id, folder]));
		const emptyFolders = folders.filter(
			(folder) => !tabs.some((tab) => tab.folderId === folder.id),
		);
		const addEmptyFolders = (index) => {
			for (const folder of emptyFolders) {
				if (Math.min(folder.position ?? tabs.length, tabs.length) === index)
					items.push({ type: "folder", folder, tabs: [] });
			}
		};
		tabs.forEach((tab, tabIndex) => {
			addEmptyFolders(tabIndex);
			const folder = validFolders.get(tab.folderId);
			if (!folder) {
				items.push({ type: "tab", tab, tabIndex });
				return;
			}
			if (shownFolders.has(folder.id)) return;
			shownFolders.add(folder.id);
			const folderTabs = tabs
				.map((item, index) => ({ tab: item, tabIndex: index }))
				.filter((item) => item.tab.folderId === folder.id);
			items.push({ type: "folder", folder, tabs: folderTabs });
			if (!folder.collapsed)
				items.push(...folderTabs.map((item) => ({ type: "tab", ...item })));
		});
		addEmptyFolders(tabs.length);
		return items;
	}

	function moveFolderGroup(tabs, folders, folderId, target, after) {
		const moving = tabs.filter((tab) => tab.folderId === folderId);
		const remaining = tabs.filter((tab) => tab.folderId !== folderId);
		const targetFolderId =
			target.type === "folder" ? target.id : tabs[target.index]?.folderId;
		if (targetFolderId === folderId) return { tabs, folders };
		const targetFolder = folders.find((folder) => folder.id === targetFolderId);
		const targetTabs = targetFolderId
			? remaining.filter((tab) => tab.folderId === targetFolderId)
			: [];
		let index;
		if (targetTabs.length) {
			index = remaining.indexOf(after ? targetTabs.at(-1) : targetTabs[0]);
			if (after) index++;
		} else if (targetFolder) {
			index = Math.min(
				targetFolder.position ?? remaining.length,
				remaining.length,
			);
		} else {
			const targetTab = tabs[target.index];
			index = remaining.indexOf(targetTab);
			if (index < 0) return { tabs, folders };
			if (after) index++;
		}
		remaining.splice(index, 0, ...moving);
		let nextFolders = folders.map((folder) => {
			if (folder.id === folderId)
				return { ...folder, position: moving.length ? null : index };
			if (folder.position == null) return folder;
			const oldPosition = Math.min(folder.position, tabs.length);
			const keptBefore = tabs
				.slice(0, oldPosition)
				.filter((tab) => tab.folderId !== folderId).length;
			const shifted =
				moving.length &&
				index <= keptBefore &&
				!(folder.id === targetFolderId && after);
			return {
				...folder,
				position: keptBefore + (shifted ? moving.length : 0),
			};
		});
		if (targetFolder && !targetTabs.length) {
			const movingFolder = nextFolders.find((folder) => folder.id === folderId);
			nextFolders = nextFolders.filter((folder) => folder.id !== folderId);
			const targetIndex = nextFolders.findIndex(
				(folder) => folder.id === targetFolderId,
			);
			nextFolders.splice(targetIndex + (after ? 1 : 0), 0, movingFolder);
		}
		return { tabs: remaining, folders: nextFolders };
	}

	// The bookmark row is the loose bookmarks in order, with each group sitting
	// before the loose bookmark at its saved `position` (groups saved before
	// positions existed sit at the start).
	function getFavRowItems(favs, favGroups) {
		const loose = favs.filter((fav) => fav && fav.groupId === -1);
		const groups = favGroups
			.map((group, order) => ({
				group,
				order,
				position: Math.min(Math.max(group.position ?? 0, 0), loose.length),
			}))
			.sort((a, b) => a.position - b.position || a.order - b.order);
		const items = [];
		let next = 0;
		for (let i = 0; i <= loose.length; i++) {
			while (next < groups.length && groups[next].position === i)
				items.push({ type: "group", item: groups[next++].group });
			if (i < loose.length) items.push({ type: "fav", item: loose[i] });
		}
		return items;
	}

	// Moves a loose bookmark or a group beside another item in the bookmark row,
	// returning the new `favs` and `favGroups`, or null when nothing can move.
	function reorderFavRow(favs, favGroups, dragged, target) {
		const items = getFavRowItems(favs, favGroups);
		const find = (entry) =>
			items.findIndex((x) => x.type === entry.type && x.item === entry.item);
		const from = find(dragged);
		if (from < 0 || find(target) < 0 || find(dragged) === find(target))
			return null;
		const [moved] = items.splice(from, 1);
		items.splice(find(target) + (target.after ? 1 : 0), 0, moved);

		let looseCount = 0;
		const loose = [];
		const nextGroups = [];
		for (const { type, item } of items) {
			if (type === "fav") {
				loose.push(item);
				looseCount++;
			} else nextGroups.push({ ...item, position: looseCount });
		}
		let next = 0;
		const nextFavs = favs.map((fav) =>
			fav && fav.groupId === -1 ? loose[next++] : fav,
		);
		return { favs: nextFavs, favGroups: nextGroups };
	}

	function createTabFolderId() {
		return `tab-folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	// The tab a bookmark opens as.
	function getFavTab(fav) {
		const url = fav.url + (fav.guildId ? `/${fav.guildId}` : "");
		return {
			url,
			selected: false,
			name: getCurrentName(url),
			currentStatus: getCurrentUserStatus(url),
			channelId:
				fav.channelId || SelectedChannelStore.getChannelId(fav.guildId),
			folderId: null,
		};
	}

	function moveTabIntoFolder(tabs, tabIndex, folderId) {
		const tab = tabs[tabIndex];
		if (!tab) return tabs;
		const remaining = tabs.filter((_, index) => index !== tabIndex);
		const lastIndex = remaining.findLastIndex(
			(item) => (item.folderId ?? null) === folderId,
		);
		remaining.splice(lastIndex < 0 ? remaining.length : lastIndex + 1, 0, {
			...tab,
			folderId,
		});
		return remaining;
	}

	//#region Scroll Memory

	// Each tab remembers where the channel list (left), the chat messages (middle)
	// and the member list (right) were scrolled, and puts them back when you
	// switch to that tab. The state lives on the tab as `tab.scroll`.
	const SCROLL_PANES = {
		channels: [
			'[data-list-id="channels"]',
			'[data-list-id^="private-channels"]',
			'[class*="sidebarList"] [class*="scroller"]',
			'[class*="privateChannels"] [class*="scroller"]',
		],
		messages: [
			'[data-list-id="chat-messages"]',
			'main [class*="messagesWrapper"] [class*="scroller"]',
		],
		members: [
			'[data-list-id^="members"]',
			'[class*="membersWrap"] [class*="scroller"]',
			'[class*="members_"] [class*="scroller"]',
		],
	};
	const SCROLL_RESTORE_MS = { channels: 1500, members: 1500, messages: 2500 };
	let scrollCaptureBlockedUntil = 0;
	let scrollRestoreToken = 0;

	function isScrollable(element) {
		return /auto|scroll|overlay/.test(getComputedStyle(element).overflowY);
	}

	function findScroller(pane) {
		for (const selector of SCROLL_PANES[pane]) {
			let element = document.querySelector(selector);
			while (element && element !== document.body && !isScrollable(element))
				element = element.parentElement;
			if (element && element !== document.body) return element;
		}
		return null;
	}

	function parseScrollLocation(url) {
		const [, , guildKey] = String(url ?? "").split("/");
		return { guildKey: guildKey ?? null, url };
	}

	function getMessageAnchor(scroller) {
		if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 8)
			return { atBottom: true };
		const top = scroller.getBoundingClientRect().top;
		for (const item of scroller.querySelectorAll('[id^="chat-messages-"]')) {
			const rect = item.getBoundingClientRect();
			if (rect.bottom <= top + 1) continue;
			const [, , channelId, messageId] = item.id.split("-");
			if (!channelId || !messageId) continue;
			return { channelId, messageId, offset: rect.top - top };
		}
		return null;
	}

	// Reads the three panes into the selected tab. Mutates the tab in place so
	// scrolling never re-renders the tab bar.
	function captureTabScroll(tabs) {
		if (Date.now() < scrollCaptureBlockedUntil) return false;
		const tab = tabs?.find((item) => item.selected);
		if (!tab || tab.url !== location.pathname) return false;
		const { guildKey, url } = parseScrollLocation(tab.url);
		const scroll = { ...tab.scroll };
		const channels = findScroller("channels");
		if (channels) scroll.channels = { guildKey, top: channels.scrollTop };
		const members = findScroller("members");
		if (members) scroll.members = { guildKey, top: members.scrollTop };
		const messages = findScroller("messages");
		const anchor = messages && getMessageAnchor(messages);
		if (anchor) scroll.messages = { url, ...anchor };
		if (JSON.stringify(scroll) === JSON.stringify(tab.scroll)) return false;
		tab.scroll = scroll;
		return true;
	}

	function applyScrollPane(pane, saved, attempt) {
		const scroller = findScroller(pane);
		if (!scroller || scroller.scrollHeight <= scroller.clientHeight) return;
		if (pane !== "messages") {
			scroller.scrollTop = saved.top;
			return;
		}
		if (saved.atBottom) {
			scroller.scrollTop = scroller.scrollHeight;
			return;
		}
		const item = document.getElementById(
			`chat-messages-${saved.channelId}-${saved.messageId}`,
		);
		if (item) {
			const offset =
				item.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
			scroller.scrollTop += offset - saved.offset;
		} else if (attempt === 6) {
			// The anchor message fell out of Discord's cache, so ask Discord to load it.
			MessageActions?.jumpToMessage?.({
				channelId: saved.channelId,
				messageId: saved.messageId,
				flash: false,
				jumpType: "INSTANT",
			});
		}
	}

	// Discord redraws asynchronously after a navigation, so keep nudging the
	// panes into place until they have content, stopping if the user scrolls.
	function restoreTabScroll(tab) {
		const token = ++scrollRestoreToken;
		const scroll = tab?.scroll;
		const { guildKey } = parseScrollLocation(tab?.url);
		const panes = Object.keys(SCROLL_PANES).filter((pane) => {
			const saved = scroll?.[pane];
			if (!saved) return false;
			return pane === "messages"
				? saved.url === tab.url
				: saved.guildKey === guildKey;
		});
		const started = Date.now();
		const longest = Math.max(
			0,
			...panes.map((pane) => SCROLL_RESTORE_MS[pane]),
		);
		scrollCaptureBlockedUntil = started + longest + 300;
		if (!panes.length) return;

		const stop = () => {
			if (token !== scrollRestoreToken) return;
			scrollRestoreToken++;
			scrollCaptureBlockedUntil = Date.now() + 300;
			cleanup();
		};
		const cleanup = () => {
			window.removeEventListener("wheel", stop, true);
			window.removeEventListener("pointerdown", stop, true);
			window.removeEventListener("keydown", stop, true);
		};
		window.addEventListener("wheel", stop, true);
		window.addEventListener("pointerdown", stop, true);
		window.addEventListener("keydown", stop, true);

		let attempt = 0;
		const tick = () => {
			if (token !== scrollRestoreToken) return cleanup();
			const elapsed = Date.now() - started;
			for (const pane of panes) {
				if (elapsed <= SCROLL_RESTORE_MS[pane])
					applyScrollPane(pane, scroll[pane], attempt);
			}
			attempt++;
			if (elapsed < longest) setTimeout(tick, 100);
			else cleanup();
		};
		setTimeout(tick, 50);
	}

	//#endregion

	// Saved data keeps the plugin's first name, ChannelTabsMac, so settings and
	// tabs carry over. The original ChannelTabs plugin stores its own data under
	// "ChannelTabs".
	const DATA_NAME = "ChannelTabsMac";

	const { ContextMenu, Webpack, React, DOM, UI, Data, Components } = platform;

	function getModule(filter, options = {}) {
		const foundModule = options.fail
			? undefined
			: Webpack.getModule(filter, options);

		if (!foundModule) {
			options.name ??= filter?.__filter;
			missingModule(options);
			if (options.onFail) options.onFail(options);
		}

		return foundModule;
	}

	function getStack() {
		const original = Error.prepareStackTrace;
		Error.prepareStackTrace = (_, stackTraces) => stackTraces;

		const stack = new Error().stack.slice(1);

		Error.prepareStackTrace = original;
		return stack;
	}

	let dismissWarning = null;
	let missingFeatures = [];
	function missingModule({ name = "<unnamed>", feature, fatal = false }) {
		const stack = getStack();
		const index = stack.findIndex(
			(site) => site.getFunctionName() === "getModule",
		);
		const trace = stack.filter((_, i) => i > index).join("\n");
		console.warn(`Could not find '${name}' module.\n${trace}`);
		if (fatal) throw `Could not find '${name}' module.`;
		if (feature != null) {
			missingFeatures.push(feature);

			if (dismissWarning) dismissWarning();
			dismissWarning = platform.notice(
				`ChungusTabs: these features are unavailable: ${missingFeatures.join(", ")}`,
			);
		}
	}

	// Stands in when Discord's unread store can't be found. Nothing listens to it.
	class FakeUnreadStateStore {
		addChangeListener() {}
		removeChangeListener() {}
		getUnreadCount() {
			return 0;
		}
		getMentionCount() {
			return 0;
		}
		isEstimated() {
			return false;
		}
		hasUnread() {
			return false;
		}
	}

	// Hack in some useful debug information into filters
	const Filters = {};
	for (const [key, value] of Object.entries(Webpack.Filters)) {
		Filters[key] = function (...args) {
			const result = value(...args);
			result.__filter = `${key}(${args.map((a) => JSON.stringify(a)).join(", ")})`;
			return result;
		};
	}

	const { byKeys, byStrings, byStoreName } = Filters;
	const NavigationUtils = {
		transitionToGuild: getModule(byKeys("transitionToGuildSync"))
			?.transitionToGuildSync,
		transitionTo: getModule(byStrings("transitionTo - Transitioning to "), {
			searchExports: true,
		}),
	};
	// Guild tabs and bookmarks have no channel in their url, and going straight to
	// /channels/<guildId> leaves the chat pane empty until a channel is clicked.
	// Resolve them to the guild's last-viewed channel the way a server icon click does.
	const navigateToUrl = (url) => {
		const guildId = url.match(/^\/channels\/(\d+)\/?$/)?.[1];
		if (guildId && NavigationUtils.transitionToGuild)
			NavigationUtils.transitionToGuild(
				guildId,
				SelectedChannelStore.getChannelId(guildId),
			);
		else NavigationUtils.transitionTo(url);
	};
	const Permissions = getModule(byKeys("computePermissions"));
	const MessageActions = Webpack.getByKeys("jumpToMessage", "fetchMessages");
	const SelectedChannelStore = getModule(byStoreName("SelectedChannelStore"));
	const SelectedGuildStore = getModule(byStoreName("SelectedGuildStore"));
	const ChannelStore = getModule(byStoreName("ChannelStore"));
	const UserStore = getModule(byStoreName("UserStore"));
	const UserTypingStore = getModule(byStoreName("TypingStore"));
	const RelationshipStore = getModule(byStoreName("RelationshipStore"));
	const GuildStore = getModule(byStoreName("GuildStore"));
	const DiscordConstants = {
		ChannelTypes: getModule(byKeys("GUILD_TEXT"), {
			searchExports: true,
		}),
	};
	// BetterVencord (Vesktop/Vencord) has no BdApi.Components.TextInput.
	const TextInput =
		Components.TextInput ??
		(({ onChange, ...props }) => (
			<input
				{...props}
				className="bd-text-input channelTabs-fallbackInput"
				onChange={(event) => onChange?.(event.target.value)}
			/>
		));
	const Textbox = (props) => (
		<div className="channelTabs-input">
			<TextInput {...props} />
		</div>
	);
	const UnreadStateStore =
		getModule((m) => m.isEstimated, {
			feature: "Unread/Mention Indicators",
		}) ?? new FakeUnreadStateStore();
	const Flux = getModule(byKeys("connectStores"), {
		name: "Flux",
		fatal: true,
	});
	const MutedStore = getModule(byKeys("isMuted", "isChannelMuted"));
	const PermissionUtils = getModule(byKeys("can", "canManageUser"));
	const UserStatusStore = getModule(byStoreName("PresenceStore"));
	const Spinner = getModule((m) => m.Type?.SPINNING_CIRCLE, {
		searchExports: true,
		feature: "Typing Indicators",
	});
	const Tooltip = Components.Tooltip;
	const Slider = getModule(
		byStrings(
			`"[UIKit]Slider.handleMouseDown(): assert failed: domNode nodeType !== Element"`,
		),
		{ searchExports: true },
	);
	const NavShortcuts = getModule(byKeys("NAVIGATE_BACK", "NAVIGATE_FORWARD"));
	const IconUtilities = getModule(byKeys("getChannelIconURL"));

	const standardSidebarView =
		Webpack.getByKeys("standardSidebarView")?.standardSidebarView ?? "";
	const backdropClasses = getModule(byKeys("backdrop", "withLayer"));
	const scrimClasses = getModule(byKeys("scrim"));
	const noDragClasses = [
		standardSidebarView, // Settings view
		backdropClasses?.backdrop, // Anything that has a backdrop
		scrimClasses?.scrim, // Modal scrims
	].filter((x) => x);

	const Icons = {
		XSmallIcon: () => (
			<svg
				aria-hidden="true"
				role="img"
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					fill="var(--interactive-text-default)"
					d="M17.3 18.7a1 1 0 0 0 1.4-1.4L13.42 12l5.3-5.3a1 1 0 0 0-1.42-1.4L12 10.58l-5.3-5.3a1 1 0 0 0-1.4 1.42L10.58 12l-5.3 5.3a1 1 0 1 0 1.42 1.4L12 13.42l5.3 5.3Z"
					class=""
				></path>
			</svg>
		),
		PlusSmallIcon: () => (
			<svg
				aria-hidden="true"
				role="img"
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					fill="var(--interactive-text-default)"
					d="M13 6a1 1 0 1 0-2 0v5H6a1 1 0 1 0 0 2h5v5a1 1 0 1 0 2 0v-5h5a1 1 0 1 0 0-2h-5V6Z"
					class=""
				></path>
			</svg>
		),
		ChevronLargeLeftIcon: () => (
			<svg
				aria-hidden="true"
				role="img"
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					fill="var(--interactive-text-default)"
					d="M15.7 3.3a1 1 0 0 1 0 1.4L8.42 12l7.3 7.3a1 1 0 0 1-1.42 1.4l-8-8a1 1 0 0 1 0-1.4l8-8a1 1 0 0 1 1.42 0Z"
				></path>
			</svg>
		),
		ChevronLargeRightIcon: () => (
			<svg
				aria-hidden="true"
				role="img"
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					fill="var(--interactive-text-default)"
					d="M8.3 3.3a1 1 0 0 0 0 1.4l7.29 7.3-7.3 7.3a1 1 0 1 0 1.42 1.4l8-8a1 1 0 0 0 0-1.4l-8-8a1 1 0 0 0-1.42 0Z"
				></path>
			</svg>
		),
		ChevronDownIcon: () => (
			<svg
				aria-hidden="true"
				role="img"
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					fill="currentColor"
					d="M5.3 9.3a1 1 0 0 1 1.4 0l5.3 5.29 5.3-5.3a1 1 0 1 1 1.4 1.42l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.42Z"
				></path>
			</svg>
		),
	};
	const Close =
		Icons?.XSmallIcon ??
		(() => <div style={{ width: "16px", "text-align": "center" }}>⨯</div>);
	const PlusAlt = Icons?.PlusSmallIcon ?? (() => <b>＋</b>);
	const LeftCaret = Icons?.ChevronLargeLeftIcon ?? (() => <b>{"<"}</b>);
	const RightCaret = Icons?.ChevronLargeRightIcon ?? (() => <b>{">"}</b>);
	const ChevronDown = Icons?.ChevronDownIcon ?? (() => <b>{"▼"}</b>);

	const DefaultUserIconGrey = "https://cdn.discordapp.com/embed/avatars/0.png";
	const DefaultUserIconGreen = "https://cdn.discordapp.com/embed/avatars/1.png";
	const DefaultUserIconBlue = "https://cdn.discordapp.com/embed/avatars/2.png";
	const DefaultUserIconRed = "https://cdn.discordapp.com/embed/avatars/3.png";
	const DefaultUserIconYellow =
		"https://cdn.discordapp.com/embed/avatars/4.png";

	const SettingsMenuIcon = (
		<svg
			class="channelTabs-settingsIcon"
			aria-hidden="false"
			viewBox="0 0 80 80"
		>
			<rect
				fill="var(--interactive-text-default)"
				x="20"
				y="15"
				width="50"
				height="10"
			/>
			<rect
				fill="var(--interactive-text-default)"
				x="20"
				y="35"
				width="50"
				height="10"
			/>
			<rect
				fill="var(--interactive-text-default)"
				x="20"
				y="55"
				width="50"
				height="10"
			/>
		</svg>
	);

	var switching = false;
	var patches = [];

	var currentTabDrag = { index: -1, target: null };
	var currentFolderDrag = { current: null, target: null };
	var tabDropMarked = null;
	var suppressTabClickUntil = 0;

	const TAB_DROP_CLASSES = {
		before: "channelTabs-tabDropBefore",
		after: "channelTabs-tabDropAfter",
		into: "channelTabs-tabDropInto",
	};

	function markTabDrop(element, kind) {
		clearTabDropMarker();
		tabDropMarked = element;
		element.classList.add(TAB_DROP_CLASSES[kind]);
	}

	function clearTabDropMarker() {
		tabDropMarked?.classList.remove(...Object.values(TAB_DROP_CLASSES));
		tabDropMarked = null;
	}

	function endTabDrag() {
		clearTabDropMarker();
		currentTabDrag.index = -1;
		currentTabDrag.target = null;
		currentFolderDrag.current = null;
		currentFolderDrag.target = null;
		document.body.classList.remove("channelTabs-draggingTab");
	}

	// `external` marks a channel dragged in from the sidebar rather than a bookmark
	// already on the bar; its `groupId` is -2 so it counts as coming from outside
	// every group.
	var currentFavDrag = {
		fav: null,
		groupId: null,
		target: null,
		marked: null,
		external: false,
	};
	var suppressFavClickUntil = 0;
	var suppressSidebarClickUntil = 0;
	var endSidebarMouseDrag = null;
	var nativeSidebarDrag = false;

	var currentGroupDrag = { group: null, target: null, marked: null };

	// Where a bookmark or bookmark group being dragged would open as tabs, while
	// the pointer is over the tab bar.
	var favTabDropTarget = null;

	function isDraggingFavToTabs() {
		return (
			Boolean(currentFavDrag.fav && !currentFavDrag.external) ||
			Boolean(currentGroupDrag.group)
		);
	}

	var currentGroupOpened = -1;

	//#endregion

	//#region Context Menu Constructors

	function CreateGuildContextMenuChildren(instance, props, channel) {
		return ContextMenu.buildMenuChildren([
			{
				type: "group",
				items: [
					{
						type: "submenu",
						label: "ChungusTabs",
						items: instance.mergeItems(
							[
								{
									label: "Open channel in new tab",
									action: () =>
										TopBarRef.current &&
										TopBarRef.current.saveChannel(
											props.guild.id,
											channel.id,
											"#" + channel.name,
										),
								},
								{
									label: "Save channel as bookmark",
									action: () =>
										TopBarRef.current &&
										TopBarRef.current.addToFavs(
											"#" + channel.name,
											`/channels/${props.guild.id}/${channel.id}`,
											channel.id,
										),
								},
							],
							[
								{
									label: "Save guild as bookmark",
									action: () =>
										TopBarRef.current &&
										TopBarRef.current.addToFavs(
											props.guild.name,
											`/channels/${props.guild.id}`,
											undefined,
											props.guild.id,
										),
								},
							],
						),
					},
				],
			},
		]);
	}

	function CreateTextChannelContextMenuChildren(instance, props) {
		return ContextMenu.buildMenuChildren([
			{
				type: "group",
				items: [
					{
						type: "submenu",
						label: "ChungusTabs",
						items: instance.mergeItems(
							[
								{
									label: "Open in new tab",
									action: () =>
										TopBarRef.current &&
										TopBarRef.current.saveChannel(
											props.guild.id,
											props.channel.id,
											"#" + props.channel.name,
										),
								},
							],
							[
								{
									label: "Save channel as bookmark",
									action: () =>
										TopBarRef.current &&
										TopBarRef.current.addToFavs(
											"#" + props.channel.name,
											`/channels/${props.guild.id}/${props.channel.id}`,
											props.channel.id,
										),
								},
							],
						),
					},
				],
			},
		]);
	}

	function CreateThreadChannelContextMenuChildren(instance, props) {
		return ContextMenu.buildMenuChildren([
			{
				type: "group",
				items: [
					{
						type: "submenu",
						label: "ChungusTabs",
						items: instance.mergeItems(
							[
								{
									label: "Open in new tab",
									action: () =>
										TopBarRef.current &&
										TopBarRef.current.saveChannel(
											props.channel.guild_id,
											props.channel.id,
											"#" + props.channel.name,
										),
								},
							],
							[
								{
									label: "Save thread as bookmark",
									action: () =>
										TopBarRef.current &&
										TopBarRef.current.addToFavs(
											"#" + props.channel.name,
											`/channels/${props.channel.guild_id}/${props.channel.id}`,
											props.channel.id,
										),
								},
							],
						),
					},
				],
			},
		]);
	}

	function CreateDMContextMenuChildren(instance, props) {
		return ContextMenu.buildMenuChildren([
			{
				type: "group",
				items: [
					{
						type: "submenu",
						label: "ChungusTabs",
						items: instance.mergeItems(
							[
								{
									label: "Open in new tab",
									action: () =>
										TopBarRef.current &&
										TopBarRef.current.saveChannel(
											props.channel.guild_id,
											props.channel.id,
											props.channel.name ||
												RelationshipStore.getNickname(props.user.id) ||
												props.user.globalName,
										),
								},
							],
							[
								{
									label: "Save DM as bookmark",
									action: () =>
										TopBarRef.current &&
										TopBarRef.current.addToFavs(
											props.channel.name ||
												RelationshipStore.getNickname(props.user.id) ||
												props.user.globalName,
											`/channels/@me/${props.channel.id}`,
											props.channel.id,
										),
								},
							],
						),
					},
				],
			},
		]);
	}

	function CreateGroupContextMenuChildren(instance, props) {
		return ContextMenu.buildMenuChildren([
			{
				type: "group",
				items: [
					{
						type: "submenu",
						label: "ChungusTabs",
						items: instance.mergeItems(
							[
								{
									label: "Open in new tab",
									action: () =>
										TopBarRef.current &&
										TopBarRef.current.saveChannel(
											props.channel.guild_id,
											props.channel.id,
											props.channel.name ||
												props.channel.rawRecipients
													.map(
														(u) =>
															RelationshipStore.getNickname(u.id) ||
															u.globalName,
													)
													.join(", "),
										),
								},
							],
							[
								{
									label: "Save bookmark",
									action: () =>
										TopBarRef.current &&
										TopBarRef.current.addToFavs(
											props.channel.name ||
												props.channel.rawRecipients
													.map(
														(u) =>
															RelationshipStore.getNickname(u.id) ||
															u.globalName,
													)
													.join(", "),
											`/channels/@me/${props.channel.id}`,
											props.channel.id,
										),
								},
							],
						),
					},
				],
			},
		]);
	}

	const SIDEBAR_LIST_SELECTOR = [
		'[aria-label="Channels"]',
		'[aria-label="Direct Messages"]',
		'[data-list-id^="channels"]',
		'[data-list-id^="private-channels"]',
		'[class*="sidebarList"]',
	].join(", ");
	// Text, announcement, thread, forum and media channels; not categories or voice.
	const SIDEBAR_CHANNEL_TYPES = new Set([0, 5, 10, 11, 12, 15, 16]);

	// Finds the channel, thread or DM a sidebar element belongs to. Rows are
	// matched by their link, or by the list item id for rows that aren't a link,
	// such as threads under a channel. With `wrapper`, a draggable element around
	// the row works too.
	function getSidebarChannel(element, wrapper = false) {
		if (!(element instanceof Element)) return null;
		const find = (start) => {
			const link = start.closest("a[href]");
			let guildId;
			let channelId;
			let path;
			if (link?.closest(SIDEBAR_LIST_SELECTOR)) {
				const url = new URL(link.href, location.href);
				if (url.origin !== location.origin) return null;
				const match = url.pathname.match(
					/^\/channels\/(\d+|@me)\/(\d+)(?:\/threads\/(\d+))?\/?$/,
				);
				if (!match) return null;
				guildId = match[1];
				channelId = match[3] || match[2];
				path = url.pathname;
			} else {
				const row = start.closest('[data-list-item-id^="channels___"]');
				const rowId = row
					?.getAttribute("data-list-item-id")
					.match(/^channels___(\d+)$/)?.[1];
				const rowChannel = rowId && ChannelStore.getChannel(rowId);
				if (
					!rowChannel?.guild_id ||
					!SIDEBAR_CHANNEL_TYPES.has(rowChannel.type)
				)
					return null;
				guildId = rowChannel.guild_id;
				channelId = rowId;
				path = `/channels/${guildId}/${channelId}`;
			}
			const channel = ChannelStore.getChannel(channelId);
			if (!channel) return null;
			const name =
				guildId === "@me"
					? channel.name || getCurrentName(`/channels/@me/${channelId}`)
					: channel.name
						? `#${channel.name}`
						: getCurrentName(path);
			return { guildId, channelId, name };
		};
		const found = find(element);
		if (found || !wrapper || !element.closest(SIDEBAR_LIST_SELECTOR))
			return found;
		const inner = element.querySelector("a[href], [data-list-item-id]");
		return inner && find(inner);
	}

	// A server row in ChungusServers' server list, which drags natively.
	function getServerListGuild(element) {
		if (!(element instanceof Element)) return null;
		const row = element.closest(
			'.chungusServers-row[data-list-item-id^="guildsnav___"]',
		);
		const guildId = row
			?.getAttribute("data-list-item-id")
			.match(/^guildsnav___(\d+)$/)?.[1];
		const guild = guildId && GuildStore.getGuild(guildId);
		return guild ? { guildId, channelId: null, name: guild.name } : null;
	}

	function getDiscordLink(url) {
		const origin = /^https:\/\/(?:\w+\.)?discord\.com$/.test(location.origin)
			? location.origin
			: "https://discord.com";
		return origin + (url?.startsWith("/") ? url : "/" + (url ?? ""));
	}

	async function copyDiscordLink(url) {
		const link = getDiscordLink(url);
		try {
			if (globalThis.DiscordNative?.clipboard?.copy)
				DiscordNative.clipboard.copy(link);
			else await navigator.clipboard.writeText(link);
			UI.showToast("Link copied", { type: "success" });
		} catch (error) {
			console.error("Could not copy link:", error);
			UI.showToast("Could not copy the link", { type: "error" });
		}
	}

	function CreateTabContextMenu(props, e) {
		ContextMenu.open(
			e,
			ContextMenu.buildMenu([
				{
					type: "group",
					items: mergeLists(
						{
							values: [
								{
									label: "Duplicate",
									action: props.openInNewTab,
								},
								{
									label: "Copy link",
									action: () => copyDiscordLink(props.url),
								},
								{
									label: "Add to favourites",
									action: () =>
										props.addToFavs(props.name, props.url, props.channelId),
								},
								{
									type: "submenu",
									label: "Move to folder",
									items: [
										{
											label: "No folder",
											disabled: !props.folderId,
											action: () => props.moveToFolder(null),
										},
										...props.tabFolders.map((folder) => ({
											label: folder.name,
											disabled: props.folderId === folder.id,
											action: () => props.moveToFolder(folder.id),
										})),
										{ type: "separator" },
										{
											label: "New folder…",
											action: props.createFolderForTab,
										},
									],
								},
								{
									label: "Minimize tab",
									type: "toggle",
									checked: () => props.minimized,
									action: () => props.minimizeTab(props.tabIndex),
								},
							],
						},
						{
							include: props.tabCount > 1,
							values: [
								{
									type: "separator",
								},
								{
									label: "Move left",
									action: props.moveLeft,
								},
								{
									label: "Move right",
									action: props.moveRight,
								},
							],
						},
						{
							include: props.tabCount > 1,
							values: [
								{
									type: "separator",
								},
								{
									type: "submenu",
									label: "Close...",
									id: "closeMenu",
									color: "danger",
									action: () => props.closeTab(props.tabIndex, "single"),
									items: mergeLists(
										{
											values: [
												{
													label: "Close tab",
													action: () =>
														props.closeTab(props.tabIndex, "single"),
													color: "danger",
												},
												{
													label: "Close all other tabs",
													action: () => props.closeTab(props.tabIndex, "other"),
													color: "danger",
												},
											],
										},
										{
											include: props.tabIndex != props.tabCount - 1,
											values: [
												{
													label: "Close all tabs to right",
													action: () => props.closeTab(props.tabIndex, "right"),
													color: "danger",
												},
											],
										},
										{
											include: props.tabIndex != 0,
											values: [
												{
													label: "Close all tabs to left",
													action: () => props.closeTab(props.tabIndex, "left"),
													color: "danger",
												},
											],
										},
									),
								},
							],
						},
					),
				},
			]),
			{
				position: "right",
				align: "top",
			},
		);
	}

	function CreateTabFolderContextMenu(props, e) {
		ContextMenu.open(
			e,
			ContextMenu.buildMenu([
				{
					type: "group",
					items: [
						{
							label: props.folder.collapsed
								? "Expand folder"
								: "Collapse folder",
							action: () => props.toggleFolder(props.folder.id),
						},
						{
							label: "Rename folder",
							action: () => props.renameFolder(props.folder.id),
						},
						{
							label: "Close folder",
							subtext: "Save its tabs to reopen later",
							action: () => props.closeFolder(props.folder.id),
						},
						{ type: "separator" },
						{
							label: "Delete folder (keep tabs)",
							color: "danger",
							action: () => props.deleteFolder(props.folder.id),
						},
					],
				},
			]),
			{ position: "right", align: "top" },
		);
	}

	function CreateFavContextMenu(props, e) {
		ContextMenu.open(
			e,
			ContextMenu.buildMenu([
				{
					type: "group",
					items: mergeLists(
						{
							values: [
								{
									label: "Open in new tab",
									action: props.openInNewTab,
								},
								{
									label: "Rename",
									action: props.rename,
								},
								{
									label: "Minimize favourite",
									type: "toggle",
									checked: () => props.minimized,
									action: () => props.minimizeFav(props.favIndex),
								},
								{
									type: "separator",
								},
							],
						},
						{
							include: props.favCount > 1,
							values: [
								{
									label: "Move left",
									action: props.moveLeft,
								},
								{
									label: "Move right",
									action: props.moveRight,
								},
								{
									type: "separator",
								},
							],
						},
						{
							values: [
								{
									label: "Move To...",
									id: "groupMoveTo",
									type: "submenu",
									items: mergeLists(
										{
											values: [
												{
													label: "Favorites Bar",
													id: "entryNone",
													color: "danger",
													action: () =>
														props.moveToFavGroup(props.favIndex, -1),
												},
												{
													type: "separator",
												},
											],
										},
										{
											values: FavMoveToGroupList({
												favIndex: props.favIndex,
												...props,
											}),
										},
									),
								},
								{
									type: "separator",
								},
							],
						},
						{
							values: [
								{
									label: "Delete",
									action: props.delete,
									color: "danger",
								},
							],
						},
					),
				},
			]),
			{
				position: "right",
				align: "top",
			},
		);
	}

	function CreateFavGroupContextMenu(props, e) {
		ContextMenu.open(
			e,
			ContextMenu.buildMenu([
				{
					type: "group",
					items: mergeLists(
						{
							values: [
								{
									label: "Open all",
									action: () =>
										props.openFavGroupInNewTab(props.favGroup.groupId),
								},
								{
									type: "separator",
								},
							],
						},
						{
							include: props.groupCount > 1,
							values: [
								{
									label: "Move left",
									action: () =>
										props.moveFavGroup(
											props.groupIndex,
											(props.groupIndex + props.groupCount - 1) %
												props.groupCount,
										),
								},
								{
									label: "Move right",
									action: () =>
										props.moveFavGroup(
											props.groupIndex,
											(props.groupIndex + 1) % props.groupCount,
										),
								},
								{
									type: "separator",
								},
							],
						},
						{
							values: [
								{
									label: "Rename",
									id: "renameGroup",
									action: () =>
										props.renameFavGroup(
											props.favGroup.name,
											props.favGroup.groupId,
										),
								},
								{
									type: "separator",
								},
								{
									label: "Delete",
									id: "deleteGroup",
									action: () => props.removeFavGroup(props.favGroup.groupId),
									color: "danger",
								},
							],
						},
					),
				},
			]),
			{
				position: "right",
				align: "top",
			},
		);
	}

	function CreateFavBarContextMenu(props, e) {
		ContextMenu.open(
			e,
			ContextMenu.buildMenu([
				{
					type: "group",
					items: [
						{
							label: "Add current tab as favourite",
							action: () =>
								props.addToFavs(
									getCurrentName(),
									location.pathname,
									SelectedChannelStore.getChannelId(),
								),
						},
						{
							label: "Create a new group...",
							action: props.addFavGroup,
						},
						{
							type: "separator",
						},
						{
							label: "Hide Favorites",
							action: props.hideFavBar,
							color: "danger",
						},
					],
				},
			]),
			{
				position: "right",
				align: "top",
			},
		);
	}

	function CreateTabListContextMenu(props, e) {
		function wrapClose(name) {
			return (...args) => {
				props[name](...args);
				ContextMenu.close();
			};
		}

		const menuItems = props.tabs.map((tab, tabIndex) => {
			const folder = props.tabFolders.find((item) => item.id === tab.folderId);
			return {
				id: `tab-${tabIndex}`,
				render: () => (
					<Tab
						{...tab}
						name={folder ? `${folder.name} / ${tab.name}` : tab.name}
						{...{
							unreadCount: UnreadStateStore.getUnreadCount(tab.channelId),
							unreadEstimated: UnreadStateStore.isEstimated(tab.channelId),
							hasUnread: UnreadStateStore.hasUnread(tab.channelId),
							mentionCount: UnreadStateStore.getMentionCount(tab.channelId),
							hasUsersTyping: isChannelTyping(tab.channelId),
							currentStatus: getCurrentUserStatus(tab.url),
						}}
						{...props}
						switchToTab={wrapClose("switchToTab")}
						closeTab={wrapClose("closeTab")}
						moveToFolder={(folderId) =>
							props.moveTabToFolder(tabIndex, folderId)
						}
						createFolderForTab={() => props.createFolder(tabIndex)}
						tabCount={props.tabs.length}
						tabIndex={tabIndex}
					/>
				),
			};
		});

		ContextMenu.open(e, ContextMenu.buildMenu(menuItems), {
			position: "bottom",
			align: "left",
		});
	}

	function CreateSettingsContextMenu(instance, e) {
		ContextMenu.open(
			e,
			// The menu needs to be wrapped in a component to allow toggles to update properly.
			(props) =>
				ContextMenu.buildMenu([
					{
						type: "group",
						items: mergeLists({
							values: [
								{
									label: pluginMeta.name,
									subtext: "Version " + pluginMeta.version,
									// action: () => {
									// 	UI.showChangelogModal(
									// 		pluginMeta.name,
									// 		pluginMeta.version,
									// 		config.changelog,
									// 	);
									// },
								},
								{
									type: "separator",
								},
								{
									id: "shortcutLabel",
									disabled: true,
									label: "Shortcuts:",
								},
								{
									id: "shortcutLabelKeys",
									disabled: true,
									render: () => {
										return (
											<div
												style={{
													color: "var(--text-muted)",
													padding: "8px",
													"font-size": "12px",
													"white-space": "pre-wrap",
												}}
											>
												{[
													["newTab", "New Tab"],
													["closeTab", "Close Current Tab"],
													["previousTab", "Navigate to Left Tab"],
													["nextTab", "Navigate to Right Tab"],
												]
													.map(
														([id, label]) =>
															`${formatShortcut(getShortcut(instance.props.plugin.settings, id))} - ${label}`,
													)
													.join("\n")}
											</div>
										);
									},
								},
								{
									type: "separator",
								},
								{
									label: "Settings:",
									id: "settingHeader",
									disabled: true,
								},
								{
									type: "separator",
								},
								{
									type: "submenu",
									label: "Startup",
									items: [
										{
											label: "Reopen Last Channel on Startup",
											type: "toggle",
											id: "reopenLastChannel",
											checked: () => TopBarRef.current.state.reopenLastChannel,
											action: () => {
												instance.setState(
													{
														reopenLastChannel:
															!instance.state.reopenLastChannel,
													},
													() => {
														instance.props.plugin.settings.reopenLastChannel =
															!instance.props.plugin.settings.reopenLastChannel;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
									],
								},
								{
									type: "submenu",
									label: "Appearance",
									items: [
										{
											label: "Use Compact Appearance",
											type: "toggle",
											id: "useCompactLook",
											checked: () => TopBarRef.current.state.compactStyle,
											action: () => {
												instance.setState(
													{
														compactStyle: !instance.state.compactStyle,
													},
													() => {
														instance.props.plugin.settings.compactStyle =
															!instance.props.plugin.settings.compactStyle;
														instance.props.plugin.removeStyle();
														instance.props.plugin.applyStyle();
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Wrap Tabs",
											type: "toggle",
											id: "wrapTabs",
											checked: () => TopBarRef.current.state.wrapTabs,
											action: () => {
												instance.setState(
													{
														wrapTabs: !instance.state.wrapTabs,
													},
													() => {
														instance.props.plugin.settings.wrapTabs =
															!instance.props.plugin.settings.wrapTabs;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Privacy Mode",
											type: "toggle",
											id: "privacyMode",
											checked: () => TopBarRef.current.state.privacyMode,
											action: () => {
												instance.setState(
													{
														privacyMode: !instance.state.privacyMode,
													},
													() => {
														instance.props.plugin.settings.privacyMode =
															!instance.props.plugin.settings.privacyMode;
														instance.props.plugin.removeStyle();
														instance.props.plugin.applyStyle();
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Radial Status Indicators",
											type: "toggle",
											id: "radialStatusMode",
											checked: () => TopBarRef.current.state.radialStatusMode,
											action: () => {
												instance.setState(
													{
														radialStatusMode: !instance.state.radialStatusMode,
													},
													() => {
														instance.props.plugin.settings.radialStatusMode =
															!instance.props.plugin.settings.radialStatusMode;
														instance.props.plugin.removeStyle();
														instance.props.plugin.applyStyle();
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											type: "separator",
										},
										{
											label: "Minimum Tab Width",
											style: { "pointer-events": "none" },
										},
										{
											id: "tabWidthMin",
											render: () => {
												return (
													<div className="channelTabs-sliderContainer">
														<Slider
															aria-label="Minimum Tab Width"
															className="channelTabs-slider"
															mini={true}
															orientation="horizontal"
															disabled={false}
															initialValue={
																instance.props.plugin.settings.tabWidthMin
															}
															minValue={50}
															maxValue={220}
															onValueRender={(value) =>
																Math.floor(value / 10) * 10 + "px"
															}
															onValueChange={(value) => {
																(value = Math.floor(value / 10) * 10),
																	(instance.props.plugin.settings.tabWidthMin =
																		value),
																	instance.props.plugin.saveSettings(),
																	instance.props.plugin.applyStyle(
																		"channelTabs-style-constants",
																	);
															}}
														/>
													</div>
												);
											},
										},
										{
											type: "separator",
										},
										{
											label: "Show Tab Bar",
											type: "toggle",
											id: "showTabBar",
											color: "danger",
											checked: () => TopBarRef.current.state.showTabBar,
											action: () => {
												instance.setState(
													{
														showTabBar: !instance.state.showTabBar,
													},
													() => {
														instance.props.plugin.settings.showTabBar =
															!instance.props.plugin.settings.showTabBar;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Fav Bar",
											type: "toggle",
											id: "showFavBar",
											color: "danger",
											checked: () => TopBarRef.current.state.showFavBar,
											action: () => {
												instance.setState(
													{
														showFavBar: !instance.state.showFavBar,
													},
													() => {
														instance.props.plugin.settings.showFavBar =
															!instance.props.plugin.settings.showFavBar;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Quick Settings",
											type: "toggle",
											id: "showQuickSettings",
											color: "danger",
											checked: () => TopBarRef.current.state.showQuickSettings,
											action: () => {
												instance.setState(
													{
														showQuickSettings:
															!instance.state.showQuickSettings,
													},
													() => {
														instance.props.plugin.settings.showQuickSettings =
															!instance.props.plugin.settings.showQuickSettings;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Navigation Buttons",
											type: "toggle",
											id: "showNavButtons",
											checked: () => TopBarRef.current.state.showNavButtons,
											action: () => {
												instance.setState(
													{
														showNavButtons: !instance.state.showNavButtons,
													},
													() => {
														instance.props.plugin.settings.showNavButtons =
															!instance.props.plugin.settings.showNavButtons;
														instance.props.plugin.removeStyle();
														instance.props.plugin.applyStyle();
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
									],
								},
								{
									type: "submenu",
									label: "Behavior",
									items: [
										{
											label: "Always Focus New Tabs",
											type: "toggle",
											id: "alwaysFocusNewTabs",
											checked: () => TopBarRef.current.state.alwaysFocusNewTabs,
											action: () => {
												instance.setState(
													{
														alwaysFocusNewTabs:
															!instance.state.alwaysFocusNewTabs,
													},
													() => {
														instance.props.plugin.settings.alwaysFocusNewTabs =
															!instance.props.plugin.settings
																.alwaysFocusNewTabs;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Primary Forward/Back Navigation",
											type: "toggle",
											id: "useStandardNav",
											checked: () => TopBarRef.current.state.useStandardNav,
											action: () => {
												instance.setState(
													{
														useStandardNav: !instance.state.useStandardNav,
													},
													() => {
														instance.props.plugin.settings.useStandardNav =
															!instance.props.plugin.settings.useStandardNav;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
									],
								},
								{
									type: "submenu",
									label: "Badge Visibility",
									items: [
										{
											type: "separator",
											id: "header1_1",
										},
										{
											label: "Favs:",
											id: "header1_2",
											disabled: true,
										},
										{
											type: "separator",
											id: "header1_3",
										},
										{
											label: "Show Mentions",
											type: "toggle",
											id: "favs_Mentions",
											checked: () =>
												TopBarRef.current.state.showFavMentionBadges,
											action: () => {
												instance.setState(
													{
														showFavMentionBadges:
															!instance.state.showFavMentionBadges,
													},
													() => {
														instance.props.plugin.settings.showFavMentionBadges =
															!instance.props.plugin.settings
																.showFavMentionBadges;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Unreads",
											type: "toggle",
											id: "favs_Unreads",
											checked: () =>
												TopBarRef.current.state.showFavUnreadBadges,
											action: () => {
												instance.setState(
													{
														showFavUnreadBadges:
															!instance.state.showFavUnreadBadges,
													},
													() => {
														instance.props.plugin.settings.showFavUnreadBadges =
															!instance.props.plugin.settings
																.showFavUnreadBadges;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Typing",
											type: "toggle",
											id: "favs_Typing",
											checked: () => TopBarRef.current.state.showFavTypingBadge,
											action: () => {
												instance.setState(
													{
														showFavTypingBadge:
															!instance.state.showFavTypingBadge,
													},
													() => {
														instance.props.plugin.settings.showFavTypingBadge =
															!instance.props.plugin.settings
																.showFavTypingBadge;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Empty Mentions/Unreads",
											type: "toggle",
											id: "favs_Empty",
											checked: () => TopBarRef.current.state.showEmptyFavBadges,
											action: () => {
												instance.setState(
													{
														showEmptyFavBadges:
															!instance.state.showEmptyFavBadges,
													},
													() => {
														instance.props.plugin.settings.showEmptyFavBadges =
															!instance.props.plugin.settings
																.showEmptyFavBadges;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											type: "separator",
											id: "header4_1",
										},
										{
											label: "Fav Groups:",
											id: "header4_2",
											disabled: true,
										},
										{
											type: "separator",
											id: "header4_3",
										},
										{
											label: "Show Mentions",
											type: "toggle",
											id: "favGroups_Mentions",
											checked: () =>
												TopBarRef.current.state.showFavGroupMentionBadges,
											action: () => {
												instance.setState(
													{
														showFavGroupMentionBadges:
															!instance.state.showFavGroupMentionBadges,
													},
													() => {
														instance.props.plugin.settings.showFavGroupMentionBadges =
															!instance.props.plugin.settings
																.showFavGroupMentionBadges;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Unreads",
											type: "toggle",
											id: "favGroups_Unreads",
											checked: () =>
												TopBarRef.current.state.showFavGroupUnreadBadges,
											action: () => {
												instance.setState(
													{
														showFavGroupUnreadBadges:
															!instance.state.showFavGroupUnreadBadges,
													},
													() => {
														instance.props.plugin.settings.showFavGroupUnreadBadges =
															!instance.props.plugin.settings
																.showFavGroupUnreadBadges;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Typing",
											type: "toggle",
											id: "favGroups_Typing",
											checked: () =>
												TopBarRef.current.state.showFavGroupTypingBadge,
											action: () => {
												instance.setState(
													{
														showFavGroupTypingBadge:
															!instance.state.showFavGroupTypingBadge,
													},
													() => {
														instance.props.plugin.settings.showFavGroupTypingBadge =
															!instance.props.plugin.settings
																.showFavGroupTypingBadge;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Empty Mentions/Unreads",
											type: "toggle",
											id: "favGroups_Empty",
											checked: () =>
												TopBarRef.current.state.showEmptyFavGroupBadges,
											action: () => {
												instance.setState(
													{
														showEmptyFavGroupBadges:
															!instance.state.showEmptyFavGroupBadges,
													},
													() => {
														instance.props.plugin.settings.showEmptyFavGroupBadges =
															!instance.props.plugin.settings
																.showEmptyFavGroupBadges;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											type: "separator",
											id: "header2_1",
										},
										{
											label: "Tabs:",
											id: "header2_2",
											disabled: true,
										},
										{
											type: "separator",
											id: "header2_3",
										},
										{
											label: "Show Mentions",
											type: "toggle",
											id: "tabs_Mentions",
											checked: () =>
												TopBarRef.current.state.showTabMentionBadges,
											action: () => {
												instance.setState(
													{
														showTabMentionBadges:
															!instance.state.showTabMentionBadges,
													},
													() => {
														instance.props.plugin.settings.showTabMentionBadges =
															!instance.props.plugin.settings
																.showTabMentionBadges;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Unreads",
											type: "toggle",
											id: "tabs_Unreads",
											checked: () =>
												TopBarRef.current.state.showTabUnreadBadges,
											action: () => {
												instance.setState(
													{
														showTabUnreadBadges:
															!instance.state.showTabUnreadBadges,
													},
													() => {
														instance.props.plugin.settings.showTabUnreadBadges =
															!instance.props.plugin.settings
																.showTabUnreadBadges;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Typing",
											type: "toggle",
											id: "tabs_Typing",
											checked: () => TopBarRef.current.state.showTabTypingBadge,
											action: () => {
												instance.setState(
													{
														showTabTypingBadge:
															!instance.state.showTabTypingBadge,
													},
													() => {
														instance.props.plugin.settings.showTabTypingBadge =
															!instance.props.plugin.settings
																.showTabTypingBadge;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Empty Mentions/Unreads",
											type: "toggle",
											id: "tabs_Empty",
											checked: () => TopBarRef.current.state.showEmptyTabBadges,
											action: () => {
												instance.setState(
													{
														showEmptyTabBadges:
															!instance.state.showEmptyTabBadges,
													},
													() => {
														instance.props.plugin.settings.showEmptyTabBadges =
															!instance.props.plugin.settings
																.showEmptyTabBadges;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											type: "separator",
											id: "header3_1",
										},
										{
											label: "Active Tabs:",
											id: "header3_2",
											disabled: true,
										},
										{
											type: "separator",
											id: "header3_3",
										},
										{
											label: "Show Mentions",
											type: "toggle",
											id: "activeTabs_Mentions",
											checked: () =>
												TopBarRef.current.state.showActiveTabMentionBadges,
											action: () => {
												instance.setState(
													{
														showActiveTabMentionBadges:
															!instance.state.showActiveTabMentionBadges,
													},
													() => {
														instance.props.plugin.settings.showActiveTabMentionBadges =
															!instance.props.plugin.settings
																.showActiveTabMentionBadges;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Unreads",
											type: "toggle",
											id: "activeTabs_Unreads",
											checked: () =>
												TopBarRef.current.state.showActiveTabUnreadBadges,
											action: () => {
												instance.setState(
													{
														showActiveTabUnreadBadges:
															!instance.state.showActiveTabUnreadBadges,
													},
													() => {
														instance.props.plugin.settings.showActiveTabUnreadBadges =
															!instance.props.plugin.settings
																.showActiveTabUnreadBadges;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Typing",
											type: "toggle",
											id: "activeTabs_Typing",
											checked: () =>
												TopBarRef.current.state.showActiveTabTypingBadge,
											action: () => {
												instance.setState(
													{
														showActiveTabTypingBadge:
															!instance.state.showActiveTabTypingBadge,
													},
													() => {
														instance.props.plugin.settings.showActiveTabTypingBadge =
															!instance.props.plugin.settings
																.showActiveTabTypingBadge;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
										{
											label: "Show Empty Mentions/Unreads",
											type: "toggle",
											id: "activeTabs_Empty",
											checked: () =>
												TopBarRef.current.state.showEmptyActiveTabBadges,
											action: () => {
												instance.setState(
													{
														showEmptyActiveTabBadges:
															!instance.state.showEmptyActiveTabBadges,
													},
													() => {
														instance.props.plugin.settings.showEmptyActiveTabBadges =
															!instance.props.plugin.settings
																.showEmptyActiveTabBadges;
														instance.props.plugin.saveSettings();
													},
												);
											},
										},
									],
								},
							],
						}),
					},
				])(props),
			{
				position: "right",
				align: "top",
			},
		);
	}

	//#endregion

	//#region Global Common Functions

	const closeAllDropdowns = () => {
		var dropdowns = document.getElementsByClassName(
			"channelTabs-favGroup-content",
		);
		var i;
		for (i = 0; i < dropdowns.length; i++) {
			var openDropdown = dropdowns[i];
			if (openDropdown.classList.contains("channelTabs-favGroupShow")) {
				openDropdown.classList.remove("channelTabs-favGroupShow");
			}
		}
		currentGroupOpened = -1;
	};

	const mergeLists = (...items) => {
		return items
			.filter((item) => item.include === undefined || item.include)
			.flatMap((item) => item.values);
	};

	const getGuildChannels = (...guildIds) => {
		const channels = ChannelStore.getGuildChannels
			? Object.values(ChannelStore.getGuildChannels())
			: ChannelStore.getMutableGuildChannels
				? Object.values(ChannelStore.getMutableGuildChannels())
				: [];
		return channels.filter(
			(c) =>
				guildIds.includes(c.guild_id) &&
				c.type !== DiscordConstants.ChannelTypes.GUILD_VOICE &&
				c.type !== DiscordConstants.ChannelTypes.GUILD_CATEGORY,
		);
	};

	const updateFavEntry = (fav) => {
		if (fav.guildId) {
			const channelIds = getGuildChannels(fav.guildId)
				.filter(
					(channel) =>
						PermissionUtils.can(Permissions.VIEW_CHANNEL, channel) &&
						!MutedStore.isChannelMuted(channel.guild_id, channel.id),
				)
				.map((channel) => channel.id);
			return {
				unreadCount: channelIds
					.map(
						(id) =>
							UnreadStateStore.getUnreadCount(id) ||
							UnreadStateStore.getMentionCount(id) ||
							(UnreadStateStore.hasUnread(id) ? 1 : 0),
					)
					.reduce((a, b) => a + b, 0),
				unreadEstimated:
					channelIds.some((id) => UnreadStateStore.isEstimated(id)) ||
					channelIds.some(
						(id) =>
							UnreadStateStore.getUnreadCount(id) === 0 &&
							UnreadStateStore.hasUnread(id),
					),
				hasUnread: channelIds.some((id) => UnreadStateStore.hasUnread(id)),
				mentionCount: channelIds
					.map((id) => UnreadStateStore.getMentionCount(id) || 0)
					.reduce((a, b) => a + b, 0),
				selected: SelectedGuildStore.getGuildId() === fav.guildId,
				isTyping: isChannelTyping(fav.channelId),
				currentStatus: getCurrentUserStatus(fav.url),
			};
		} else {
			return {
				unreadCount:
					UnreadStateStore.getUnreadCount(fav.channelId) ||
					UnreadStateStore.getMentionCount(fav.channelId) ||
					(UnreadStateStore.hasUnread(fav.channelId) ? 1 : 0),
				unreadEstimated:
					UnreadStateStore.isEstimated(fav.channelId) ||
					(UnreadStateStore.hasUnread(fav.channelId) &&
						UnreadStateStore.getUnreadCount(fav.channelId) === 0),
				hasUnread: UnreadStateStore.hasUnread(fav.channelId),
				mentionCount: UnreadStateStore.getMentionCount(fav.channelId),
				selected: SelectedChannelStore.getChannelId() === fav.channelId,
				isTyping: isChannelTyping(fav.channelId),
				currentStatus: getCurrentUserStatus(fav.url),
			};
		}
	};

	const getCurrentUserStatus = (pathname = location.pathname) => {
		const cId = (pathname.match(/^\/channels\/(\d+|@me|@favorites)\/(\d+)/) ||
			[])[2];
		if (cId) {
			const channel = ChannelStore.getChannel(cId);
			if (channel?.guild_id) {
				return "none";
			} else if (channel?.isDM()) {
				const user = UserStore.getUser(channel.getRecipientId());
				const status = UserStatusStore.getStatus(user.id);
				return status;
			} else if (channel?.isGroupDM()) {
				return "none";
			}
		}
		return "none";
	};

	const getChannelTypingTooltipText = (userIds) => {
		if (userIds) {
			const usernames = userIds
				.map((userId) => UserStore.getUser(userId))
				.filter((user) => user)
				.map((user) => user.tag);
			const remainingUserCount = userIds.length - usernames.length;
			const text = (() => {
				if (usernames.length === 0) {
					return `${remainingUserCount} user${remainingUserCount > 1 ? "s" : ""}`;
				} else if (userIds.length > 2) {
					const otherCount = usernames.length - 1 + remainingUserCount;
					return `${usernames[0]} and ${otherCount} other${otherCount > 1 ? "s" : ""}`;
				} else if (remainingUserCount === 0) {
					return usernames.join(", ");
				} else {
					return `${usernames.join(", ")} and ${remainingUserCount} other${remainingUserCount > 1 ? "s" : ""}`;
				}
			})();
			return text;
		}
		return "Someone is Typing...";
	};

	const getChannelTypingUsers = (channel_id) => {
		const channel = ChannelStore.getChannel(channel_id);
		const selfId = UserStore.getCurrentUser()?.id;
		if (channel) {
			const userIds = Object.keys(
				UserTypingStore.getTypingUsers(channel_id),
			).filter((uId) => uId !== selfId);
			const typingUsers = [...new Set(userIds)];
			return typingUsers;
		}
		return null;
	};

	const isChannelTyping = (channel_id) => {
		const channel = ChannelStore.getChannel(channel_id);
		const selfId = UserStore.getCurrentUser()?.id;
		if (channel) {
			const userIds = Object.keys(
				UserTypingStore.getTypingUsers(channel_id),
			).filter((uId) => uId !== selfId);
			const typingUsers = [...new Set(userIds)];
			if (typingUsers) return typingUsers.length === 0 ? false : true;
		}
		return false;
	};

	const isChannelDM = (channel_id) => {
		return (() => {
			const c = ChannelStore.getChannel(channel_id);
			return c && (c.isDM() || c.isGroupDM());
		})();
	};

	const getCurrentName = (pathname = location.pathname) => {
		const [_, gId, cId] =
			pathname.match(
				/^\/channels\/(\d+|@me|@favorites)\/\b(\d+|\w+(-\w+)*)\b/,
			) || [];
		if (cId) {
			const channel = ChannelStore.getChannel(cId);
			const guild = GuildStore.getGuild(gId);
			if (channel?.name) return (channel.guildId ? "@" : "#") + channel.name;
			else if (guild?.name) return guild.name;
			else if (channel?.rawRecipients)
				return (
					channel.rawRecipients
						.map((u) =>
							!u.display_name && !u.global_name && u.bot
								? `BOT (@${u.username})`
								: RelationshipStore.getNickname(u.id) ||
									u.display_name ||
									u.global_name ||
									u.username,
						)
						.join(", ") ||
					`${channel.rawRecipients[0].display_name || channel.rawRecipients[0].global_name || channel.rawRecipients[0].username} (@${channel.rawRecipients[0].username})`
				);
			else return pathname;
		} else {
			if (pathname === "/channels/@me") return "Friends";
			else if (pathname.match(/^\/[a-z\-]+$/))
				return pathname
					.substr(1)
					.split("-")
					.map((part) => part.substr(0, 1).toUpperCase() + part.substr(1))
					.join(" ");
			else return pathname;
		}
	};

	const getCurrentIconUrl = (pathname = location.pathname) => {
		try {
			const [_, gId, cId] =
				pathname.match(
					/^\/channels\/(\d+|@me|@favorites)(?:\/\b(\d+|\w+(-\w+)*)\b)?/,
				) || [];
			if (gId) {
				if (cId && gId.startsWith("@")) {
					const channel = ChannelStore.getChannel(cId);
					if (channel.isDM())
						return UserStore.getUser(channel.getRecipientId()).getAvatarURL();
					return IconUtilities.getChannelIconURL(channel);
				} else if (!gId.startsWith("@")) {
					return (
						IconUtilities.getGuildIconURL(GuildStore.getGuild(gId)) ??
						DefaultUserIconGrey
					);
				}
			}
		} catch (error) {
			console.error("Error in getCurrentIconUrl:", error);
		}

		return DefaultUserIconGrey;
	};
	//#endregion

	//#region Tab Definitions

	const GetTabStyles = (viewMode, item) => {
		if (item === "unreadBadge") {
			if (viewMode === "classic") return " channelTabs-classicBadgeAlignment";
			else if (viewMode === "alt") return " channelTabs-badgeAlignLeft";
		} else if (item === "mentionBadge") {
			if (viewMode === "classic") return " channelTabs-classicBadgeAlignment";
			else if (viewMode === "alt") return " channelTabs-badgeAlignRight";
		} else if (item === "typingBadge") {
			if (viewMode === "classic") return " channelTabs-classicBadgeAlignment";
			else if (viewMode === "alt") return " channelTabs-typingBadgeAlignment";
		}
		return "";
	};

	const TabIcon = (props) => (
		<img className="channelTabs-tabIcon" src={getCurrentIconUrl(props.url)} />
	);

	const TabStatus = (props) => (
		<rect
			width={6}
			height={6}
			x={14}
			y={14}
			className={
				"channelTabs-tabStatus" +
				(props.currentStatus == "online" ? " channelTabs-onlineIcon" : "") +
				(props.currentStatus == "idle" ? " channelTabs-idleIcon" : "") +
				(props.currentStatus == "dnd" ? " channelTabs-doNotDisturbIcon" : "") +
				(props.currentStatus == "offline" ? " channelTabs-offlineIcon" : "") +
				(props.currentStatus == "none" ? " channelTabs-noneIcon" : "")
			}
		/>
	);

	const TabName = (props) => (
		<Tooltip text={props.name}>
			{(tooltipProps) => (
				<span {...tooltipProps} className="channelTabs-tabName">
					{props.name}
				</span>
			)}
		</Tooltip>
	);

	const TabClose = (props) =>
		props.tabCount < 2 ? null : (
			<div
				className="channelTabs-closeTab"
				onClick={(e) => {
					e.stopPropagation();
					props.closeTab();
				}}
			>
				<Close />
			</div>
		);

	const TabUnreadBadge = (props) => (
		<div
			className={
				"channelTabs-unreadBadge" +
				(!props.hasUnread ? " channelTabs-noUnread" : "") +
				GetTabStyles(props.viewMode, "unreadBadge")
			}
		>
			{props.unreadCount + (props.unreadEstimated ? "+" : "")}
		</div>
	);

	const TabMentionBadge = (props) => (
		<div
			className={
				"channelTabs-mentionBadge" +
				(props.mentionCount === 0 ? " channelTabs-noMention" : "") +
				GetTabStyles(props.viewMode, "mentionBadge")
			}
		>
			{props.mentionCount}
		</div>
	);

	const TabTypingBadge = ({ viewMode, isTyping, userIds }) => {
		if (isTyping === false || !Spinner) return null;
		const text = getChannelTypingTooltipText(userIds);
		return (
			<div
				className={
					"channelTabs-TypingContainer" + GetTabStyles(viewMode, "typingBadge")
				}
			>
				<Tooltip text={text} position="bottom">
					{(tooltipProps) => (
						<Spinner
							{...tooltipProps}
							type="pulsingEllipsis"
							className={`channelTabs-typingBadge`}
							animated={isTyping}
							style={{
								opacity: 0.7,
							}}
						/>
					)}
				</Tooltip>
			</div>
		);
	};

	const CozyTab = (props) => {
		return (
			<div>
				<svg
					className="channelTabs-tabIconWrapper"
					width="20"
					height="20"
					viewBox="0 0 20 20"
				>
					{props.currentStatus === "none" ? (
						<foreignObject x={0} y={0} width={20} height={20}>
							<TabIcon url={props.url} />
						</foreignObject>
					) : (
						<foreignObject x={0} y={0} width={20} height={20}>
							<TabIcon url={props.url} />
						</foreignObject>
					)}
					{props.currentStatus === "none" ? null : (
						<TabStatus currentStatus={props.currentStatus} />
					)}
				</svg>
				<TabName name={props.name} />
				<div className="channelTabs-gridContainer">
					<div className="channelTabs-gridItemBR">
						{!(props.selected
							? props.showActiveTabTypingBadge
							: props.showTabTypingBadge) ? null : (
							<TabTypingBadge
								viewMode="alt"
								isTyping={props.hasUsersTyping}
								userIds={getChannelTypingUsers(props.channelId)}
							/>
						)}
					</div>
					<div className="channelTabs-gridItemTL">
						{!(props.selected
							? props.showActiveTabUnreadBadges
							: props.showTabUnreadBadges) ? null : !props.channelId ||
						  (ChannelStore.getChannel(props.channelId)?.isPrivate() ??
								true) ? null : !(props.selected
								? props.showEmptyActiveTabBadges
								: props.showEmptyTabBadges) && !props.hasUnread ? null : (
							<TabUnreadBadge
								viewMode="alt"
								unreadCount={props.unreadCount}
								unreadEstimated={props.unreadEstimated}
								hasUnread={props.hasUnread}
								mentionCount={props.mentionCount}
							/>
						)}
					</div>
					<div className="channelTabs-gridItemTR">
						{!(props.selected
							? props.showActiveTabMentionBadges
							: props.showTabMentionBadges) ? null : !(props.selected
								? props.showEmptyActiveTabBadges
								: props.showEmptyTabBadges) &&
						  props.mentionCount === 0 ? null : (
							<TabMentionBadge
								viewMode="alt"
								mentionCount={props.mentionCount}
							/>
						)}
					</div>
					<div className="channelTabs-gridItemBL" />
				</div>
			</div>
		);
	};

	const CompactTab = (props) => {
		return (
			<div>
				<svg
					className="channelTabs-tabIconWrapper"
					width="20"
					height="20"
					viewBox="0 0 20 20"
				>
					{props.currentStatus === "none" ? (
						<foreignObject x={0} y={0} width={20} height={20}>
							<TabIcon url={props.url} />
						</foreignObject>
					) : (
						<foreignObject x={0} y={0} width={20} height={20}>
							<TabIcon url={props.url} />
						</foreignObject>
					)}
					{props.currentStatus === "none" ? null : (
						<TabStatus currentStatus={props.currentStatus} />
					)}
				</svg>
				<TabName name={props.name} />
				{!(props.selected
					? props.showActiveTabTypingBadge
					: props.showTabTypingBadge) ? null : (
					<React.Fragment>
						<TabTypingBadge
							viewMode="classic"
							isTyping={props.hasUsersTyping}
							userIds={getChannelTypingUsers(props.channelId)}
						/>
					</React.Fragment>
				)}
				{!(props.selected
					? props.showActiveTabUnreadBadges
					: props.showTabUnreadBadges) ? null : (
					<React.Fragment>
						{!props.channelId ||
						(ChannelStore.getChannel(props.channelId)?.isPrivate() ??
							true) ? null : !(props.selected
								? props.showEmptyActiveTabBadges
								: props.showEmptyTabBadges) && !props.hasUnread ? null : (
							<TabUnreadBadge
								viewMode="classic"
								unreadCount={props.unreadCount}
								unreadEstimated={props.unreadEstimated}
								hasUnread={props.hasUnread}
								mentionCount={props.mentionCount}
							/>
						)}
					</React.Fragment>
				)}
				{!(props.selected
					? props.showActiveTabMentionBadges
					: props.showTabMentionBadges) ? null : (
					<React.Fragment>
						{!(props.selected
							? props.showEmptyActiveTabBadges
							: props.showEmptyTabBadges) && props.mentionCount === 0 ? null : (
							<TabMentionBadge
								viewMode="classic"
								mentionCount={props.mentionCount}
							/>
						)}
					</React.Fragment>
				)}
			</div>
		);
	};

	const Tab = (props) => (
		<div
			className={
				"channelTabs-tab" +
				(props.selected ? " channelTabs-selected" : "") +
				(props.minimized ? " channelTabs-minimized" : "") +
				(props.hasUnread ? " channelTabs-unread" : "") +
				(props.mentionCount > 0 ? " channelTabs-mention" : "") +
				(props.folderId ? " channelTabs-inFolder" : "") +
				(props.inActiveFolder ? " channelTabs-inActiveFolder" : "") +
				(props.folderEnd ? " channelTabs-folderEnd" : "")
			}
			ref={props.ref}
			data-mention-count={props.mentionCount}
			data-unread-count={props.unreadCount}
			data-unread-estimated={props.unreadEstimated}
			onClick={() => {
				if (Date.now() < suppressTabClickUntil) return;
				if (!props.selected) props.switchToTab(props.tabIndex);
			}}
			onMouseUp={(e) => {
				if (e.button !== 1) return;
				e.preventDefault();
				props.closeTab(props.tabIndex);
			}}
			onContextMenu={(e) => {
				CreateTabContextMenu(props, e);
			}}
			onMouseMove={(e) => {
				const folderDrag = currentFolderDrag.current;
				const favDrag = isDraggingFavToTabs();
				if (!folderDrag && !favDrag && currentTabDrag.index === -1) return;
				const rect = e.currentTarget.getBoundingClientRect();
				const after = e.clientX > rect.left + rect.width / 2;
				if (favDrag) {
					favTabDropTarget = { type: "tab", index: props.tabIndex, after };
					markTabDrop(e.currentTarget, after ? "after" : "before");
					return;
				}
				const target = { type: "tab", index: props.tabIndex, after };
				if (
					folderDrag
						? props.folderId === folderDrag
						: currentTabDrag.index === props.tabIndex
				) {
					if (folderDrag) currentFolderDrag.target = null;
					else currentTabDrag.target = null;
					clearTabDropMarker();
					return;
				}
				if (folderDrag) currentFolderDrag.target = target;
				else currentTabDrag.target = target;
				markTabDrop(e.currentTarget, after ? "after" : "before");
			}}
			onMouseDown={(e) => {
				if (e.button !== 0) return;
				const startX = e.clientX;
				const startY = e.clientY;
				const moving = (event) => {
					if (Math.hypot(event.clientX - startX, event.clientY - startY) < 8)
						return;
					currentTabDrag.index = props.tabIndex;
					currentTabDrag.target = null;
					suppressTabClickUntil = Date.now() + 1e3;
					document.body.classList.add("channelTabs-draggingTab");
					document.removeEventListener("mousemove", moving);
				};
				const releasing = () => {
					document.removeEventListener("mousemove", moving);
					document.removeEventListener("mouseup", releasing, true);
					window.removeEventListener("blur", releasing);
					const { index, target } = currentTabDrag;
					const dragged = index === props.tabIndex;
					endTabDrag();
					if (!dragged) return;
					suppressTabClickUntil = Date.now() + 100;
					if (target?.type === "tab")
						props.moveTabTo(index, target.index, target.after);
					else if (target?.type === "folder")
						props.moveTabToFolder(index, target.id);
				};
				document.addEventListener("mousemove", moving);
				document.addEventListener("mouseup", releasing, true);
				window.addEventListener("blur", releasing);
			}}
		>
			{props.compactStyle ? CompactTab(props) : CozyTab(props)}
			<TabClose
				tabCount={props.tabCount}
				closeTab={() => props.closeTab(props.tabIndex)}
			/>
		</div>
	);

	const TabFolder = (props) => {
		const selectedTab = props.tabs.find(({ tab }) => tab.selected)?.tab;
		const suppressClickUntil = React.useRef(0);
		return (
			<div
				className={
					"channelTabs-tabFolder" +
					(selectedTab ? " channelTabs-tabFolderSelected" : "") +
					(props.folder.collapsed || !props.tabs.length
						? ""
						: selectedTab
							? " channelTabs-tabFolderActive"
							: " channelTabs-tabFolderOpen")
				}
				role="button"
				tabIndex={0}
				aria-label={`${props.folder.name}, ${props.tabs.length} tabs, ${props.folder.collapsed ? "collapsed" : "expanded"}`}
				title={
					selectedTab ? `Current tab: ${selectedTab.name}` : props.folder.name
				}
				onClick={() => {
					if (Date.now() < suppressClickUntil.current) return;
					props.toggleFolder(props.folder.id);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						props.toggleFolder(props.folder.id);
					}
				}}
				onContextMenu={(e) => CreateTabFolderContextMenu(props, e)}
				onMouseDown={(e) => {
					if (e.button !== 0) return;
					const startX = e.clientX;
					const startY = e.clientY;
					const moving = (event) => {
						if (Math.hypot(event.clientX - startX, event.clientY - startY) < 8)
							return;
						currentFolderDrag.current = props.folder.id;
						currentFolderDrag.target = null;
						suppressClickUntil.current = Date.now() + 1e3;
						document.body.classList.add("channelTabs-draggingTab");
						document.removeEventListener("mousemove", moving);
					};
					const releasing = () => {
						document.removeEventListener("mousemove", moving);
						document.removeEventListener("mouseup", releasing, true);
						window.removeEventListener("blur", releasing);
						const { current, target } = currentFolderDrag;
						const dragged = current === props.folder.id;
						endTabDrag();
						if (!dragged) return;
						suppressClickUntil.current = Date.now() + 100;
						if (target) {
							const { after, ...rest } = target;
							props.moveFolder(props.folder.id, rest, after);
						}
					};
					document.addEventListener("mousemove", moving);
					document.addEventListener("mouseup", releasing, true);
					window.addEventListener("blur", releasing);
				}}
				onMouseMove={(e) => {
					if (currentFolderDrag.current) {
						if (currentFolderDrag.current === props.folder.id) {
							currentFolderDrag.target = null;
							clearTabDropMarker();
							return;
						}
						const rect = e.currentTarget.getBoundingClientRect();
						const after = e.clientX > rect.left + rect.width / 2;
						currentFolderDrag.target = {
							type: "folder",
							id: props.folder.id,
							after,
						};
						markTabDrop(e.currentTarget, after ? "after" : "before");
					} else if (currentTabDrag.index !== -1) {
						currentTabDrag.target = { type: "folder", id: props.folder.id };
						markTabDrop(e.currentTarget, "into");
					} else if (isDraggingFavToTabs()) {
						favTabDropTarget = { type: "folder", id: props.folder.id };
						markTabDrop(e.currentTarget, "into");
					}
				}}
			>
				<span aria-hidden="true">{props.folder.collapsed ? "▸" : "▾"}</span>
				<span className="channelTabs-tabFolderName">{props.folder.name}</span>
				<span className="channelTabs-tabFolderCount">{props.tabs.length}</span>
			</div>
		);
	};

	//#endregion

	//#region Fav Definitions

	const FavMoveToGroupList = (props) => {
		var groups = props.favGroups.map((group, index) => {
			var entry = {
				label: group.name,
				id: "entry" + index,
				action: () => props.moveToFavGroup(props.favIndex, group.groupId),
			};

			return entry;
		});

		if (groups.length === 0) {
			return [
				{
					label: "No groups",
					disabled: true,
				},
			];
		}

		return groups;
	};

	const FavIcon = (props) => (
		<img className="channelTabs-favIcon" src={getCurrentIconUrl(props.url)} />
	);

	const FavStatus = (props) => (
		<rect
			width={6}
			height={6}
			x={14}
			y={14}
			className={
				"channelTabs-favStatus" +
				(props.currentStatus == "online" ? " channelTabs-onlineIcon" : "") +
				(props.currentStatus == "idle" ? " channelTabs-idleIcon" : "") +
				(props.currentStatus == "dnd" ? " channelTabs-doNotDisturbIcon" : "") +
				(props.currentStatus == "offline" ? " channelTabs-offlineIcon" : "") +
				(props.currentStatus == "none" ? " channelTabs-noneIcon" : "")
			}
		/>
	);

	const FavName = (props) => (
		<span className="channelTabs-favName">{props.name}</span>
	);

	const FavUnreadBadge = (props) => (
		<div
			className={
				"channelTabs-unreadBadge" +
				(!props.hasUnread ? " channelTabs-noUnread" : "")
			}
		>
			{props.unreadCount + (props.unreadEstimated ? "+" : "")}
		</div>
	);

	const FavMentionBadge = (props) => (
		<div
			className={
				"channelTabs-mentionBadge" +
				(props.mentionCount === 0 ? " channelTabs-noMention" : "")
			}
		>
			{props.mentionCount}
		</div>
	);

	const FavTypingBadge = ({ isTyping, userIds }) => {
		if (!Spinner) return null;
		const text = getChannelTypingTooltipText(userIds);
		return (
			<Tooltip text={text} position="bottom">
				{(tooltipProps) => (
					<div
						{...tooltipProps}
						className={
							"channelTabs-typingBadge" +
							(!isTyping ? " channelTabs-noTyping" : "")
						}
					>
						<Spinner
							type="pulsingEllipsis"
							animated={!isTyping ? false : true}
						/>
					</div>
				)}
			</Tooltip>
		);
	};

	function clearFavDropMarker() {
		for (const drag of [currentFavDrag, currentGroupDrag]) {
			drag.marked?.classList.remove(
				"channelTabs-favDropBefore",
				"channelTabs-favDropAfter",
				"channelTabs-favDropVertical",
				"channelTabs-favDropInto",
			);
			drag.marked = null;
		}
	}

	function endFavDrag() {
		clearFavDropMarker();
		currentFavDrag.fav = null;
		currentFavDrag.groupId = null;
		currentFavDrag.target = null;
		currentFavDrag.external = false;
		currentGroupDrag.group = null;
		currentGroupDrag.target = null;
		if (favTabDropTarget) clearTabDropMarker();
		favTabDropTarget = null;
		document.body.classList.remove("channelTabs-draggingFav");
	}

	// Marks where a dragged bookmark would land when the pointer is over `props`'s bookmark.
	function hoverFav(e, props) {
		const drag = currentFavDrag;
		const loose = props.groupId === -1;
		if (currentGroupDrag.group && loose) {
			// A group being dragged can land beside any loose bookmark.
			const box = e.currentTarget.getBoundingClientRect();
			const after = e.clientX > box.left + box.width / 2;
			currentGroupDrag.target = { type: "fav", item: props.favItem, after };
			clearFavDropMarker();
			currentGroupDrag.marked = e.currentTarget;
			e.currentTarget.classList.add(
				after ? "channelTabs-favDropAfter" : "channelTabs-favDropBefore",
			);
			return;
		}
		if (!drag.fav || drag.fav === props.favItem) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const vertical = e.currentTarget.parentElement?.classList.contains(
			"channelTabs-favGroup-content",
		);
		const after = vertical
			? e.clientY > rect.top + rect.height / 2
			: e.clientX > rect.left + rect.width / 2;
		drag.target = { type: "fav", item: props.favItem, after };
		// Landing among the loose bookmarks takes a grouped one out of its group;
		// landing in another group's open list puts it in that group.
		if (drag.groupId !== props.groupId) {
			if (props.groupId === -1) drag.target.outOfGroup = true;
			else drag.target.intoGroup = props.groupId;
		}
		clearFavDropMarker();
		drag.marked = e.currentTarget;
		e.currentTarget.classList.add(
			after ? "channelTabs-favDropAfter" : "channelTabs-favDropBefore",
		);
		if (vertical) e.currentTarget.classList.add("channelTabs-favDropVertical");
	}

	// A native drag only drops where the dragover is cancelled, so this does that
	// for a sidebar channel being dragged in, and reports whether one is.
	function allowExternalFavDrop(e) {
		if (!currentFavDrag.external) return false;
		e.preventDefault();
		return true;
	}

	// Lets a native sidebar drag drop on the bookmark bar; see sidebarDragStartedHandler.
	function allowSidebarDropOnBar(e) {
		if (
			!currentFavDrag.external ||
			!(e.target instanceof Element) ||
			!e.target.closest(".channelTabs-favContainer") ||
			!e.dataTransfer
		)
			return;
		e.preventDefault();
		const allowed = e.dataTransfer.effectAllowed;
		e.dataTransfer.dropEffect = /copy|all|uninitialized/i.test(allowed)
			? "copy"
			: /move/i.test(allowed)
				? "move"
				: "link";
	}

	function stopAllowingSidebarDrop() {
		for (const type of ["dragenter", "dragover"])
			window.removeEventListener(type, allowSidebarDropOnBar);
	}

	// Starts dragging a sidebar channel, thread or DM, or a server from
	// ChungusServers, towards the bookmark bar.
	function beginSidebarDrag({ guildId, channelId, name }) {
		currentFavDrag.fav = channelId
			? { name, url: `/channels/${guildId}/${channelId}`, channelId }
			: { name, url: `/channels/${guildId}`, guildId };
		currentFavDrag.groupId = -2;
		currentFavDrag.target = null;
		currentFavDrag.external = true;
		document.body.classList.add("channelTabs-draggingFav");
	}

	const Fav = (props) => (
		<div
			className={
				"channelTabs-fav" +
				(props.channelId
					? " channelTabs-channel"
					: props.guildId
						? " channelTabs-guild"
						: "") +
				(props.selected ? " channelTabs-selected" : "") +
				(props.minimized ? " channelTabs-minimized" : "") +
				(props.hasUnread ? " channelTabs-unread" : "") +
				(props.mentionCount > 0 ? " channelTabs-mention" : "")
			}
			data-mention-count={props.mentionCount}
			data-unread-count={props.unreadCount}
			data-unread-estimated={props.unreadEstimated}
			onClick={(e) => {
				if (Date.now() < suppressFavClickUntil) return;
				if (
					props.showTabBar &&
					matchesClickShortcut(e, props.getTabOpenShortcut())
				) {
					e.preventDefault();
					e.stopPropagation();
					props.openInNewTab();
					return;
				}
				if (props.guildId)
					NavigationUtils.transitionToGuild(
						props.guildId,
						SelectedChannelStore.getChannelId(props.guildId),
					);
				else navigateToUrl(props.url);
			}}
			onMouseUp={(e) => {
				if (e.button !== 1) return;
				e.preventDefault();
				props.openInNewTab();
			}}
			onContextMenu={(e) => {
				CreateFavContextMenu(props, e);
			}}
			onMouseOver={(e) => hoverFav(e, props)}
			onDragEnter={allowExternalFavDrop}
			onDragOver={(e) => {
				if (allowExternalFavDrop(e)) hoverFav(e, props);
			}}
			onMouseDown={(e) => {
				if (e.button !== 0) return;
				const startX = e.clientX;
				const startY = e.clientY;
				const moving = (event) => {
					if (Math.hypot(event.clientX - startX, event.clientY - startY) < 8)
						return;
					currentFavDrag.fav = props.favItem;
					currentFavDrag.groupId = props.groupId;
					currentFavDrag.target = null;
					suppressFavClickUntil = Date.now() + 1e3;
					document.body.classList.add("channelTabs-draggingFav");
					document.removeEventListener("mousemove", moving);
				};
				const releasing = () => {
					document.removeEventListener("mousemove", moving);
					document.removeEventListener("mouseup", releasing, true);
					window.removeEventListener("blur", releasing);
					const { fav, target } = currentFavDrag;
					const tabTarget = favTabDropTarget;
					const dragged = fav === props.favItem;
					endFavDrag();
					if (dragged) {
						suppressFavClickUntil = Date.now() + 100;
						if (tabTarget) props.openFavsAsTabs([fav], tabTarget);
						else if (target?.intoGroup !== undefined)
							props.moveFavIntoGroup(
								fav,
								target.intoGroup,
								target.item,
								target.after,
							);
						else if (target?.outOfGroup)
							props.moveFavOutOfGroup(
								fav,
								target.type === "end" ? null : target,
							);
						else if (target && props.groupId === -1)
							props.moveRowItem({ type: "fav", item: fav }, target);
						else if (target) props.moveFavTo(fav, target.item, target.after);
					}
				};
				document.addEventListener("mousemove", moving);
				document.addEventListener("mouseup", releasing, true);
				window.addEventListener("blur", releasing);
			}}
		>
			<svg
				className="channelTabs-favIconWrapper"
				width="20"
				height="20"
				viewBox="0 0 20 20"
			>
				{props.currentStatus === "none" ? (
					<foreignObject x={0} y={0} width={20} height={20}>
						<FavIcon url={props.url} />
					</foreignObject>
				) : (
					<foreignObject x={0} y={0} width={20} height={20}>
						<FavIcon url={props.url} />
					</foreignObject>
				)}
				{props.currentStatus === "none" ? null : (
					<FavStatus currentStatus={props.currentStatus} />
				)}
			</svg>
			<FavName name={props.name} />
			{!(
				props.showFavUnreadBadges &&
				(props.channelId || props.guildId)
			) ? null : (
				<React.Fragment>
					{isChannelDM(props.channelId) ? null : !props.showEmptyFavBadges &&
					  props.unreadCount === 0 ? null : (
						<FavUnreadBadge
							unreadCount={props.unreadCount}
							unreadEstimated={props.unreadEstimated}
							hasUnread={props.hasUnread}
						/>
					)}
				</React.Fragment>
			)}
			{!(
				props.showFavMentionBadges &&
				(props.channelId || props.guildId)
			) ? null : (
				<React.Fragment>
					{!props.showEmptyFavBadges && props.mentionCount === 0 ? null : (
						<FavMentionBadge mentionCount={props.mentionCount} />
					)}
				</React.Fragment>
			)}
			{!(
				props.showFavTypingBadge &&
				(props.channelId || props.guildId)
			) ? null : (
				<React.Fragment>
					<FavTypingBadge
						isTyping={props.isTyping}
						userIds={getChannelTypingUsers(props.channelId)}
					/>
				</React.Fragment>
			)}
		</div>
	);

	//#endregion

	//#region Misc. Definitions

	const NewTab = (props) => (
		<div className="channelTabs-newTab" onClick={props.openNewTab}>
			<PlusAlt />
		</div>
	);

	const NewTabFolder = (props) => (
		<div
			className="channelTabs-newTabFolder"
			role="button"
			tabIndex={0}
			title="New tab folder"
			aria-label="New tab folder"
			onClick={props.createFolder}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					props.createFolder();
				}
			}}
		>
			<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
				<path
					fill="currentColor"
					d="M10 4 12 6h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6Zm1 7v2H8v2h3v3h2v-3h3v-2h-3v-2h-2Z"
				/>
			</svg>
		</div>
	);

	function CreateSavedFoldersMenu(props, e) {
		const tabCount = (folder) =>
			folder.tabs.length === 1 ? "1 tab" : `${folder.tabs.length} tabs`;
		ContextMenu.open(
			e,
			ContextMenu.buildMenu([
				{
					type: "group",
					items: props.closedFolders.map((folder) => ({
						label: folder.name,
						subtext: tabCount(folder),
						action: () => props.reopenFolder(folder.id),
					})),
				},
				{
					type: "group",
					items: [
						{
							label: "Forget saved folder",
							color: "danger",
							type: "submenu",
							items: props.closedFolders.map((folder) => ({
								label: folder.name,
								subtext: tabCount(folder),
								color: "danger",
								action: () => props.forgetFolder(folder.id),
							})),
						},
					],
				},
			]),
			{ position: "bottom", align: "left" },
		);
	}

	const SavedTabFolders = (props) =>
		props.closedFolders.length ? (
			<div
				className="channelTabs-savedFolders"
				role="button"
				tabIndex={0}
				title="Saved folders"
				aria-label={`Saved folders, ${props.closedFolders.length}`}
				onClick={(e) => CreateSavedFoldersMenu(props, e)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						CreateSavedFoldersMenu(props, e);
					}
				}}
			>
				<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
					<path
						fill="currentColor"
						d="M10 4 12 6h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6Zm-3 7v2h10v-2H7Zm0 4v2h7v-2H7Z"
					/>
				</svg>
				<span className="channelTabs-savedFoldersCount">
					{props.closedFolders.length}
				</span>
			</div>
		) : null;

	const TabListDropdown = (props) => (
		<div
			className="channelTabs-tabListDropdown"
			onClick={(e) => CreateTabListContextMenu(props, e)}
			title="Show all tabs"
		>
			<ChevronDown />
		</div>
	);

	//#endregion

	//#region FavItems/FavFolders Definitions

	const NoFavItemsPlaceholder = (props) => (
		<span className="channelTabs-noFavNotice">
			You don't have any favs yet. Right click a tab to mark it as favourite.
			You can disable this bar in the settings.
		</span>
	);

	const FavItems = (props) => {
		var isDefault = props.group === null;
		var looseOrdinal = -1;

		return props.favs
			.filter((item) => item)
			.map((fav, favIndex) => {
				var canCreate = isDefault
					? fav.groupId === -1
					: fav.groupId === props.group.groupId;
				// `range` limits the loose bookmarks drawn to one stretch of the row.
				if (isDefault && canCreate) {
					looseOrdinal++;
					if (
						props.range &&
						(looseOrdinal < props.range[0] || looseOrdinal >= props.range[1])
					)
						canCreate = false;
				}
				return canCreate
					? React.createElement(
							Flux.connectStores(
								[UnreadStateStore, UserTypingStore, SelectedChannelStore],
								() => updateFavEntry(fav),
							)((result) => (
								<Fav
									name={fav.name}
									url={fav.url}
									favCount={props.favs.length}
									favGroups={props.favGroups}
									rename={() => props.rename(fav.name, favIndex)}
									delete={() => props.delete(favIndex)}
									openInNewTab={() => props.openInNewTab(fav)}
									moveLeft={() =>
										props.move(
											favIndex,
											(favIndex + props.favs.length - 1) % props.favs.length,
										)
									}
									moveRight={() =>
										props.move(favIndex, (favIndex + 1) % props.favs.length)
									}
									minimizeFav={props.minimizeFav}
									minimized={fav.minimized}
									moveToFavGroup={props.moveToFavGroup}
									moveFav={props.move}
									moveFavTo={props.moveTo}
									moveRowItem={props.moveRowItem}
									moveFavIntoGroup={props.moveFavIntoGroup}
									moveFavOutOfGroup={props.moveFavOutOfGroup}
									openFavsAsTabs={props.openFavsAsTabs}
									favItem={fav}
									favIndex={favIndex}
									channelId={fav.channelId}
									guildId={fav.guildId}
									groupId={fav.groupId}
									showTabBar={props.showTabBar}
									getTabOpenShortcut={props.getTabOpenShortcut}
									showFavUnreadBadges={props.showFavUnreadBadges}
									showFavMentionBadges={props.showFavMentionBadges}
									showFavTypingBadge={props.showFavTypingBadge}
									showEmptyFavBadges={props.showEmptyFavBadges}
									isTyping={isChannelTyping(fav.channelId)}
									currentStatus={getCurrentUserStatus(fav.url)}
									{...result}
								/>
							)),
						)
					: null;
			});
	};

	const FolderIcon = () => (
		<svg
			className="channelTabs-favGroupIcon"
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 24 24"
		>
			<path
				fill="currentColor"
				d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z"
			/>
		</svg>
	);

	// Marks where a dragged bookmark or group would land when the pointer is over a group.
	function hoverFavFolder(e, props) {
		if (e.target.closest?.(".channelTabs-favGroup-content")) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const fav = currentFavDrag.fav;
		const middle =
			Math.abs(e.clientX - (rect.left + rect.width / 2)) <= rect.width / 4;
		// A bookmark dropped on the middle of a group goes into it; dropped on
		// the group's edges it lands beside the group instead.
		if (fav && middle) {
			if (currentFavDrag.groupId === props.favGroup.groupId) return;
			currentFavDrag.target = {
				type: "into",
				intoGroup: props.favGroup.groupId,
			};
			clearFavDropMarker();
			currentFavDrag.marked = e.currentTarget;
			e.currentTarget.classList.add("channelTabs-favDropInto");
			return;
		}
		const drag = currentGroupDrag.group
			? currentGroupDrag
			: currentFavDrag.fav
				? currentFavDrag
				: null;
		if (!drag || drag.group === props.favGroup) return;
		const after = e.clientX > rect.left + rect.width / 2;
		drag.target = { type: "group", item: props.favGroup, after };
		if (drag === currentFavDrag && drag.groupId !== -1)
			drag.target.outOfGroup = true;
		clearFavDropMarker();
		drag.marked = e.currentTarget;
		e.currentTarget.classList.add(
			after ? "channelTabs-favDropAfter" : "channelTabs-favDropBefore",
		);
	}

	const FavFolder = (props) => (
		<div
			className="channelTabs-favGroup"
			onContextMenu={(e) => {
				CreateFavGroupContextMenu(props, e);
			}}
			onMouseLeave={() => {
				if (
					currentFavDrag.target?.intoGroup !== props.favGroup.groupId ||
					currentFavDrag.target.type !== "into"
				)
					return;
				currentFavDrag.target = null;
				clearFavDropMarker();
			}}
			onMouseOver={(e) => hoverFavFolder(e, props)}
			onDragEnter={allowExternalFavDrop}
			onDragOver={(e) => {
				if (allowExternalFavDrop(e)) hoverFavFolder(e, props);
			}}
			onMouseDown={(e) => {
				// Only the group's label starts a drag; presses inside its open list belong to the bookmarks.
				if (e.button !== 0 || !e.target.closest?.(".channelTabs-favGroupBtn"))
					return;
				const startX = e.clientX;
				const startY = e.clientY;
				const moving = (event) => {
					if (Math.hypot(event.clientX - startX, event.clientY - startY) < 8)
						return;
					closeAllDropdowns();
					currentGroupDrag.group = props.favGroup;
					currentGroupDrag.target = null;
					suppressFavClickUntil = Date.now() + 1e3;
					document.body.classList.add("channelTabs-draggingFav");
					document.removeEventListener("mousemove", moving);
				};
				const releasing = () => {
					document.removeEventListener("mousemove", moving);
					document.removeEventListener("mouseup", releasing, true);
					window.removeEventListener("blur", releasing);
					const { group, target } = currentGroupDrag;
					const tabTarget = favTabDropTarget;
					const dragged = group === props.favGroup;
					endFavDrag();
					if (dragged) {
						suppressFavClickUntil = Date.now() + 100;
						if (tabTarget)
							props.openFavsAsTabs(
								props.favs.filter(
									(fav) => fav && fav.groupId === group.groupId,
								),
								tabTarget,
								group,
							);
						else if (target)
							props.moveRowItem({ type: "group", item: group }, target);
					}
				};
				document.addEventListener("mousemove", moving);
				document.addEventListener("mouseup", releasing, true);
				window.addEventListener("blur", releasing);
			}}
		>
			<div
				className="channelTabs-favGroupBtn"
				onClick={() => {
					if (Date.now() < suppressFavClickUntil) return;
					const content = document.getElementById(
						"favGroup-content-" + props.groupIndex,
					);
					const wasOpen = content?.classList.contains(
						"channelTabs-favGroupShow",
					);
					closeAllDropdowns();
					if (!content || wasOpen) return;
					content.classList.add("channelTabs-favGroupShow");
					currentGroupOpened = props.groupIndex;
				}}
			>
				<FolderIcon />
				<span className="channelTabs-favGroupName">{props.favGroup.name}</span>
				{props.showFavGroupMentionBadges ? (
					props.mentionCountGroup == 0 &&
					!props.showEmptyFavGroupBadges ? null : (
						<FavMentionBadge mentionCount={props.mentionCountGroup} />
					)
				) : null}
				{props.showFavGroupUnreadBadges ? (
					props.unreadCountGroup == 0 &&
					!props.showEmptyFavGroupBadges ? null : (
						<FavUnreadBadge
							unreadCount={props.unreadCountGroup}
							unreadEstimated={props.unreadEstimatedGroup}
							hasUnread={props.hasUnreadGroup}
						/>
					)
				) : null}
				{props.showFavGroupTypingBadge && props.isTypingGroup ? (
					<FavTypingBadge isTyping={props.isTypingGroup} userIds={null} />
				) : null}
			</div>
			<div
				className={
					"channelTabs-favGroup-content" +
					(currentGroupOpened === props.groupIndex
						? " channelTabs-favGroupShow"
						: "")
				}
				id={"favGroup-content-" + props.groupIndex}
			>
				<FavItems group={props.favGroup} {...props} />
			</div>
		</div>
	);

	const FavFolders = (props) => {
		return props.favGroups.map((favGroup, index) => {
			if (props.only && props.only !== favGroup) return null;
			return React.createElement(
				Flux.connectStores(
					[UnreadStateStore, SelectedChannelStore, UserTypingStore],
					() => {
						var unreadCount = 0;
						var unreadEstimated = 0;
						var hasUnread = false;
						var mentionCount = 0;
						var isTyping = false;

						props.favs
							.filter((item) => item)
							.forEach((fav, favIndex) => {
								var canCreate = fav.groupId === favGroup.groupId;
								if (canCreate) {
									var hasUnreads = isChannelDM(fav.channelId);
									var result = updateFavEntry(fav);
									if (!hasUnreads) unreadCount += result.unreadCount;
									mentionCount += result.mentionCount;
									if (!hasUnreads) unreadEstimated += result.unreadEstimated;
									if (!hasUnreads)
										hasUnread = result.hasUnread ? true : hasUnread;
									isTyping = result.isTyping ? true : isTyping;
								}
							});
						return {
							unreadCount,
							mentionCount,
							unreadEstimated,
							hasUnread,
							isTyping,
						};
					},
				)((result) => {
					return (
						<FavFolder
							groupIndex={index}
							groupCount={props.favGroups.length}
							favGroup={favGroup}
							unreadCountGroup={result.unreadCount}
							unreadEstimatedGroup={result.unreadEstimated}
							mentionCountGroup={result.mentionCount}
							hasUnreadGroup={result.hasUnread}
							isTypingGroup={result.isTyping}
							showFavGroupUnreadBadges={props.showFavGroupUnreadBadges}
							showFavGroupMentionBadges={props.showFavGroupMentionBadges}
							showFavGroupTypingBadge={props.showFavGroupTypingBadge}
							showEmptyFavGroupBadges={props.showEmptyFavGroupBadges}
							{...props}
						/>
					);
				}),
			);
		});
	};

	//#endregion

	//#region FavBar/TopBar/TabBar Definitions

	function nextTab() {
		if (TopBarRef.current)
			TopBarRef.current.switchToTab(
				(TopBarRef.current.state.selectedTabIndex + 1) %
					TopBarRef.current.state.tabs.length,
			);
	}

	function previousTab() {
		if (TopBarRef.current)
			TopBarRef.current.switchToTab(
				(TopBarRef.current.state.selectedTabIndex -
					1 +
					TopBarRef.current.state.tabs.length) %
					TopBarRef.current.state.tabs.length,
			);
	}

	function closeCurrentTab() {
		if (TopBarRef.current)
			TopBarRef.current.closeTab(TopBarRef.current.state.selectedTabIndex);
	}

	async function* animate(duration) {
		const start = Date.now();
		let last = 0;
		while (true) {
			const now = Date.now();
			const elapsed = now - start;
			const progress = Math.min(elapsed / duration, 1);
			yield progress - last;
			last = progress;
			if (progress === 1) break;
			await new Promise((resolve) => requestAnimationFrame(resolve));
		}
	}

	// This component allows users to smoothly scroll horizontally using the mouse wheel.
	function HorizontalScroll(props) {
		const container = React.useRef(null);
		let current = 0;
		let target = 0;

		function expDecay(a, b, decay, dt) {
			return b + (a - b) * Math.exp((-decay * dt) / 1000);
		}

		let last = Date.now();
		let resetLast = false;
		function update() {
			if (!container.current) return;

			current = expDecay(current, target, 10, Date.now() - last);
			container.current.scrollLeft = current;
			last = Date.now();

			if (Math.abs(container.current.scrollLeft - target) > 0) {
				requestAnimationFrame(update);
			} else {
				resetLast = true;
			}
		}

		return (
			<div
				ref={container}
				onWheel={async (event) => {
					target += event.deltaY;
					target = Math.max(
						0,
						Math.min(
							target,
							container.current.scrollWidth - container.current.clientWidth,
						),
					);

					if (resetLast) last = Date.now();
					update();
				}}
				onScrollEnd={() => (current = container.current.scrollLeft)}
				{...props}
			>
				{props.children}
			</div>
		);
	}

	function stopTitleBarDoubleClick(node) {
		node?.addEventListener("dblclick", (e) => e.stopPropagation());
	}

	const TabBar = (props) => (
		<div
			className="channelTabs-tabContainer"
			data-tab-count={props.tabs.length}
			ref={stopTitleBarDoubleClick}
			onMouseMove={(e) => {
				// Tabs and folders set their own spot; the rest of the bar means the end.
				if (
					!isDraggingFavToTabs() ||
					e.target.closest?.(".channelTabs-tab, .channelTabs-tabFolder")
				)
					return;
				favTabDropTarget = { type: "end" };
				const last = [
					...e.currentTarget.querySelectorAll(
						".channelTabs-tab, .channelTabs-tabFolder",
					),
				].at(-1);
				if (last) markTabDrop(last, "after");
				else clearTabDropMarker();
			}}
			onMouseLeave={() => {
				if (!favTabDropTarget) return;
				favTabDropTarget = null;
				clearTabDropMarker();
			}}
		>
			<div className="channelTabs-tabNav">
				<div
					className="channelTabs-tabNavLeft"
					onClick={() => {
						TopBarRef.current.state.useStandardNav
							? NavShortcuts.NAVIGATE_BACK.action()
							: previousTab();
					}}
					onContextMenu={() => {
						!TopBarRef.current.state.useStandardNav
							? NavShortcuts.NAVIGATE_BACK.action()
							: previousTab();
					}}
				>
					<LeftCaret />
				</div>
				<div
					className="channelTabs-tabNavRight"
					onClick={() => {
						TopBarRef.current.state.useStandardNav
							? NavShortcuts.NAVIGATE_FORWARD.action()
							: nextTab();
					}}
					onContextMenu={() => {
						!TopBarRef.current.state.useStandardNav
							? NavShortcuts.NAVIGATE_FORWARD.action()
							: nextTab();
					}}
				>
					<RightCaret />
				</div>
				<div
					className="channelTabs-tabNavClose"
					onClick={() => {
						closeCurrentTab();
					}}
					onContextMenu={props.openNewTab}
				>
					<Close />
				</div>
			</div>
			<HorizontalScroll
				style={{
					display: "flex",
					overflowX: "auto",
					scrollbarWidth: "none",
					flexWrap: props.wrapTabs ? "wrap" : "nowrap",
				}}
			>
				{getTabDisplayItems(props.tabs, props.tabFolders).map((item) =>
					item.type === "folder" ? (
						<TabFolder
							key={`folder-${item.folder.id}`}
							folder={item.folder}
							tabs={item.tabs}
							toggleFolder={props.toggleFolder}
							renameFolder={props.renameFolder}
							deleteFolder={props.deleteFolder}
							closeFolder={props.closeFolder}
							moveTabToFolder={props.moveTabToFolder}
							moveFolder={props.moveFolder}
						/>
					) : (
						React.createElement(
							Flux.connectStores(
								[UnreadStateStore, UserTypingStore, UserStatusStore],
								() => ({
									unreadCount: UnreadStateStore.getUnreadCount(
										item.tab.channelId,
									),
									unreadEstimated: UnreadStateStore.isEstimated(
										item.tab.channelId,
									),
									hasUnread: UnreadStateStore.hasUnread(item.tab.channelId),
									mentionCount: UnreadStateStore.getMentionCount(
										item.tab.channelId,
									),
									hasUsersTyping: isChannelTyping(item.tab.channelId),
									currentStatus: getCurrentUserStatus(item.tab.url),
								}),
							)((result) => (
								<Tab
									ref={(el) => (props.tabRefs.current[item.tabIndex] = el)}
									key={item.tabIndex}
									switchToTab={props.switchToTab}
									closeTab={props.closeTab}
									addToFavs={props.addToFavs}
									minimizeTab={props.minimizeTab}
									moveLeft={() =>
										props.move(
											item.tabIndex,
											(item.tabIndex + props.tabs.length - 1) %
												props.tabs.length,
										)
									}
									moveRight={() =>
										props.move(
											item.tabIndex,
											(item.tabIndex + 1) % props.tabs.length,
										)
									}
									openInNewTab={() => props.openInNewTab(item.tab)}
									moveTab={props.move}
									moveTabTo={props.moveTabTo}
									moveTabToFolder={props.moveTabToFolder}
									moveToFolder={(folderId) =>
										props.moveTabToFolder(item.tabIndex, folderId)
									}
									createFolderForTab={() => props.createFolder(item.tabIndex)}
									tabFolders={props.tabFolders}
									folderId={item.tab.folderId}
									inActiveFolder={
										Boolean(item.tab.folderId) &&
										props.tabs.some(
											(tab) =>
												tab.folderId === item.tab.folderId && tab.selected,
										)
									}
									folderEnd={
										Boolean(item.tab.folderId) &&
										props.tabs.findLastIndex(
											(tab) => tab.folderId === item.tab.folderId,
										) === item.tabIndex
									}
									tabCount={props.tabs.length}
									tabIndex={item.tabIndex}
									name={item.tab.name}
									currentStatus={result.currentStatus}
									url={item.tab.url}
									selected={item.tab.selected}
									minimized={item.tab.minimized}
									channelId={item.tab.channelId}
									unreadCount={result.unreadCount}
									unreadEstimated={result.unreadEstimated}
									hasUnread={result.hasUnread}
									mentionCount={result.mentionCount}
									hasUsersTyping={result.hasUsersTyping}
									showTabUnreadBadges={props.showTabUnreadBadges}
									showTabMentionBadges={props.showTabMentionBadges}
									showTabTypingBadge={props.showTabTypingBadge}
									showEmptyTabBadges={props.showEmptyTabBadges}
									showActiveTabUnreadBadges={props.showActiveTabUnreadBadges}
									showActiveTabMentionBadges={props.showActiveTabMentionBadges}
									showActiveTabTypingBadge={props.showActiveTabTypingBadge}
									showEmptyActiveTabBadges={props.showEmptyActiveTabBadges}
									compactStyle={props.compactStyle}
								/>
							)),
							{ key: `tab-${item.tabIndex}` },
						)
					),
				)}
			</HorizontalScroll>
			<NewTab openNewTab={props.openNewTab} />
			<NewTabFolder createFolder={() => props.createFolder()} />
			<SavedTabFolders
				closedFolders={props.closedFolders}
				reopenFolder={props.reopenFolder}
				forgetFolder={props.forgetFolder}
			/>
			<TabListDropdown {...props} />
			{props.trailing}
		</div>
	);

	function getFavRowSegments(favs, favGroups) {
		const segments = [];
		let ordinal = 0;
		for (const { type, item } of getFavRowItems(favs, favGroups)) {
			if (type === "group") {
				segments.push({ type, group: item });
				continue;
			}
			const last = segments.at(-1);
			if (last?.type === "favs") last.range[1] = ordinal + 1;
			else segments.push({ type: "favs", range: [ordinal, ordinal + 1] });
			ordinal++;
		}
		return segments;
	}

	// Empty space on the bar takes a grouped bookmark, or a channel dragged in
	// from the sidebar, out to the end. `anywhere` also accepts a spot over the
	// bar's other content, such as its placeholder.
	function hoverFavBar(e, anywhere) {
		if (anywhere !== true && e.target !== e.currentTarget) return;
		if (!currentFavDrag.fav || currentFavDrag.groupId === -1) return;
		currentFavDrag.target = { type: "end", outOfGroup: true };
		clearFavDropMarker();
		currentFavDrag.marked = e.currentTarget;
		e.currentTarget.classList.add("channelTabs-favDropAfter");
	}

	const FavBar = (props) => {
		// An empty group still belongs on the bar, so the bar is only empty when
		// there are no groups either.
		const isEmpty = props.favs.length == 0 && props.favGroups.length == 0;
		return (
			<div
				className={
					"channelTabs-favContainer" + (isEmpty ? " channelTabs-noFavs" : "")
				}
				data-fav-count={props.favs.length}
				ref={stopTitleBarDoubleClick}
				onMouseOver={hoverFavBar}
				onDragEnter={allowExternalFavDrop}
				// Each bookmark and group under the pointer sets its own target as the
				// event bubbles up; the bar only fills in what none of them claimed.
				onDragOverCapture={() => {
					if (currentFavDrag.external) currentFavDrag.target = null;
				}}
				onDragOver={(e) => {
					if (!allowExternalFavDrop(e)) return;
					if (!currentFavDrag.target) hoverFavBar(e, true);
				}}
				onDragLeave={(e) => {
					if (
						!currentFavDrag.external ||
						e.currentTarget.contains(e.relatedTarget)
					)
						return;
					currentFavDrag.target = null;
					clearFavDropMarker();
				}}
				onDrop={(e) => {
					const { fav, target, external } = currentFavDrag;
					if (!external) return;
					e.preventDefault();
					endFavDrag();
					props.addFavAt(fav, target);
				}}
				onMouseLeave={() => {
					if (currentFavDrag.target?.type !== "end" && !currentFavDrag.external)
						return;
					currentFavDrag.target = null;
					clearFavDropMarker();
				}}
				onContextMenu={(e) => {
					CreateFavBarContextMenu(props, e);
				}}
			>
				{!isEmpty ? (
					getFavRowSegments(props.favs, props.favGroups).map((segment) =>
						segment.type === "group" ? (
							<React.Fragment key={`group-${segment.group.groupId}`}>
								<FavFolders {...props} only={segment.group} />
							</React.Fragment>
						) : (
							<React.Fragment key={`favs-${segment.range[0]}`}>
								<FavItems group={null} {...props} range={segment.range} />
							</React.Fragment>
						),
					)
				) : (
					<NoFavItemsPlaceholder />
				)}
				<div className="channelTabs-newTab" onClick={() => props.addFavGroup()}>
					<PlusAlt />
				</div>
				{props.trailing}
			</div>
		);
	};

	const TopBar = class TopBar extends React.Component {
		//#region Constructor

		constructor(props) {
			super(props);
			this.state = {
				selectedTabIndex: Math.max(
					props.tabs.findIndex((tab) => tab.selected),
					0,
				),
				tabs: props.tabs,
				tabFolders: props.tabFolders,
				closedTabFolders: props.closedTabFolders,
				favs: props.favs,
				favGroups: props.favGroups,
				reopenLastChannel: props.reopenLastChannel,
				showTabBar: props.showTabBar,
				showFavBar: props.showFavBar,
				showFavUnreadBadges: props.showFavUnreadBadges,
				showFavMentionBadges: props.showFavMentionBadges,
				showFavTypingBadge: props.showFavTypingBadge,
				showEmptyFavBadges: props.showEmptyFavBadges,
				showTabUnreadBadges: props.showTabUnreadBadges,
				showTabMentionBadges: props.showTabMentionBadges,
				showTabTypingBadge: props.showTabTypingBadge,
				showEmptyTabBadges: props.showEmptyTabBadges,
				showActiveTabUnreadBadges: props.showActiveTabUnreadBadges,
				showActiveTabMentionBadges: props.showActiveTabMentionBadges,
				showActiveTabTypingBadge: props.showActiveTabTypingBadge,
				showEmptyActiveTabBadges: props.showEmptyActiveTabBadges,
				showFavGroupUnreadBadges: props.showFavGroupUnreadBadges,
				showFavGroupMentionBadges: props.showFavGroupMentionBadges,
				showFavGroupTypingBadge: props.showFavGroupTypingBadge,
				showEmptyFavGroupBadges: props.showEmptyFavGroupBadges,
				addFavGroup: props.addFavGroup,
				compactStyle: props.compactStyle,
				wrapTabs: props.wrapTabs,
				showQuickSettings: props.showQuickSettings,
				showNavButtons: props.showNavButtons,
				alwaysFocusNewTabs: props.alwaysFocusNewTabs,
				useStandardNav: props.useStandardNav,
			};
			this.switchToTab = this.switchToTab.bind(this);
			this.closeTab = this.closeTab.bind(this);
			this.saveChannel = this.saveChannel.bind(this);
			this.renameFav = this.renameFav.bind(this);
			this.deleteFav = this.deleteFav.bind(this);
			this.addToFavs = this.addToFavs.bind(this);
			this.minimizeTab = this.minimizeTab.bind(this);
			this.minimizeFav = this.minimizeFav.bind(this);
			this.moveTab = this.moveTab.bind(this);
			this.moveTabTo = this.moveTabTo.bind(this);
			this.moveTabToFolder = this.moveTabToFolder.bind(this);
			this.moveTabFolder = this.moveTabFolder.bind(this);
			this.createTabFolder = this.createTabFolder.bind(this);
			this.renameTabFolder = this.renameTabFolder.bind(this);
			this.toggleTabFolder = this.toggleTabFolder.bind(this);
			this.deleteTabFolder = this.deleteTabFolder.bind(this);
			this.closeTabFolder = this.closeTabFolder.bind(this);
			this.reopenTabFolder = this.reopenTabFolder.bind(this);
			this.forgetTabFolder = this.forgetTabFolder.bind(this);
			this.moveFav = this.moveFav.bind(this);
			this.moveFavTo = this.moveFavTo.bind(this);
			this.moveFavIntoGroup = this.moveFavIntoGroup.bind(this);
			this.moveFavOutOfGroup = this.moveFavOutOfGroup.bind(this);
			this.addFavAt = this.addFavAt.bind(this);
			this.openFavsAsTabs = this.openFavsAsTabs.bind(this);
			this.addFavGroup = this.addFavGroup.bind(this);
			this.moveToFavGroup = this.moveToFavGroup.bind(this);
			this.renameFavGroup = this.renameFavGroup.bind(this);
			this.removeFavGroup = this.removeFavGroup.bind(this);
			this.moveFavGroup = this.moveFavGroup.bind(this);
			this.moveFavRowItem = this.moveFavRowItem.bind(this);
			this.openNewTab = this.openNewTab.bind(this);
			this.openTabInNewTab = this.openTabInNewTab.bind(this);
			this.openFavInNewTab = this.openFavInNewTab.bind(this);
			this.openFavGroupInNewTab = this.openFavGroupInNewTab.bind(this);
			this.hideFavBar = this.hideFavBar.bind(this);
			this.tabRefs = React.createRef();
			this.tabRefs.current = [];
			this.containerRef = React.createRef();
		}

		//#endregion

		//#region Tab Functions

		minimizeTab(tabIndex) {
			this.setState(
				{
					tabs: this.state.tabs.map((tab, index) => {
						if (index == tabIndex)
							return Object.assign({}, tab, {
								minimized: !tab.minimized,
							});
						else return Object.assign({}, tab); // or return tab;
					}),
				},
				this.props.plugin.saveSettings,
			);
		}

		switchToTab(tabIndex) {
			const rememberScroll =
				this.props.plugin.settings.rememberScroll !== false;
			if (rememberScroll) captureTabScroll(this.state.tabs);
			const folderId = this.state.tabs[tabIndex]?.folderId;
			this.setState(
				{
					tabs: this.state.tabs.map((tab, index) => {
						if (index === tabIndex) {
							return Object.assign({}, tab, { selected: true });
						} else {
							return Object.assign({}, tab, { selected: false });
						}
					}),
					selectedTabIndex: tabIndex,
					tabFolders: folderId
						? this.state.tabFolders.map((folder) =>
								folder.id === folderId
									? { ...folder, collapsed: false }
									: folder,
							)
						: this.state.tabFolders,
				},
				() => {
					this.props.plugin.saveSettings();
					this.tabRefs.current[tabIndex]?.scrollIntoView({
						behavior: "smooth",
					});
				},
			);
			switching = true;
			navigateToUrl(this.state.tabs[tabIndex].url);
			switching = false;
			if (rememberScroll) restoreTabScroll(this.state.tabs[tabIndex]);
		}

		closeTab(tabIndex, mode) {
			if (this.state.tabs.length === 1) return;
			if (mode === "single" || mode == null) {
				this.setState(
					{
						tabs: this.state.tabs.filter((tab, index) => index !== tabIndex),
						selectedTabIndex: Math.max(
							0,
							this.state.selectedTabIndex -
								(this.state.selectedTabIndex >= tabIndex ? 1 : 0),
						),
					},
					() => {
						if (!this.state.tabs[this.state.selectedTabIndex].selected) {
							this.switchToTab(this.state.selectedTabIndex);
						}
						this.props.plugin.saveSettings();
					},
				);
			} else if (mode == "other") {
				this.setState(
					{
						tabs: this.state.tabs.filter((tab, index) => index === tabIndex),
						selectedTabIndex: 0,
					},
					() => {
						if (!this.state.tabs[0].selected) {
							this.switchToTab(this.state.selectedTabIndex);
						}
						this.props.plugin.saveSettings();
					},
				);
			} else if (mode === "left") {
				this.setState(
					{
						tabs: this.state.tabs.filter((tab, index) => index >= tabIndex),
						selectedTabIndex: 0,
					},
					() => {
						if (!this.state.tabs[this.state.selectedTabIndex].selected) {
							this.switchToTab(this.state.selectedTabIndex);
						}
						this.props.plugin.saveSettings();
					},
				);
			} else if (mode === "right") {
				this.setState(
					{
						tabs: this.state.tabs.filter((tab, index) => index <= tabIndex),
						selectedTabIndex: tabIndex,
					},
					() => {
						if (!this.state.tabs[this.state.selectedTabIndex].selected) {
							this.switchToTab(this.state.selectedTabIndex);
						}
						this.props.plugin.saveSettings();
					},
				);
			}
		}

		moveTab(fromIndex, toIndex) {
			if (fromIndex === toIndex) return;
			const targetFolderId = this.state.tabs[toIndex]?.folderId ?? null;
			const tabs = this.state.tabs.filter((tab, index) => index !== fromIndex);
			tabs.splice(toIndex, 0, {
				...this.state.tabs[fromIndex],
				folderId: targetFolderId,
			});
			this.setState(
				{
					tabs,
					selectedTabIndex: tabs.findIndex((tab) => tab.selected),
				},
				this.props.plugin.saveSettings,
			);
		}

		// Drop a dragged tab before or after another tab, joining that tab's folder.
		moveTabTo(fromIndex, targetIndex, after) {
			const moving = this.state.tabs[fromIndex];
			const target = this.state.tabs[targetIndex];
			if (!moving || !target || fromIndex === targetIndex) return;
			const folderId = target.folderId ?? null;
			const tabs = this.state.tabs.filter((tab, index) => index !== fromIndex);
			const toIndex = tabs.indexOf(target) + (after ? 1 : 0);
			tabs.splice(toIndex, 0, { ...moving, folderId });
			this.setState(
				{
					tabs,
					selectedTabIndex: tabs.findIndex((tab) => tab.selected),
				},
				this.props.plugin.saveSettings,
			);
		}

		moveTabFolder(folderId, target, after) {
			const result = moveFolderGroup(
				this.state.tabs,
				this.state.tabFolders,
				folderId,
				target,
				after,
			);
			if (result.tabs === this.state.tabs) return;
			this.setState(
				{
					tabs: result.tabs,
					tabFolders: result.folders,
					selectedTabIndex: result.tabs.findIndex((tab) => tab.selected),
				},
				this.props.plugin.saveSettings,
			);
		}

		moveTabToFolder(tabIndex, folderId) {
			if (
				folderId &&
				!this.state.tabFolders.some((folder) => folder.id === folderId)
			)
				return;
			const tab = this.state.tabs[tabIndex];
			if (!tab || (tab.folderId ?? null) === folderId) return;
			const tabs = moveTabIntoFolder(this.state.tabs, tabIndex, folderId);
			this.setState(
				{
					tabs,
					selectedTabIndex: tabs.findIndex((item) => item.selected),
					tabFolders: this.state.tabFolders.map((folder) =>
						folder.id === folderId ? { ...folder, collapsed: false } : folder,
					),
				},
				this.props.plugin.saveSettings,
			);
		}

		createTabFolder(tabIndex) {
			let name = "New folder";
			UI.showConfirmationModal(
				"Name this tab folder",
				<Textbox
					placeholder="New folder"
					onChange={(value) => (name = value.trim())}
				/>,
				{
					onConfirm: () => {
						if (!name) return;
						const id = createTabFolderId();
						this.setState(
							(state) => ({
								tabFolders: [
									...state.tabFolders,
									{ id, name, collapsed: false },
								],
								tabs: state.tabs.map((tab, index) =>
									index === tabIndex ? { ...tab, folderId: id } : tab,
								),
							}),
							this.props.plugin.saveSettings,
						);
					},
				},
			);
		}

		renameTabFolder(folderId) {
			const folder = this.state.tabFolders.find((item) => item.id === folderId);
			if (!folder) return;
			let name = folder.name;
			UI.showConfirmationModal(
				"Rename tab folder",
				<Textbox
					placeholder={folder.name}
					onChange={(value) => (name = value.trim())}
				/>,
				{
					onConfirm: () => {
						if (!name) return;
						this.setState(
							(state) => ({
								tabFolders: state.tabFolders.map((item) =>
									item.id === folderId ? { ...item, name } : item,
								),
							}),
							this.props.plugin.saveSettings,
						);
					},
				},
			);
		}

		toggleTabFolder(folderId) {
			this.setState(
				(state) => ({
					tabFolders: state.tabFolders.map((folder) =>
						folder.id === folderId
							? { ...folder, collapsed: !folder.collapsed }
							: folder,
					),
				}),
				this.props.plugin.saveSettings,
			);
		}

		deleteTabFolder(folderId) {
			this.setState(
				(state) => ({
					tabFolders: state.tabFolders.filter(
						(folder) => folder.id !== folderId,
					),
					tabs: state.tabs.map((tab) =>
						tab.folderId === folderId ? { ...tab, folderId: null } : tab,
					),
				}),
				this.props.plugin.saveSettings,
			);
		}

		// Closing a folder takes it and its tabs off the tab row and keeps them in
		// closedTabFolders, so reopening brings back the same tabs.
		closeTabFolder(folderId) {
			const folder = this.state.tabFolders.find((item) => item.id === folderId);
			if (!folder) return;
			const selected = this.state.tabs.find((tab) => tab.selected);
			if (
				selected?.folderId === folderId &&
				this.props.plugin.settings.rememberScroll !== false
			)
				captureTabScroll(this.state.tabs);
			const firstIndex = this.state.tabs.findIndex(
				(tab) => tab.folderId === folderId,
			);
			const saved = this.state.tabs
				.filter((tab) => tab.folderId === folderId)
				.map((tab) => ({ ...tab, selected: false }));
			let tabs = this.state.tabs.filter((tab) => tab.folderId !== folderId);
			if (!tabs.length)
				tabs = [
					{
						url: "/channels/@me",
						name: "Friends",
						selected: false,
						channelId: undefined,
						folderId: null,
					},
				];
			const lostSelection = !tabs.some((tab) => tab.selected);
			// Land on the tab that sat after the folder, or the one before it.
			const nextIndex = lostSelection
				? Math.min(firstIndex === -1 ? 0 : firstIndex, tabs.length - 1)
				: tabs.findIndex((tab) => tab.selected);
			const { position, collapsed, ...rest } = folder;
			this.setState(
				(state) => ({
					tabs,
					selectedTabIndex: nextIndex,
					tabFolders: state.tabFolders.filter((item) => item.id !== folderId),
					closedTabFolders: [
						...state.closedTabFolders.filter((item) => item.id !== folderId),
						{ ...rest, tabs: saved },
					],
				}),
				() => {
					if (lostSelection) this.switchToTab(nextIndex);
					else this.props.plugin.saveSettings();
				},
			);
		}

		reopenTabFolder(folderId) {
			const closed = this.state.closedTabFolders.find(
				(item) => item.id === folderId,
			);
			if (!closed) return;
			const { tabs: savedTabs, ...folder } = closed;
			const firstIndex = this.state.tabs.length;
			this.setState(
				(state) => ({
					tabs: [
						...state.tabs,
						...savedTabs.map((tab) => ({ ...tab, selected: false, folderId })),
					],
					tabFolders: [
						...state.tabFolders,
						{
							...folder,
							collapsed: false,
							position: savedTabs.length ? null : state.tabs.length,
						},
					],
					closedTabFolders: state.closedTabFolders.filter(
						(item) => item.id !== folderId,
					),
				}),
				() => {
					if (savedTabs.length) this.switchToTab(firstIndex);
					else this.props.plugin.saveSettings();
				},
			);
		}

		forgetTabFolder(folderId) {
			this.setState(
				(state) => ({
					closedTabFolders: state.closedTabFolders.filter(
						(item) => item.id !== folderId,
					),
				}),
				this.props.plugin.saveSettings,
			);
		}

		//#endregion

		//#region Fav Functions

		hideFavBar() {
			this.setState(
				{
					showFavBar: false,
				},
				() => {
					this.props.plugin.settings.showFavBar = false;
					this.props.plugin.saveSettings();
				},
			);
		}

		renameFav(currentName, favIndex) {
			let name = currentName;
			UI.showConfirmationModal(
				"What should the new name be?",
				<Textbox onChange={(newContent) => (name = newContent.trim())} />,
				{
					onConfirm: () => {
						if (!name) return;
						this.setState(
							{
								favs: this.state.favs.map((fav, index) => {
									if (index === favIndex)
										return Object.assign({}, fav, { name });
									else return Object.assign({}, fav);
								}),
							},
							this.props.plugin.saveSettings,
						);
					},
				},
			);
		}

		minimizeFav(favIndex) {
			this.setState(
				{
					favs: this.state.favs.map((fav, index) => {
						if (index == favIndex)
							return Object.assign({}, fav, {
								minimized: !fav.minimized,
							});
						else return Object.assign({}, fav); // or return tab;
					}),
				},
				this.props.plugin.saveSettings,
			);
		}

		deleteFav(favIndex) {
			this.setState(
				{
					favs: this.state.favs.filter((fav, index) => index !== favIndex),
				},
				this.props.plugin.saveSettings,
			);
		}

		/**
		 * The guildId parameter is only passed when the guild is saved and not the channel alone.
		 * This indicates that the currently selected channel needs to get selected instead of the
		 * provided channel id (which should be empty when a guildId is provided)
		 */
		addToFavs(name, url, channelId, guildId) {
			var groupId = -1;
			this.setState(
				{
					favs: [
						...this.state.favs,
						{ name, url, channelId, guildId, groupId },
					],
				},
				this.props.plugin.saveSettings,
			);
		}

		// Adds a bookmark where a drag landed: inside a group when `target` is one,
		// else among the loose bookmarks beside the target or at the end of the bar.
		addFavAt({ name, url, channelId, guildId }, target) {
			const groupId = target?.intoGroup ?? -1;
			const added = { name, url, channelId, guildId, groupId };
			const favs = [...this.state.favs];
			if (groupId !== -1) {
				const index = target.item ? favs.indexOf(target.item) : -1;
				if (index < 0) favs.push(added);
				else favs.splice(index + (target.after ? 1 : 0), 0, added);
				this.setState({ favs }, this.props.plugin.saveSettings);
				return;
			}
			favs.push(added);
			const result =
				target && target.type !== "end"
					? reorderFavRow(
							favs,
							this.state.favGroups,
							{ type: "fav", item: added },
							target,
						)
					: null;
			this.setState(result ?? { favs }, this.props.plugin.saveSettings);
		}

		moveFav(fromIndex, toIndex) {
			if (fromIndex === toIndex) return;
			const favs = this.state.favs.filter((fav, index) => index !== fromIndex);
			favs.splice(toIndex, 0, this.state.favs[fromIndex]);
			this.setState({ favs }, this.props.plugin.saveSettings);
		}

		// Moves a bookmark into a group, beside `targetFav` in its list or at the end.
		moveFavIntoGroup(fav, groupId, targetFav, after) {
			if (!this.state.favs.includes(fav) || fav.groupId === groupId) return;
			const favs = this.state.favs.filter((item) => item !== fav);
			const index = targetFav ? favs.indexOf(targetFav) : -1;
			const moved = { ...fav, groupId };
			if (index < 0) favs.push(moved);
			else favs.splice(index + (after ? 1 : 0), 0, moved);
			let favGroups = this.state.favGroups;
			if (fav.groupId === -1) {
				// Groups after the bookmark's old spot sit one place earlier in the row.
				const spot = this.state.favs
					.filter((item) => item && item.groupId === -1)
					.indexOf(fav);
				favGroups = favGroups.map((group) =>
					(group.position ?? 0) > spot
						? { ...group, position: group.position - 1 }
						: group,
				);
			}
			this.setState({ favs, favGroups }, this.props.plugin.saveSettings);
		}

		moveFavTo(fav, targetFav, after) {
			if (fav === targetFav) return;
			const favs = this.state.favs.filter((item) => item !== fav);
			const index = favs.indexOf(targetFav);
			if (index < 0 || !this.state.favs.includes(fav)) return;
			favs.splice(index + (after ? 1 : 0), 0, fav);
			this.setState({ favs }, this.props.plugin.saveSettings);
		}

		//#endregion

		//#region Fav Group Functions

		createFavGroupId() {
			var generatedId = this.state.favGroups.length;
			var isUnique = false;
			var duplicateFound = false;

			while (!isUnique) {
				for (var i = 0; i < this.state.favGroups.length; i++) {
					var group = this.state.favGroups[i];
					if (generatedId === group.groupId) duplicateFound = true;
				}
				if (!duplicateFound) isUnique = true;
				else {
					generatedId++;
					duplicateFound = false;
				}
			}
			return generatedId;
		}

		addFavGroup() {
			let name = "New Group";
			UI.showConfirmationModal(
				"What should the new name be?",
				<Textbox onChange={(newContent) => (name = newContent.trim())} />,
				{
					onConfirm: () => {
						if (!name) return;
						this.setState(
							{
								favGroups: [
									...this.state.favGroups,
									{ name: name, groupId: this.createFavGroupId() },
								],
							},
							this.props.plugin.saveSettings,
						);
					},
				},
			);
		}

		renameFavGroup(currentName, groupId) {
			let name = currentName;
			UI.showConfirmationModal(
				"What should the new name be?",
				<Textbox onChange={(newContent) => (name = newContent.trim())} />,
				{
					onConfirm: () => {
						if (!name) return;
						this.setState(
							{
								favGroups: this.state.favGroups.map((group, index) => {
									if (group.groupId === groupId)
										return Object.assign({}, group, { name });
									else return Object.assign({}, group);
								}),
							},
							this.props.plugin.saveSettings,
						);
					},
				},
			);
		}

		removeFavGroup(groupId) {
			this.setState(
				{
					favGroups: this.state.favGroups.filter(
						(group, index) => group.groupId !== groupId,
					),
				},
				this.props.plugin.saveSettings,
			);

			this.setState(
				{
					favs: this.state.favs.map((fav, index) => {
						if (fav.groupId === groupId)
							return Object.assign({}, fav, { groupId: -1 });
						else return Object.assign({}, fav);
					}),
				},
				this.props.plugin.saveSettings,
			);
		}

		moveToFavGroup(favIndex, groupId) {
			this.setState(
				{
					favs: this.state.favs.map((fav, index) => {
						if (index === favIndex) {
							return Object.assign({}, fav, { groupId: groupId });
						} else {
							return Object.assign({}, fav);
						}
					}),
				},
				this.props.plugin.saveSettings,
			);
		}

		// Moves a loose bookmark or a group beside another one in the bookmark row.
		moveFavRowItem(dragged, target) {
			const result = reorderFavRow(
				this.state.favs,
				this.state.favGroups,
				dragged,
				target,
			);
			if (result) this.setState(result, this.props.plugin.saveSettings);
		}

		// Takes a bookmark out of its group and puts it on the bar beside `target`,
		// or at the end of the bar when there is no target.
		moveFavOutOfGroup(fav, target) {
			if (!this.state.favs.includes(fav) || fav.groupId === -1) return;
			const moved = { ...fav, groupId: -1 };
			const favs = [...this.state.favs.filter((item) => item !== fav), moved];
			const result = target
				? reorderFavRow(
						favs,
						this.state.favGroups,
						{ type: "fav", item: moved },
						target,
					)
				: { favs, favGroups: this.state.favGroups };
			if (result) this.setState(result, this.props.plugin.saveSettings);
		}

		// Context-menu move left/right: step over the neighboring group as laid out in the row.
		moveFavGroup(fromIndex, toIndex) {
			if (fromIndex === toIndex) return;
			const group = this.state.favGroups[fromIndex];
			const groups = getFavRowItems(
				this.state.favs,
				this.state.favGroups,
			).filter((entry) => entry.type === "group");
			const row = groups.findIndex((entry) => entry.item === group);
			if (row < 0) return;
			const forward = toIndex > fromIndex;
			const target =
				groups[(row + (forward ? 1 : -1) + groups.length) % groups.length];
			this.moveFavRowItem(
				{ type: "group", item: group },
				{ type: "group", item: target.item, after: forward },
			);
		}

		//#endregion

		//#region New Tab Functions

		saveChannel(guildId, channelId, name) {
			const url = `/channels/${guildId || "@me"}${channelId ? `/${channelId}` : ""}`;
			if (this.state.alwaysFocusNewTabs) {
				//Open and Focus New Tab
				const newTabIndex = this.state.tabs.length;
				this.setState(
					{
						tabs: [
							...this.state.tabs.map((tab) =>
								Object.assign(tab, { selected: false }),
							),
							{
								url,
								name,
								channelId,
								minimized: false,
								groupId: -1,
								folderId: null,
							},
						],
						selectedTabIndex: newTabIndex,
					},
					() => {
						this.props.plugin.saveSettings();
						this.switchToTab(newTabIndex);
					},
				);
			} else {
				//Open New Tab
				this.setState(
					{
						tabs: [
							...this.state.tabs,
							{
								url,
								name,
								channelId,
								minimized: false,
								groupId: -1,
								folderId: null,
							},
						],
					},
					this.props.plugin.saveSettings,
				);
			}
		}

		openNewTab() {
			const newTabIndex = this.state.tabs.length;
			this.setState(
				{
					tabs: [
						...this.state.tabs.map((tab) =>
							Object.assign(tab, { selected: false }),
						),
						{
							url: "/channels/@me",
							name: "Friends",
							selected: true,
							channelId: undefined,
							folderId: null,
						},
					],
					selectedTabIndex: newTabIndex,
				},
				() => {
					this.props.plugin.saveSettings();
					this.switchToTab(newTabIndex);
				},
			);
		}

		openTabInNewTab(tab) {
			//Used to Duplicate Tabs
			this.setState(
				{
					tabs: [
						...this.state.tabs,
						{ ...tab, selected: false, folderId: null, id: undefined },
					],
				},
				this.props.plugin.saveSettings,
			);
		}

		openFavInNewTab(fav) {
			if (!Array.isArray(fav)) fav = [fav];
			//Opens and Focuses New Tab
			const newTabIndex = this.state.tabs.length + fav.length - 1;
			this.setState(
				{
					tabs: [...this.state.tabs, ...fav.map(getFavTab)],
				},
				() => {
					this.props.plugin.saveSettings();
					if (this.state.alwaysFocusNewTabs) this.switchToTab(newTabIndex);
				},
			);
		}

		// Opens bookmarks as tabs where a drag onto the tab bar landed: beside a tab,
		// joining its folder; inside a tab folder; or at the end. A bookmark group
		// that doesn't land in a tab folder becomes a tab folder of its own.
		openFavsAsTabs(favs, target, group) {
			if (!favs.length) return;
			const { tabs, tabFolders } = this.state;
			let folderId = null;
			let index = tabs.length;
			if (target.type === "tab") {
				if (!tabs[target.index]) return;
				folderId = tabs[target.index].folderId ?? null;
				index = target.index + (target.after ? 1 : 0);
			} else if (target.type === "folder") {
				const folder = tabFolders.find((item) => item.id === target.id);
				if (!folder) return;
				folderId = folder.id;
				const last = tabs.findLastIndex((tab) => tab.folderId === folderId);
				index =
					last < 0
						? Math.min(folder.position ?? tabs.length, tabs.length)
						: last + 1;
			}
			const added = favs.map((fav) => ({ ...getFavTab(fav), folderId }));
			// An empty folder sits at a tab index, so ones after the new tabs move up.
			let nextFolders = tabFolders.map((folder) =>
				folder.id === folderId
					? { ...folder, collapsed: false }
					: folder.position != null && folder.position > index
						? { ...folder, position: folder.position + added.length }
						: folder,
			);
			if (group && !folderId) {
				const id = createTabFolderId();
				for (const tab of added) tab.folderId = id;
				nextFolders = [
					...nextFolders,
					{ id, name: group.name, collapsed: false },
				];
			}
			const nextTabs = [...tabs];
			nextTabs.splice(index, 0, ...added);
			this.setState(
				{
					tabs: nextTabs,
					tabFolders: nextFolders,
					selectedTabIndex: nextTabs.findIndex((tab) => tab.selected),
				},
				() => {
					this.props.plugin.saveSettings();
					if (this.state.alwaysFocusNewTabs)
						this.switchToTab(index + added.length - 1);
				},
			);
		}

		openFavGroupInNewTab(groupId) {
			this.openFavInNewTab(
				this.state.favs.filter((fav) => fav && fav.groupId === groupId),
			);
		}

		//#endregion

		//#region Other Functions

		render() {
			const trailing = (
				<div className="channelTabs-trailing">
					{this.state.showQuickSettings && (
						<div
							id="channelTabs-settingsMenu"
							onClick={(e) => {
								CreateSettingsContextMenu(this, e);
							}}
						>
							{SettingsMenuIcon}
						</div>
					)}
					{this.props.trailing}
				</div>
			);

			return (
				<div id="channelTabs-container" ref={this.containerRef}>
					{!this.state.showTabBar ? null : (
						<TabBar
							leading={this.props.leading}
							trailing={trailing}
							tabs={this.state.tabs}
							tabFolders={this.state.tabFolders}
							showTabUnreadBadges={this.state.showTabUnreadBadges}
							showTabMentionBadges={this.state.showTabMentionBadges}
							showTabTypingBadge={this.state.showTabTypingBadge}
							showEmptyTabBadges={this.state.showEmptyTabBadges}
							showActiveTabUnreadBadges={this.state.showActiveTabUnreadBadges}
							showActiveTabMentionBadges={this.state.showActiveTabMentionBadges}
							showActiveTabTypingBadge={this.state.showActiveTabTypingBadge}
							showEmptyActiveTabBadges={this.state.showEmptyActiveTabBadges}
							compactStyle={this.state.compactStyle}
							wrapTabs={this.state.wrapTabs}
							privacyMode={this.state.privacyMode}
							radialStatusMode={this.state.radialStatusMode}
							tabWidthMin={this.state.tabWidthMin}
							closeTab={this.closeTab}
							switchToTab={this.switchToTab}
							openNewTab={this.openNewTab}
							openInNewTab={this.openTabInNewTab}
							addToFavs={this.addToFavs}
							minimizeTab={this.minimizeTab}
							move={this.moveTab}
							moveTabTo={this.moveTabTo}
							moveTabToFolder={this.moveTabToFolder}
							moveFolder={this.moveTabFolder}
							createFolder={this.createTabFolder}
							renameFolder={this.renameTabFolder}
							toggleFolder={this.toggleTabFolder}
							deleteFolder={this.deleteTabFolder}
							closeFolder={this.closeTabFolder}
							reopenFolder={this.reopenTabFolder}
							forgetFolder={this.forgetTabFolder}
							closedFolders={this.state.closedTabFolders}
							tabRefs={this.tabRefs}
						/>
					)}
					{!this.state.showFavBar ? null : (
						<FavBar
							leading={this.state.showTabBar ? null : this.props.leading}
							trailing={this.state.showTabBar ? null : trailing}
							favs={this.state.favs}
							favGroups={this.state.favGroups}
							showFavUnreadBadges={this.state.showFavUnreadBadges}
							showFavMentionBadges={this.state.showFavMentionBadges}
							showFavTypingBadge={this.state.showFavTypingBadge}
							showEmptyFavBadges={this.state.showEmptyFavBadges}
							privacyMode={this.state.privacyMode}
							radialStatusMode={this.state.radialStatusMode}
							showFavGroupUnreadBadges={this.state.showFavGroupUnreadBadges}
							showFavGroupMentionBadges={this.state.showFavGroupMentionBadges}
							showFavGroupTypingBadge={this.state.showFavGroupTypingBadge}
							showEmptyFavGroupBadges={this.state.showEmptyFavGroupBadges}
							showTabBar={this.state.showTabBar}
							getTabOpenShortcut={() =>
								this.props.plugin.settings.sidebarTabShortcut ?? "meta"
							}
							rename={this.renameFav}
							delete={this.deleteFav}
							addToFavs={this.addToFavs}
							addFavAt={this.addFavAt}
							minimizeFav={this.minimizeFav}
							openInNewTab={this.openFavInNewTab}
							openFavsAsTabs={this.openFavsAsTabs}
							move={this.moveFav}
							moveTo={this.moveFavTo}
							moveFavIntoGroup={this.moveFavIntoGroup}
							moveFavOutOfGroup={this.moveFavOutOfGroup}
							moveFavGroup={this.moveFavGroup}
							moveRowItem={this.moveFavRowItem}
							addFavGroup={this.addFavGroup}
							moveToFavGroup={this.moveToFavGroup}
							removeFavGroup={this.removeFavGroup}
							renameFavGroup={this.renameFavGroup}
							openFavGroupInNewTab={this.openFavGroupInNewTab}
							hideFavBar={this.hideFavBar}
						/>
					)}
				</div>
			);
		}

		componentDidMount() {
			const container = this.containerRef.current;
			function update() {
				document.body.style.setProperty(
					"--custom-app-top-bar-height",
					`${container.clientHeight}px`,
				);
			}

			this.observer = new ResizeObserver(update);
			this.observer.observe(container);
			update();
		}

		componentWillUnmount() {
			this.observer.disconnect();
			document.body.style.removeProperty("--custom-app-top-bar-height");
		}

		//#endregion
	};

	const TopBarRef = React.createRef();

	//#endregion

	//#region Plugin Decleration

	class ChannelTabs {
		//#region Start/Stop Functions

		constructor(meta) {
			this.meta = meta;
			pluginMeta = meta;
		}

		start(isRetry = false) {
			//console.warn("CT Start");
			if (isRetry && !platform.isEnabled()) return;
			if (!UserStore.getCurrentUser())
				return (this.startTimer = setTimeout(() => this.start(true), 1000));
			//console.warn(UserStore.getCurrentUser());
			patches = [];
			this.loadSettings();
			this.applyStyle();
			this.ifNoTabsExist();
			this.ifNoSelectedTab();
			this.promises = {
				state: { cancelled: false },
				cancel() {
					this.state.cancelled = true;
				},
			};
			this.saveSettings = this.saveSettings.bind(this);
			this.keybindHandler = this.keybindHandler.bind(this);
			this.numberedTabKeybindHandler =
				this.numberedTabKeybindHandler.bind(this);
			this.commandClickHandler = this.commandClickHandler.bind(this);
			this.sidebarDragStartHandler = this.sidebarDragStartHandler.bind(this);
			this.sidebarDragStartedHandler =
				this.sidebarDragStartedHandler.bind(this);
			this.sidebarDragEndHandler = this.sidebarDragEndHandler.bind(this);
			this.sidebarMouseDownHandler = this.sidebarMouseDownHandler.bind(this);
			this.sidebarClickHandler = this.sidebarClickHandler.bind(this);
			this.scrollHandler = this.scrollHandler.bind(this);
			this.dropdownDismissHandler = this.dropdownDismissHandler.bind(this);
			this.onSwitch();
			this.patchTitleBar(this.promises.state);
			this.patchContextMenus();
			this.ifReopenLastChannelDefault();
			this.tabApi = {
				// A stable id for the selected tab, so other plugins can keep per-tab state.
				getActiveTabId: () => {
					const tab = TopBarRef.current?.state.tabs.find(
						(item) => item.selected,
					);
					if (!tab) return null;
					tab.id ??=
						Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
					return tab.id;
				},
				openChannelInTab: (guildId, channelId, name) => {
					if (!this.settings.showTabBar || !TopBarRef.current) return false;
					TopBarRef.current.saveChannel(guildId, channelId, name);
					return true;
				},
			};
			globalThis.__ChannelTabsTabAPI = this.tabApi;
			window.dispatchEvent(new Event("chungus-tabs-change"));
			window.addEventListener("keydown", this.numberedTabKeybindHandler, true);
			document.addEventListener("keydown", this.keybindHandler);
			document.addEventListener("click", this.commandClickHandler, true);
			window.addEventListener("dragstart", this.sidebarDragStartHandler, true);
			window.addEventListener("dragstart", this.sidebarDragStartedHandler);
			window.addEventListener("mousedown", this.sidebarMouseDownHandler, true);
			window.addEventListener("click", this.sidebarClickHandler, true);
			for (const type of ["dragend", "drop"])
				window.addEventListener(type, this.sidebarDragEndHandler);
			document.addEventListener("scroll", this.scrollHandler, true);
			window.addEventListener("click", this.dropdownDismissHandler, true);
			window.addEventListener("mousedown", this.dropdownDismissHandler, true);
			window.addEventListener("keydown", this.dropdownDismissHandler, true);
			window.addEventListener("blur", closeAllDropdowns);
			this.showChangelog();
		}

		stop() {
			clearTimeout(this.startTimer);
			dismissWarning?.();
			dismissWarning = null;
			if (globalThis.__ChannelTabsTabAPI === this.tabApi) {
				delete globalThis.__ChannelTabsTabAPI;
				window.dispatchEvent(new Event("chungus-tabs-change"));
			}
			this.removeStyle();
			window.removeEventListener(
				"keydown",
				this.numberedTabKeybindHandler,
				true,
			);
			document.removeEventListener("keydown", this.keybindHandler);
			document.removeEventListener("click", this.commandClickHandler, true);
			window.removeEventListener(
				"dragstart",
				this.sidebarDragStartHandler,
				true,
			);
			window.removeEventListener("dragstart", this.sidebarDragStartedHandler);
			stopAllowingSidebarDrop();
			window.removeEventListener(
				"mousedown",
				this.sidebarMouseDownHandler,
				true,
			);
			window.removeEventListener("click", this.sidebarClickHandler, true);
			for (const type of ["dragend", "drop"])
				window.removeEventListener(type, this.sidebarDragEndHandler);
			endSidebarMouseDrag?.();
			document.removeEventListener("scroll", this.scrollHandler, true);
			clearTimeout(this.scrollTimer);
			if (this.scrollSaveTimer) {
				clearTimeout(this.scrollSaveTimer);
				this.saveSettings();
			}
			scrollRestoreToken++;
			window.removeEventListener("click", this.dropdownDismissHandler, true);
			window.removeEventListener(
				"mousedown",
				this.dropdownDismissHandler,
				true,
			);
			window.removeEventListener("keydown", this.dropdownDismissHandler, true);
			window.removeEventListener("blur", closeAllDropdowns);
			closeAllDropdowns();
			endFavDrag();
			this.promises?.cancel();
			patches.forEach((patch) => patch());
		}

		scrollHandler() {
			if (this.settings.rememberScroll === false) return;
			clearTimeout(this.scrollTimer);
			this.scrollTimer = setTimeout(() => {
				if (captureTabScroll(TopBarRef.current?.state.tabs)) {
					clearTimeout(this.scrollSaveTimer);
					this.scrollSaveTimer = setTimeout(this.saveSettings, 1000);
				}
			}, 250);
		}

		// Only the BetterDiscord version has a changelog to show.
		showChangelog() {
			platform.showChangelog?.(this.meta);
		}

		//#endregion

		//#region Styles

		applyStyle() {
			const CompactVariables = `
	:root {
		--channelTabs-tabHeight: 22px;
		--channelTabs-favHeight: 22px;
		--channelTabs-tabNameFontSize: 12px;
		--channelTabs-openTabSize: 18px;
	}
`;

			const CozyVariables = `
	:root {
		--channelTabs-tabHeight: 32px;
		--channelTabs-favHeight: 28px;
		--channelTabs-tabNameFontSize: 13px;
		--channelTabs-openTabSize: 24px;
	}
`;

			const ConstantVariables = `
	:root {
		--channelTabs-tabWidth: 220px;
		--channelTabs-tabWidthMin: ${this.settings.tabWidthMin}px;
	}
`;

			const PrivacyStyle = `
	#app-mount .channelTabs-favGroupBtn {
		color: transparent !important;
	}

	#app-mount .channelTabs-favGroupIcon {
		color: var(--interactive-text-default);
	}

	#app-mount .channelTabs-tabName {
		color: transparent;
		background-color: var(--interactive-text-default);
		opacity: 0.5;
	}

	#app-mount .channelTabs-selected .channelTabs-tabName {
		background-color: var(--interactive-text-active);
	}

	#app-mount .channelTabs-favName {
		color: transparent;
		background-color: var(--interactive-text-default);
		opacity: 0.5;
	}
`;

			const RadialStatusStyle = `
	.channelTabs-tabIconWrapper,
	.channelTabs-favIconWrapper {
		overflow: visible;
	}

	.channelTabs-tabIconWrapper img[src*="com/avatars/"],
	.channelTabs-favIconWrapper img[src*="com/avatars/"] {
		-webkit-clip-path: inset(1px round 50%);
		clip-path: inset(2px round 50%);
	}

	.channelTabs-tabIconWrapper rect,
	.channelTabs-favIconWrapper rect {
		x: 0;
		y: 0;
		rx: 50%;
		ry: 50%;
		-webkit-mask: none;
		mask: none;
		fill: none;
		height: 20px;
		width: 20px;
		stroke-width: 2px;
	}

	.channelTabs-onlineIcon {
		stroke: hsl(139, calc(var(--saturation-factor, 1) * 47.3%), 43.9%);
	}

	.channelTabs-idleIcon {
		stroke: hsl(38, calc(var(--saturation-factor, 1) * 95.7%), 54.1%);
	}

	.channelTabs-doNotDisturbIcon {
		stroke: hsl(359, calc(var(--saturation-factor, 1) * 82.6%), 59.4%);
	}

	.channelTabs-offlineIcon {
		stroke: hsl(214, calc(var(--saturation-factor, 1) * 9.9%), 50.4%);
	}
`;

			const tabNavStyle = `
	.channelTabs-tabContainer .channelTabs-tabNav {
		display:flex;
		margin: 0 6px 3px 0;
	}

	.channelTabs-tabNavClose svg {
		transform: scale(0.75);
	}

	.channelTabs-tabNavLeft svg,
	.channelTabs-tabNavRight svg {
		transform: scale(0.6);
	}

	/* if clickable */
	.channelTabs-tabContainer .channelTabs-tabNav>div:hover {
		color: var(--interactive-text-hover);
		background-color: var(--interactive-background-hover);
	}

	.channelTabs-tabContainer .channelTabs-tabNav>div:active {
		color: var(--interactive-text-active);
		background-color: var(--interactive-background-active);
	}

	/* if only 1 tab */
	.channelTabs-tabContainer[data-tab-count="1"] .channelTabs-tabNav>.channelTabs-tabNavClose {
		color: var(--interactive-muted);
		background: none;
	}

	.channelTabs-tabNav>div {
		display: flex;
		align-items: center;
		justify-content: center;
		height: var(--channelTabs-tabHeight);
		width: 32px;
		border-radius: 4px;
		margin-right: 3px;
		color: var(--interactive-text-default);
	}
`;

			const MacTitleBarStyle = `
	/* Leave room for macOS traffic lights before the navigation buttons. */
	.channelTabs-tabContainer {
		padding-left: 88px;
		min-width: 0;
	}

	/* Keep the three navigation buttons together beside the traffic lights. */
	.channelTabs-tabContainer > .channelTabs-tabNav {
		flex: 0 0 auto;
	}

	.channelTabs-tabContainer > div:not(.channelTabs-tabNav):not(.channelTabs-newTab):not(.channelTabs-newTabFolder):not(.channelTabs-savedFolders):not(.channelTabs-tabListDropdown):not(.channelTabs-trailing) {
		min-width: 0;
		flex: 1 1 auto;
	}

	/* Favorites occupy the title bar when the tab row is hidden. */
	#channelTabs-container > .channelTabs-favContainer:first-child {
		padding-left: 88px;
	}
`;

			const BaseStyle = `

/*
//#region Tab Base/Container
*/

.channelTabs-input .bd-text-input {
  border: 1px solid var(--input-border);
  width: 100%;
}

.channelTabs-fallbackInput {
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--input-background);
  color: var(--text-normal);
  font-size: 16px;
  outline: none;
}

.channelTabs-tabNav {
	display:none;
}

div:has(> div > #channelTabs-container) {
	grid-template-rows: [top] auto [titleBarEnd] min-content [noticeEnd] 1fr [end];
}

${noDragClasses.map((x) => `.${x}`).join(", ")}, [role="menu"] {
	-webkit-app-region: no-drag;
}

.channelTabs-trailing {
	--custom-app-top-bar-height: 32px;
}

/*
//#endregion
*/

#channelTabs-container {
	z-index: 1000;
	background: none;
	flex: 1;
	max-width: 100vw;
}

.channelTabs-tabContainer {
	display: flex;
	align-items: center;
}

.channelTabs-trailing {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-left: auto;
}

.channelTabs-tabContainer > *, .channelTabs-favContainer > * {
    -webkit-app-region: no-drag;
}

#channelTabs-container>:not(#channelTabs-settingsMenu)+div {
	padding-top: 4px;
}

.channelTabs-tab {
	display: flex;
	align-items: center;
	height: var(--channelTabs-tabHeight);
	background: none;
	border-radius: 4px;
	max-width: var(--channelTabs-tabWidth);
	min-width: var(--channelTabs-tabWidthMin);
	flex: 1 1 var(--channelTabs-tabWidthMin);
	margin-bottom: 3px;
}

.channelTabs-tabFolder {
	display: flex;
	align-items: center;
	gap: 6px;
	flex: 0 0 auto;
	max-width: 180px;
	height: var(--channelTabs-tabHeight);
	box-sizing: border-box;
	padding: 0 9px;
	margin: 0 3px 3px 3px;
	border-radius: 4px;
	color: var(--interactive-text-default);
	cursor: pointer;
	user-select: none;
}

.channelTabs-tabFolder:hover,
.channelTabs-tabFolder:focus-visible {
	background: var(--interactive-background-hover);
	color: var(--interactive-text-hover);
}

.channelTabs-tabFolderSelected {
	color: var(--interactive-text-active);
}

/* Open folders draw a line along the bottom of the folder label and its
   tabs. The folder holding the current tab gets a stronger U: the same line
   plus the label's left edge and the last tab's right edge. Labels and tabs
   use border-box at the tab height so the bottom lines sit level. */
.channelTabs-tabFolder.channelTabs-tabFolderOpen,
.channelTabs-tabFolder.channelTabs-tabFolderActive {
	margin-right: 0;
	border-radius: 4px 4px 0 0;
	border-bottom: 1px solid var(--channelTabs-folderLine);
}

.channelTabs-tab.channelTabs-inFolder {
	box-sizing: border-box;
	border-bottom: 1px solid var(--channelTabs-folderLine);
	border-radius: 4px 4px 0 0;
}

.channelTabs-tab.channelTabs-inFolder.channelTabs-folderEnd {
	margin-right: 3px;
}

.channelTabs-tabFolderOpen,
.channelTabs-inFolder {
	--channelTabs-folderLine: var(--border-normal);
}

.channelTabs-tabFolderActive,
.channelTabs-inActiveFolder {
	--channelTabs-folderLine: var(--text-muted);
}

.channelTabs-tabFolder.channelTabs-tabFolderActive {
	border-left: 1px solid var(--channelTabs-folderLine);
	border-radius: 0 0 0 4px;
}

.channelTabs-tab.channelTabs-inActiveFolder.channelTabs-folderEnd {
	border-right: 1px solid var(--channelTabs-folderLine);
	border-radius: 4px 0 4px 0;
}

.channelTabs-tabFolderName {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.channelTabs-tabFolderCount {
	font-size: 11px;
	color: var(--text-muted);
}

.channelTabs-tab>div:first-child {
	display: flex;
	width: calc(100% - 16px);
	align-items: center;
}

.channelTabs-tab:not(.channelTabs-selected):hover {
	background: var(--interactive-background-hover);
}

.channelTabs-tab:not(.channelTabs-selected):active {
	background: var(--interactive-background-active);
}

.channelTabs-tab.channelTabs-selected {
	background: var(--interactive-background-selected);
}

.channelTabs-tab.channelTabs-unread:not(.channelTabs-selected),
.channelTabs-tab.channelTabs-unread:not(.channelTabs-selected),
.channelTabs-tab.channelTabs-mention:not(.channelTabs-selected) {
	color: var(--interactive-text-hover);
}
.channelTabs-tab.channelTabs-unread:not(.channelTabs-selected):hover,
.channelTabs-tab.channelTabs-mention:not(.channelTabs-selected):hover {
	color: var(--interactive-text-active);
}

/*
//#endregion
*/

/*
//#region Quick Settings
*/

html:not(.platform-win) #channelTabs-settingsMenu {
	margin-right: 0;
}

#channelTabs-settingsMenu {
	display: flex;
	justify-content: center;
	align-items: center;
	width: 32px;
	height: 32px;
	z-index: 1000;
	cursor: pointer;
}

#channelTabs-settingsMenu:hover {
	background: var(--interactive-background-hover);
}

.channelTabs-settingsIcon {
	width: 20px;
	height: 20px;
}

/*
//#endregion
*/

/*
//#region Tab Name
*/

.channelTabs-tab .channelTabs-tabName {
	margin-right: 6px;
	font-size: var(--channelTabs-tabNameFontSize);
	line-height: normal;
	color: var(--interactive-text-default);
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.channelTabs-tab:not(.channelTabs-selected):hover .channelTabs-tabName {
	color: var(--interactive-text-hover);
}

.channelTabs-tab:not(.channelTabs-selected):active .channelTabs-tabName,
.channelTabs-tab.channelTabs-selected .channelTabs-tabName {
	color: var(--interactive-text-active);
}

/*
//#endregion
*/

/*
//#region Tab Icon
*/

.channelTabs-tabIcon {
	height: 20px;
	border-radius: 50%;
	-webkit-user-drag: none;
}

.channelTabs-tabIconWrapper {
	margin: 0 6px;
	flex-shrink: 0;
}

.channelTabs-onlineIcon {
	fill: hsl(139, calc(var(--saturation-factor, 1) * 47.3%), 43.9%);
	mask: url(#svg-mask-status-online);
}

.channelTabs-idleIcon {
	fill: hsl(38, calc(var(--saturation-factor, 1) * 95.7%), 54.1%);
	mask: url(#svg-mask-status-idle);
}

.channelTabs-doNotDisturbIcon {
	fill: hsl(359, calc(var(--saturation-factor, 1) * 82.6%), 59.4%);
	mask: url(#svg-mask-status-dnd);
}

.channelTabs-offlineIcon {
	fill: hsl(214, calc(var(--saturation-factor, 1) * 9.9%), 50.4%);
	mask: url(#svg-mask-status-offline);
}

/*
//#endregion
*/

/*
//#region Close Tab / New Tab
*/

.channelTabs-closeTab {
	position: relative;
	height: 16px;
	width: 16px;
	flex-shrink: 0;
	right: 6px;
	border-radius: 4px;
	color: var(--interactive-text-default);
	cursor: pointer;
}

.channelTabs-closeTab svg {
	height: 100%;
	width: 100%;
	transform: scale(0.85);
}

.channelTabs-newTab,
.channelTabs-newTabFolder,
.channelTabs-savedFolders {
	display:flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	height: var(--channelTabs-openTabSize);
	width: 24px;
	margin: 0 6px 3px 6px;
	border-radius: 4px;
	cursor: pointer;
	color: var(--interactive-text-default);
	margin-right: 6px;
}

.channelTabs-newTab:hover,
.channelTabs-newTabFolder:hover,
.channelTabs-savedFolders:hover {
	background: var(--interactive-background-hover);
	color: var(--interactive-text-hover);
}

.channelTabs-newTab:active,
.channelTabs-newTabFolder:active,
.channelTabs-savedFolders:active {
	background: var(--interactive-background-active);
	color: var(--interactive-text-active);
}

.channelTabs-savedFolders {
	width: auto;
	gap: 3px;
	padding: 0 4px;
	margin-left: 0;
}

.channelTabs-savedFoldersCount {
	font-size: 11px;
	color: var(--text-muted);
}

.channelTabs-closeTab:hover {
	background: hsl(359,calc(var(--saturation-factor, 1)*82.6%),59.4%);
	color: white;
}

.channelTabs-tabListDropdown {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	height: var(--channelTabs-openTabSize);
	width: 24px;
	margin: 0 64px 3px 0;
	border-radius: 4px;
	cursor: pointer;
	color: var(--interactive-text-default);
}

.channelTabs-tabListDropdown:hover {
	background: var(--interactive-background-hover);
	color: var(--interactive-text-hover);
}

.channelTabs-tabListDropdown:active {
	background: var(--interactive-background-active);
	color: var(--interactive-text-active);
}

.channelTabs-tabListDropdown svg {
	width: 16px;
	height: 16px;
}

/*
//#endregion
*/

/*
//#region Badges
*/

.channelTabs-gridContainer {
	display: flex;
	margin-right: 6px;
}

.channelTabs-mentionBadge,
.channelTabs-unreadBadge {
	border-radius: 8px;
	padding: 0 4px;
	min-width: 8px;
	width: fit-content;
	height: 16px;
	font-size: 12px;
	line-height: 16px;
	font-weight: 600;
	text-align: center;
	color: #fff;
}

.channelTabs-typingBadge {
	border-radius: 8px;
	padding-left: 4px;
	padding-right: 4px;
	min-width: 8px;
	width: fit-content;
	height: 16px;
	font-size: 12px;
	line-height: 16px;
	font-weight: 600;
	text-align: center;
	color: #fff;
}

.channelTabs-mentionBadge {
	background-color: hsl(359, calc(var(--saturation-factor, 1) * 82.6%), 59.4%);
}
.channelTabs-unreadBadge {
	background-color: hsl(235, calc(var(--saturation-factor, 1) * 86%), 65%);
}

.channelTabs-classicBadgeAlignment {
	margin-right: 6px;
	display: inline-block;
	float: right;
}

.channelTabs-badgeAlignLeft {
	float: left;
}

.channelTabs-badgeAlignRight {
	float: right;
}

.channelTabs-tab .channelTabs-mentionBadge,
.channelTabs-tab .channelTabs-unreadBadge,
.channelTabs-tab .channelTabs-typingBadge {
	height: 16px;
}

.channelTabs-tab .channelTabs-noMention,
.channelTabs-tab .channelTabs-noUnread {
	background-color: var(--background-primary);
	color: var(--text-muted);
}

.channelTabs-fav .channelTabs-mentionBadge,
.channelTabs-fav .channelTabs-unreadBadge {
	display: inline-block;
	vertical-align: bottom;
	float: right;
	margin-left: 2px;
}

.channelTabs-fav .channelTabs-typingBadge {
	display: inline-flex;
	vertical-align: bottom;
	float: right;
	margin-left: 2px;
	margin-right: 6px;
}

.channelTabs-fav .channelTabs-noMention,
.channelTabs-fav .channelTabs-noUnread {
	background-color: var(--background-primary);
	color: var(--text-muted);
}
.channelTabs-fav .channelTabs-noTyping {
	display: none;
}

.channelTabs-fav .channelTabs-favName + div {
	margin-left: 6px;
}

.channelTabs-favGroupBtn .channelTabs-noMention,
.channelTabs-favGroupBtn .channelTabs-noUnread {
	background-color: var(--background-primary);
	color: var(--text-muted);
}

.channelTabs-favGroupBtn .channelTabs-typingBadge {
	display: inline-flex;
	vertical-align: bottom;
	float: right;
	margin-left: 2px;
}

.channelTabs-favGroupBtn .channelTabs-mentionBadge,
.channelTabs-favGroupBtn .channelTabs-unreadBadge {
	display: inline-block;
	vertical-align: bottom;
	float: right;
	margin-left: 2px;
}

.channelTabs-favGroupBtn .channelTabs-noTyping {
	display: none;
}

/*
//#endregion
*/

/*
//#region Favs
*/

.channelTabs-favContainer {
	display: flex;
	align-items: center;
	flex-wrap:wrap;
    -webkit-app-region: drag;
}

.channelTabs-fav {
	display: flex;
	align-items: center;
	min-width: 0;
	border-radius: 4px;
	height: var(--channelTabs-favHeight);
	background: none;
	flex: 0 0 1;
	max-width: var(--channelTabs-tabWidth);
	margin-bottom: 3px;
	padding-left: 6px;
	padding-right: 6px;
}

.channelTabs-fav:hover {
	background: var(--interactive-background-hover);
}

.channelTabs-tabDropBefore {
	box-shadow: inset 2px 0 0 var(--brand-500, #5865f2);
}

.channelTabs-tabDropAfter {
	box-shadow: inset -2px 0 0 var(--brand-500, #5865f2);
}

.channelTabs-tabDropInto {
	box-shadow: inset 0 0 0 1px var(--brand-500, #5865f2);
	background: var(--interactive-background-hover);
}

/* Keep the tab row's window-drag area from swallowing the drop. */
body.channelTabs-draggingTab .channelTabs-tabContainer,
body.channelTabs-draggingFav .channelTabs-tabContainer {
	-webkit-app-region: no-drag;
}

/* Window-drag regions swallow mouse events, so let the bookmark row receive
   every click while a group is open or a bookmark is being dragged. */
.channelTabs-favContainer:has(.channelTabs-favGroupShow),
body.channelTabs-draggingFav .channelTabs-favContainer {
	-webkit-app-region: no-drag;
}

.channelTabs-favDropBefore {
	box-shadow: inset 2px 0 0 var(--brand-500, #5865f2);
}

body.channelTabs-draggingFav {
	user-select: none;
}

.channelTabs-sidebarDragGhost {
	position: fixed;
	z-index: 10000;
	pointer-events: none;
	padding: 4px 8px;
	border-radius: 4px;
	background: var(--background-floating, #111);
	color: var(--text-normal, #fff);
	font-size: 12px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.channelTabs-favDropAfter {
	box-shadow: inset -2px 0 0 var(--brand-500, #5865f2);
}

.channelTabs-favDropBefore.channelTabs-favDropVertical {
	box-shadow: inset 0 2px 0 var(--brand-500, #5865f2);
}

.channelTabs-favDropAfter.channelTabs-favDropVertical {
	box-shadow: inset 0 -2px 0 var(--brand-500, #5865f2);
}

.channelTabs-favDropInto {
	box-shadow: inset 0 0 0 2px var(--brand-500, #5865f2);
	border-radius: 4px;
}

.channelTabs-fav:active {
	background: var(--interactive-background-active);
}

.channelTabs-favIcon {
	height: 20px;
	border-radius: 50%;
	-webkit-user-drag: none;
}

.channelTabs-favName {
	margin-left: 6px;
	font-size: var(--channelTabs-tabNameFontSize);
	line-height: normal;
	color: var(--interactive-text-default);
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.channelTabs-fav:hover .channelTabs-favName {
	color: var(--interactive-text-hover);
}

.channelTabs-fav:active .channelTabs-favName {
	color: var(--interactive-text-active);
}

.channelTabs-noFavNotice {
	color: var(--text-muted);
	font-size: 14px;
	padding: 3px;
}

/*
//#endregion
*/

/*
//#region Fav Folders
*/

.channelTabs-favGroupBtn {
	display: flex;
	align-items: center;
	min-width: 0;
	border-radius: 4px;
	height: var(--channelTabs-favHeight);
	flex: 0 1 1;
	max-width: var(--channelTabs-tabWidth);
	padding: 0 6px;
	font-size: 12px;
	color: var(--interactive-text-default);
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	margin-bottom: 3px;
}

.channelTabs-favGroupBtn>:first-child {
	margin-left: 6px;
}

.channelTabs-favGroupBtn > .channelTabs-favGroupIcon {
	flex: none;
	margin: 0 6px 0 0;
	opacity: 0.8;
}

.channelTabs-favGroupName {
	overflow: hidden;
	text-overflow: ellipsis;
}

.channelTabs-favGroup:hover .channelTabs-favGroupBtn {
	background: var(--interactive-background-hover);
}

.channelTabs-favGroup-content {
	z-index: 1001;
	display: none;
	position: absolute;
	min-width: max-content;
	background-color: var(--background-surface-high);
	-webkit-box-shadow: var(--elevation-high);
	box-shadow: var(--elevation-high);
	border-radius: 4px;
	padding: 4px;
}

.channelTabs-favGroup-content>:last-child {
	margin-bottom: 0;
}

.channelTabs-favGroupShow {
	display:block;
}

.channelTabs-sliderContainer {
	display: flex;
	justify-content: center;
	padding: 4px 8px;
	margin: 2px 6px 12px 6px;
	background: var(--slider-background-normal);
	border-radius: var(--slider-background-radius);
}

.channelTabs-slider {
	position: relative;
	top: -14px;
}

.channelTabs-minimized {
	--channelTabs-tabWidth: fit-content;
	--channelTabs-tabWidthMin: fit-content;
}

.channelTabs-tab.channelTabs-minimized>div>:first-child~*,
.channelTabs-fav.channelTabs-minimized>svg:first-child~*,
.channelTabs-tab.channelTabs-minimized>.channelTabs-closeTab {
	display:none;
}

/*
//#endregion
*/
`;

			if (this.settings.compactStyle === true)
				DOM.addStyle("channelTabs-style-compact", CompactVariables);
			if (this.settings.compactStyle === false)
				DOM.addStyle("channelTabs-style-cozy", CozyVariables);
			if (this.settings.privacyMode === true)
				DOM.addStyle("channelTabs-style-private", PrivacyStyle);
			if (this.settings.radialStatusMode === true)
				DOM.addStyle("channelTabs-style-radialstatus", RadialStatusStyle);
			if (this.settings.showNavButtons === true)
				DOM.addStyle("channelTabs-style-tabnav", tabNavStyle);
			DOM.addStyle("channelTabs-style-constants", ConstantVariables);
			DOM.addStyle("channelTabs-style", BaseStyle);
			if (IS_MAC) DOM.addStyle("channelTabs-style-mac", MacTitleBarStyle);
		}

		removeStyle() {
			DOM.removeStyle("channelTabs-style-mac");
			DOM.removeStyle("channelTabs-style-compact");
			DOM.removeStyle("channelTabs-style-cozy");
			DOM.removeStyle("channelTabs-style-private");
			DOM.removeStyle("channelTabs-style-radialstatus");
			DOM.removeStyle("channelTabs-style-tabnav");
			DOM.removeStyle("channelTabs-style-constants");
			DOM.removeStyle("channelTabs-style");
		}

		//#endregion

		//#region Init/Default Functions

		ifNoTabsExist() {
			if (this.settings.tabs.length == 0)
				this.settings.tabs = [
					{
						name: getCurrentName(),
						url: location.pathname,
						selected: true,
					},
				];
		}

		ifNoSelectedTab() {
			if (!this.settings.tabs.some((tab) => tab.selected))
				this.settings.tabs[0].selected = true;
		}

		ifReopenLastChannelDefault() {
			if (this.settings.reopenLastChannel) {
				switching = true;
				navigateToUrl(
					(
						this.settings.tabs.find((tab) => tab.selected) ||
						this.settings.tabs[0]
					).url,
				);
				switching = false;
			}
		}

		//#endregion

		//#region Patches

		patchTitleBar(promiseState) {
			if (promiseState.cancelled) return;
			const unpatch = platform.patchTitleBar((props, returnValue) => {
				// Only patch if this is the main window.
				if (props.windowKey !== undefined) return;

				returnValue.props.style = { paddingInline: 0 };
				returnValue.props.children = (
					<TopBar
						leading={returnValue.props.children[1]}
						trailing={returnValue.props.children[2]}
						reopenLastChannel={this.settings.reopenLastChannel}
						showTabBar={this.settings.showTabBar}
						showFavBar={this.settings.showFavBar}
						showFavUnreadBadges={this.settings.showFavUnreadBadges}
						showFavMentionBadges={this.settings.showFavMentionBadges}
						showFavTypingBadge={this.settings.showFavTypingBadge}
						showEmptyFavBadges={this.settings.showEmptyFavBadges}
						showTabUnreadBadges={this.settings.showTabUnreadBadges}
						showTabMentionBadges={this.settings.showTabMentionBadges}
						showTabTypingBadge={this.settings.showTabTypingBadge}
						showEmptyTabBadges={this.settings.showEmptyTabBadges}
						showActiveTabUnreadBadges={this.settings.showActiveTabUnreadBadges}
						showActiveTabMentionBadges={
							this.settings.showActiveTabMentionBadges
						}
						showActiveTabTypingBadge={this.settings.showActiveTabTypingBadge}
						showEmptyActiveTabBadges={this.settings.showEmptyActiveTabBadges}
						showFavGroupUnreadBadges={this.settings.showFavGroupUnreadBadges}
						showFavGroupMentionBadges={this.settings.showFavGroupMentionBadges}
						showFavGroupTypingBadge={this.settings.showFavGroupTypingBadge}
						showEmptyFavGroupBadges={this.settings.showEmptyFavGroupBadges}
						compactStyle={this.settings.compactStyle}
						wrapTabs={this.settings.wrapTabs}
						privacyMode={this.settings.privacyMode}
						radialStatusMode={this.settings.radialStatusMode}
						tabWidthMin={this.settings.tabWidthMin}
						showQuickSettings={this.settings.showQuickSettings}
						showNavButtons={this.settings.showNavButtons}
						alwaysFocusNewTabs={this.settings.alwaysFocusNewTabs}
						useStandardNav={this.settings.useStandardNav}
						tabs={this.settings.tabs}
						tabFolders={this.settings.tabFolders ?? []}
						closedTabFolders={this.settings.closedTabFolders ?? []}
						favs={this.settings.favs}
						favGroups={this.settings.favGroups}
						ref={TopBarRef}
						plugin={this}
					/>
				);
			});

			patches.push(unpatch);
		}

		patchContextMenus() {
			patches.push(
				ContextMenu.patch("channel-context", (returnValue, props) => {
					if (!this.settings.showTabBar && !this.settings.showFavBar) return;
					returnValue.props.children.push(
						CreateTextChannelContextMenuChildren(this, props),
					);
				}),

				ContextMenu.patch("thread-context", (returnValue, props) => {
					if (!this.settings.showTabBar && !this.settings.showFavBar) return;
					returnValue.props.children.push(
						CreateThreadChannelContextMenuChildren(this, props),
					);
				}),

				ContextMenu.patch("user-context", (returnValue, props) => {
					if (!this.settings.showTabBar && !this.settings.showFavBar) return;
					if (!returnValue) return;
					if (
						!props.channel ||
						props.channel.recipients?.length !== 1 ||
						props.channel.recipients[0] !== props.user.id
					)
						return;
					returnValue.props.children.push(
						CreateDMContextMenuChildren(this, props),
					);
				}),

				ContextMenu.patch("gdm-context", (returnValue, props) => {
					if (!this.settings.showTabBar && !this.settings.showFavBar) return;
					if (!returnValue) return;
					returnValue.props.children.push(
						CreateGroupContextMenuChildren(this, props),
					);
				}),

				ContextMenu.patch("guild-context", (returnValue, props) => {
					if (
						(!this.settings.showTabBar && !this.settings.showFavBar) ||
						!props.guild
					)
						return;
					const channel = ChannelStore.getChannel(
						SelectedChannelStore.getChannelId(props.guild.id),
					);
					returnValue.props.children.push(
						CreateGuildContextMenuChildren(this, props, channel),
					);
				}),
			);
		}

		//#endregion

		//#region Handlers

		// Closes an open bookmark group when you click, press, or hit Escape outside it.
		// A press inside the open list is left alone so its bookmarks stay clickable;
		// the click that follows closes the list unless it landed on the group button,
		// which toggles itself.
		dropdownDismissHandler(e) {
			if (e.type === "keydown") {
				if (e.key === "Escape") closeAllDropdowns();
				return;
			}
			// A click that ends a bookmark drag shouldn't close the list it was dragged in.
			if (e.type === "click" && Date.now() < suppressFavClickUntil) return;
			const inside =
				e.type === "mousedown"
					? ".channelTabs-favGroup"
					: ".channelTabs-favGroupBtn";
			if (!(e.target instanceof Element) || !e.target.closest(inside))
				closeAllDropdowns();
		}

		// Dragging a channel, thread or DM from the sidebar lets it be dropped on the
		// bookmark bar, or on one of its groups, to save it as a bookmark. A plain
		// link's native drag is cancelled so the mouse drag below carries the
		// channel instead; rows Discord drags itself, to reorder channels, keep
		// their native drag and drop on the bar through it.
		sidebarDragStartHandler(e) {
			nativeSidebarDrag = false;
			if (!this.settings.showFavBar || !TopBarRef.current) return;
			const target =
				getSidebarChannel(e.target, true) ?? getServerListGuild(e.target);
			if (!target) return;
			if (!e.target.closest('[draggable="true"]')) {
				e.preventDefault();
				return;
			}
			nativeSidebarDrag = true;
			beginSidebarDrag(target);
			// ChungusServers keeps its drags from reaching the window, where Discord
			// would cancel them, so the rest of the setup can't wait for that.
			if (target.channelId == null) this.sidebarDragStartedHandler(e);
		}

		// Runs after Discord's own dragstart handlers, which may still cancel the drag.
		sidebarDragStartedHandler(e) {
			if (!nativeSidebarDrag) return;
			nativeSidebarDrag = false;
			if (e.defaultPrevented) {
				// No native drag, so the mouse drag starts once the pointer moves on.
				endFavDrag();
				return;
			}
			endSidebarMouseDrag?.();
			// Discord's drag library marks every spot outside its own drop targets
			// as not droppable, after the bar's handlers have run. Listening from
			// now on runs after it, so the bar can accept the drop again.
			for (const type of ["dragenter", "dragover"])
				window.addEventListener(type, allowSidebarDropOnBar);
		}

		sidebarDragEndHandler() {
			stopAllowingSidebarDrop();
			if (!currentFavDrag.external) return;
			endFavDrag();
		}

		sidebarMouseDownHandler(e) {
			stopAllowingSidebarDrop();
			if (currentFavDrag.external) endFavDrag();
			if (
				e.button !== 0 ||
				!this.settings.showFavBar ||
				!TopBarRef.current ||
				!(e.target instanceof Element)
			)
				return;
			const target = getSidebarChannel(e.target);
			if (!target) return;
			const startX = e.clientX;
			const startY = e.clientY;
			let ghost = null;
			const moving = (event) => {
				if (!currentFavDrag.external) {
					if (Math.hypot(event.clientX - startX, event.clientY - startY) < 8)
						return;
					beginSidebarDrag(target);
					ghost = document.createElement("div");
					ghost.className = "channelTabs-sidebarDragGhost";
					ghost.textContent = target.name;
					document.body.append(ghost);
				}
				ghost.style.left = `${event.clientX + 12}px`;
				ghost.style.top = `${event.clientY + 12}px`;
			};
			const stop = () => {
				endSidebarMouseDrag = null;
				document.removeEventListener("mousemove", moving);
				document.removeEventListener("mouseup", releasing, true);
				window.removeEventListener("blur", cancelling);
				ghost?.remove();
			};
			const finish = (drop) => {
				stop();
				if (!currentFavDrag.external) return;
				const { fav, target: place } = currentFavDrag;
				endFavDrag();
				// The click that ends the drag would otherwise open the channel.
				suppressSidebarClickUntil = Date.now() + 100;
				if (drop && place) TopBarRef.current?.addFavAt(fav, place);
			};
			const releasing = () => finish(true);
			const cancelling = () => finish(false);
			endSidebarMouseDrag = stop;
			document.addEventListener("mousemove", moving);
			document.addEventListener("mouseup", releasing, true);
			window.addEventListener("blur", cancelling);
		}

		sidebarClickHandler(e) {
			if (Date.now() >= suppressSidebarClickUntil) return;
			e.preventDefault();
			e.stopPropagation();
		}

		commandClickHandler(e) {
			if (
				!this.settings.showTabBar ||
				!TopBarRef.current ||
				e.button !== 0 ||
				!(e.target instanceof Element)
			)
				return;
			if (!matchesClickShortcut(e, this.settings.sidebarTabShortcut ?? "meta"))
				return;

			const guildIcon = e.target.closest('[data-list-item-id^="guildsnav___"]');
			const iconGuildId = guildIcon
				?.getAttribute("data-list-item-id")
				?.match(/^guildsnav___(\d+)$/)?.[1];
			const guild = iconGuildId && GuildStore.getGuild(iconGuildId);
			if (guild) {
				e.preventDefault();
				e.stopPropagation();
				TopBarRef.current.saveChannel(guild.id, null, guild.name);
				return;
			}

			const target = getSidebarChannel(e.target);
			if (!target) return;
			e.preventDefault();
			e.stopPropagation();
			TopBarRef.current.saveChannel(
				target.guildId,
				target.channelId,
				target.name,
			);
		}

		numberedTabKeybindHandler(e) {
			if (e.target?.closest?.("[data-chungus-shortcut-recorder]")) return;
			if (!this.settings.showTabBar || !TopBarRef.current) return;
			const index = getNumberedTabIndex(e, getNumberTabModifier(this.settings));
			if (index < 0) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			const visibleTabs = getTabDisplayItems(
				TopBarRef.current.state.tabs,
				TopBarRef.current.state.tabFolders,
			).filter((item) => item.type === "tab");
			if (!e.repeat && visibleTabs[index])
				TopBarRef.current.switchToTab(visibleTabs[index].tabIndex);
		}

		keybindHandler(e) {
			if (e.target?.closest?.("[data-chungus-shortcut-recorder]")) return;
			if (
				!e.repeat &&
				!e.isComposing &&
				TopBarRef.current &&
				matchesShortcut(e, getShortcut(this.settings, "closeTab"))
			) {
				e.preventDefault();
				e.stopPropagation();
				if (TopBarRef.current.state.tabs.length > 1) this.closeCurrentTab();
				else window.close();
				return;
			}
			if (e.repeat || e.isComposing) return;
			for (const [id, action] of [
				["newTab", this.openNewTab],
				["previousTab", this.previousTab],
				["nextTab", this.nextTab],
			]) {
				if (!matchesShortcut(e, getShortcut(this.settings, id))) continue;
				e.preventDefault();
				e.stopPropagation();
				action();
				return;
			}
		}

		//#endregion

		//#region General Functions

		onSwitch() {
			if (switching) return;
			//console.log(this);
			if (TopBarRef.current) {
				TopBarRef.current.setState(
					{
						tabs: TopBarRef.current.state.tabs.map((tab) => {
							if (tab.selected) {
								const channelId = SelectedChannelStore.getChannelId();
								return {
									...tab,
									name: getCurrentName(),
									url: location.pathname,
									selected: true,
									currentStatus: getCurrentUserStatus(location.pathname),
									channelId: channelId,
									minimized:
										this.settings.tabs[
											this.settings.tabs.findIndex((tab) => tab.selected)
										].minimized,
								};
							} else {
								return Object.assign({}, tab);
							}
						}),
					},
					this.saveSettings,
				);
			} else if (!this.settings.reopenLastChannel) {
				const channelId = SelectedChannelStore.getChannelId();
				this.settings.tabs[
					this.settings.tabs.findIndex((tab) => tab.selected)
				] = {
					name: getCurrentName(),
					url: location.pathname,
					selected: true,
					currentStatus: getCurrentUserStatus(location.pathname),
					channelId: channelId,
					minimized:
						this.settings.tabs[
							this.settings.tabs.findIndex((tab) => tab.selected)
						].minimized,
				};
			}
		}

		mergeItems(itemsTab, itemsFav) {
			const out = [];
			if (this.settings.showTabBar) out.push(...itemsTab);
			if (this.settings.showFavBar) out.push(...itemsFav);
			return out;
		}

		//#endregion

		//#region Hotkey Functions

		nextTab() {
			if (TopBarRef.current)
				TopBarRef.current.switchToTab(
					(TopBarRef.current.state.selectedTabIndex + 1) %
						TopBarRef.current.state.tabs.length,
				);
		}

		previousTab() {
			if (TopBarRef.current)
				TopBarRef.current.switchToTab(
					(TopBarRef.current.state.selectedTabIndex -
						1 +
						TopBarRef.current.state.tabs.length) %
						TopBarRef.current.state.tabs.length,
				);
		}

		closeCurrentTab() {
			if (TopBarRef.current)
				TopBarRef.current.closeTab(TopBarRef.current.state.selectedTabIndex);
		}

		openNewTab() {
			if (!TopBarRef.current) return;
			TopBarRef.current.openNewTab();
		}

		//#endregion

		//#region Settings

		get defaultVariables() {
			return {
				tabs: [],
				tabFolders: [],
				closedTabFolders: [],
				favs: [],
				favGroups: [],
				showTabBar: true,
				showFavBar: true,
				reopenLastChannel: false,
				showFavUnreadBadges: true,
				showFavMentionBadges: true,
				showFavTypingBadge: true,
				showEmptyFavBadges: false,
				showTabUnreadBadges: true,
				showTabMentionBadges: true,
				showTabTypingBadge: true,
				showEmptyTabBadges: false,
				showActiveTabUnreadBadges: false,
				showActiveTabMentionBadges: false,
				showActiveTabTypingBadge: false,
				showEmptyActiveTabBadges: false,
				compactStyle: false,
				privacyMode: false,
				radialStatusMode: false,
				tabWidthMin: 100,
				showFavGroupUnreadBadges: true,
				showFavGroupMentionBadges: true,
				showFavGroupTypingBadge: true,
				showEmptyFavGroupBadges: false,
				showQuickSettings: true,
				showNavButtons: true,
				closeTabShortcut: [...TAB_SHORTCUTS.closeTab.default],
				newTabShortcut: [...TAB_SHORTCUTS.newTab.default],
				previousTabShortcut: [...TAB_SHORTCUTS.previousTab.default],
				nextTabShortcut: [...TAB_SHORTCUTS.nextTab.default],
				sidebarTabShortcut: "meta",
				numberTabShortcut: "meta",
				rememberScroll: true,
				alwaysFocusNewTabs: false,
				useStandardNav: true,
			};
		}

		getSettingsPath(useOldLocation) {
			if (useOldLocation === true) {
				return DATA_NAME;
			} else {
				const user_id = UserStore.getCurrentUser()?.id;
				return DATA_NAME + "_new" + (user_id != null ? "_" + user_id : "");
			}
		}

		loadSettings() {
			if (
				Object.keys(Data.load(this.getSettingsPath(), "settings") ?? {})
					.length === 0
			) {
				this.settings =
					Data.load(this.getSettingsPath(true), "settings") ??
					this.defaultVariables;
			} else {
				this.settings =
					Data.load(this.getSettingsPath(), "settings") ??
					this.defaultVariables;
			}
			if (!Array.isArray(this.settings.tabFolders))
				this.settings.tabFolders = [];
			if (!Array.isArray(this.settings.closedTabFolders))
				this.settings.closedTabFolders = [];
			this.settings.favs = this.settings.favs.map((fav) => {
				if (fav.channelId === undefined) {
					const match = fav.url.match(/^\/channels\/[^\/]+\/(\d+)$/);
					if (match) return Object.assign(fav, { channelId: match[1] });
				}
				if (fav.groupId === undefined) {
					return Object.assign(fav, { groupId: -1 });
				}
				return fav;
			});
			this.saveSettings();
		}

		saveSettings() {
			if (TopBarRef.current) {
				this.settings.tabs = TopBarRef.current.state.tabs;
				this.settings.tabFolders = TopBarRef.current.state.tabFolders;
				this.settings.closedTabFolders =
					TopBarRef.current.state.closedTabFolders;
				this.settings.favs = TopBarRef.current.state.favs;
				this.settings.favGroups = TopBarRef.current.state.favGroups;
			}

			try {
				const activeTabId = this.tabApi?.getActiveTabId();
				Data.save(this.getSettingsPath(), "settings", this.settings);
				// A same-channel tab switch need not dispatch CHANNEL_SELECT.
				if (activeTabId !== this.lastPublishedTabId) {
					this.lastPublishedTabId = activeTabId;
					window.dispatchEvent(new Event("chungus-tabs-change"));
				}
			} catch (error) {
				console.error("Error saving settings:", error);
			}
		}

		getSettingsPanel() {
			return UI.buildSettingsPanel({
				settings: [
					//#region Startup Settings
					{
						id: "startupSettings",
						type: "category",
						name: "Startup Settings",
						settings: [
							{
								id: "reopenLastChannel",
								type: "switch",
								name: "Reopen last channel",
								note: "When starting the plugin (or discord) the channel will be selected again instead of the friends page",
								value: this.settings.reopenLastChannel,
								onChange: (checked) => {
									this.settings.reopenLastChannel = checked;
									this.saveSettings();
								},
							},
						],
					},
					//#endregion

					//#region General Appearance
					{
						id: "generalAppearance",
						type: "category",
						name: "General Appearance",
						settings: [
							{
								id: "showTabBar",
								type: "switch",
								name: "Show Tab Bar",
								note: "Allows you to have multiple tabs like in a web browser",
								value: this.settings.showTabBar,
								onChange: (checked) => {
									this.settings.showTabBar = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showTabBar: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showFavBar",
								type: "switch",
								name: "Show Fav Bar",
								note: "Allows you to add favorites by right clicking a tab or the fav bar",
								value: this.settings.showFavBar,
								onChange: (checked) => {
									this.settings.showFavBar = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showFavBar: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showQuickSettings",
								type: "switch",
								name: "Show Quick Settings",
								note: "Allows you to quickly change major settings from a context menu",
								value: this.settings.showQuickSettings,
								onChange: (checked) => {
									this.settings.showQuickSettings = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showQuickSettings: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showNavButtons",
								type: "switch",
								name: "Show Navigation Buttons",
								note: "Click to go the left or right tab, this behavior can be changed in Behavior settings",
								value: this.settings.showNavButtons,
								onChange: (checked) => {
									this.settings.showNavButtons = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showNavButtons: checked,
										});
									this.removeStyle();
									this.applyStyle();
									this.saveSettings();
								},
							},
							{
								id: "compactStyle",
								type: "switch",
								name: "Use Compact Look",
								note: "",
								value: this.settings.compactStyle,
								onChange: (checked) => {
									this.settings.compactStyle = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											compactStyle: checked,
										});
									this.removeStyle();
									this.applyStyle();
									this.saveSettings();
								},
							},
							{
								id: "wrapTabs",
								type: "switch",
								name: "Wrap Tabs",
								note: "Enables wrapping of tabs to the next line when they overflow",
								value: this.settings.wrapTabs,
								onChange: (checked) => {
									this.settings.wrapTabs = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											wrapTabs: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "privacyMode",
								type: "switch",
								name: "Enable Privacy Mode",
								note: "Obfusicates all the Sensitive Text in ChungusTabs",
								value: this.settings.privacyMode,
								onChange: (checked) => {
									this.settings.privacyMode = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											privacyMode: checked,
										});
									this.removeStyle();
									this.applyStyle();
									this.saveSettings();
								},
							},
							{
								id: "radialStatusMode",
								type: "switch",
								name: "Use Radial Status Indicators",
								note: "Changes the status indicator into a circular border",
								value: this.settings.radialStatusMode,
								onChange: (checked) => {
									this.settings.radialStatusMode = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											radialStatusMode: checked,
										});
									this.removeStyle();
									this.applyStyle();
									this.saveSettings();
								},
							},
							{
								id: "tabWidthMin",
								type: "slider",
								name: "Minimum Tab Width",
								note: "Set the limit on how small a tab can be before overflowing to a new row",
								min: 58,
								max: 220,
								value: this.settings.tabWidthMin,
								onChange: (value) => (
									(this.settings.tabWidthMin = Math.round(value)),
									this.saveSettings(),
									document.documentElement.style.setProperty(
										"--channelTabs-tabWidthMin",
										this.settings.tabWidthMin + "px",
									)
								),
								defaultValue: 100,
								markers: [60, 85, 100, 125, 150, 175, 200, 220],
								units: "px",
							},
						],
					},

					//#endregion

					//#region Behavior Settings
					{
						id: "behavior",
						type: "category",
						name: "Behavior",
						settings: [
							{
								id: "numberTabShortcut",
								type: "dropdown",
								name: "Switch tabs by number",
								note: "Hold this key and press 1 to 9 to jump to that tab, counting visible tabs from the left. Turn it off to keep Discord's own shortcuts.",
								value: getNumberTabModifier(this.settings),
								options: [
									{
										label: IS_MAC ? "Command + number" : "Ctrl + number",
										value: "meta",
									},
									{
										label: IS_MAC ? "Option + number" : "Alt + number",
										value: "alt",
									},
									{ label: "Off", value: "off" },
								],
								onChange: (value) => {
									this.settings.numberTabShortcut = value;
									this.saveSettings();
								},
							},
							{
								id: "rememberScroll",
								type: "switch",
								name: "Remember scroll position per tab",
								note: "Each tab remembers how far you scrolled the channel list, the chat messages and the member list, and restores them when you switch back to that tab.",
								value: this.settings.rememberScroll !== false,
								onChange: (checked) => {
									this.settings.rememberScroll = checked;
									this.saveSettings();
								},
							},
							...[
								{
									id: "newTab",
									name: "New tab",
									note: "Opens a new tab. Click to record a different shortcut, or clear it to turn this off.",
								},
								{
									id: "closeTab",
									name: "Close current tab",
									note: "Closes the Discord window on the last tab. Click to record a different shortcut, or clear it to turn this off.",
								},
								{
									id: "previousTab",
									name: "Previous tab",
									note: "Switches to the tab on the left. Click to record a different shortcut, or clear it to turn this off.",
								},
								{
									id: "nextTab",
									name: "Next tab",
									note: "Switches to the tab on the right. Click to record a different shortcut, or clear it to turn this off.",
								},
							].map(({ id, name, note }) => ({
								id: TAB_SHORTCUTS[id].setting,
								type: "keybind",
								name,
								note: `Default: ${formatShortcut(TAB_SHORTCUTS[id].default)}. ${note}`,
								value: getShortcut(this.settings, id),
								max: 4,
								clearable: true,
								onChange: (value) => {
									this.settings[TAB_SHORTCUTS[id].setting] = value;
									this.saveSettings();
								},
							})),
							{
								id: "sidebarTabShortcut",
								type: "dropdown",
								name: "Open sidebar item or bookmark in new tab",
								note: "Choose a modifier to hold while clicking a server icon, channel, thread, direct message, or bookmark. The new tab follows your auto-focus setting.",
								value: this.settings.sidebarTabShortcut ?? "meta",
								options: [
									{
										label: IS_MAC ? "Command-click" : "Ctrl-click",
										value: "meta",
									},
									{
										label: IS_MAC ? "Command-Shift-click" : "Ctrl-Shift-click",
										value: "meta+shift",
									},
									{
										label: IS_MAC ? "Option-click" : "Alt-click",
										value: "alt",
									},
									{
										label: IS_MAC ? "Option-Shift-click" : "Alt-Shift-click",
										value: "alt+shift",
									},
									{ label: "Shift-click", value: "shift" },
									{ label: "Off", value: "off" },
								],
								onChange: (value) => {
									this.settings.sidebarTabShortcut = value;
									this.saveSettings();
								},
							},
							{
								id: "alwaysFocusNewTabs",
								type: "switch",
								name: "Always Auto Focus New Tabs",
								note: "Forces all newly created tabs to bring themselves to focus",
								value: this.settings.alwaysFocusNewTabs,
								onChange: (checked) => {
									this.settings.alwaysFocusNewTabs = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											alwaysFocusNewTabs: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "useStandardNav",
								type: "switch",
								name: "Primary Forward/Back Navigation",
								note: "Instead of scrolling down the row, use the previous and next buttons to navigate between pages",
								value: this.settings.useStandardNav,
								onChange: (checked) => {
									this.settings.useStandardNav = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											useStandardNav: checked,
										});
									this.saveSettings();
								},
							},
						],
					},

					//#endregion

					//#region Badge Visibility - Favs

					{
						id: "badgeVisibilityFavorites",
						type: "category",
						name: "Badge Visibility - Favorites",
						settings: [
							{
								id: "showFavUnreadBadges",
								type: "switch",
								name: "Show Unread",
								note: "",
								value: this.settings.showFavUnreadBadges,
								onChange: (checked) => {
									this.settings.showFavUnreadBadges = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showFavUnreadBadges: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showFavMentionBadges",
								type: "switch",
								name: "Show Mentions",
								note: "",
								value: this.settings.showFavMentionBadges,
								onChange: (checked) => {
									this.settings.showFavMentionBadges = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showFavMentionBadges: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showFavTypingBadge",
								type: "switch",
								name: "Show Typing",
								note: "",
								value: this.settings.showFavTypingBadge,
								onChange: (checked) => {
									this.settings.showFavTypingBadge = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showFavTypingBadge: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showEmptyFavBadges",
								type: "switch",
								name: "Show Empty",
								note: "",
								value: this.settings.showEmptyFavBadges,
								onChange: (checked) => {
									this.settings.showEmptyFavBadges = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showEmptyFavBadges: checked,
										});
									this.saveSettings();
								},
							},
						],
					},

					//#endregion

					//#region Badge Visibility - Fav Groups

					{
						id: "badgeVisibilityFavoriteGroups",
						type: "category",
						name: "Badge Visibility - Favorite Groups",
						settings: [
							{
								id: "showFavGroupUnreadBadges",
								type: "switch",
								name: "Show Unread",
								note: "",
								value: this.settings.showFavGroupUnreadBadges,
								onChange: (checked) => {
									this.settings.showFavGroupUnreadBadges = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showFavGroupUnreadBadges: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showFavGroupMentionBadges",
								type: "switch",
								name: "Show Mentions",
								note: "",
								value: this.settings.showFavGroupMentionBadges,
								onChange: (checked) => {
									this.settings.showFavGroupMentionBadges = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showFavGroupMentionBadges: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showFavGroupTypingBadge",
								type: "switch",
								name: "Show Typing",
								note: "",
								value: this.settings.showFavGroupTypingBadge,
								onChange: (checked) => {
									this.settings.showFavGroupTypingBadge = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showFavGroupTypingBadge: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showEmptyGroupFavBadges",
								type: "switch",
								name: "Show Empty",
								note: "",
								value: this.settings.showEmptyGroupFavBadges,
								onChange: (checked) => {
									this.settings.showEmptyGroupFavBadges = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showEmptyGroupFavBadges: checked,
										});
									this.saveSettings();
								},
							},
						],
					},

					//#endregion

					//#region Badge Visibility - Tabs

					{
						id: "badgeVisibilityTabs",
						type: "category",
						name: "Badge Visibility - Tabs",
						settings: [
							{
								id: "showTabUnreadBadges",
								type: "switch",
								name: "Show Unread",
								note: "",
								value: this.settings.showTabUnreadBadges,
								onChange: (checked) => {
									this.settings.showTabUnreadBadges = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showTabUnreadBadges: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showTabMentionBadges",
								type: "switch",
								name: "Show Mentions",
								note: "",
								value: this.settings.showTabMentionBadges,
								onChange: (checked) => {
									this.settings.showTabMentionBadges = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showTabMentionBadges: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showTabTypingBadge",
								type: "switch",
								name: "Show Typing",
								note: "",
								value: this.settings.showTabTypingBadge,
								onChange: (checked) => {
									this.settings.showTabTypingBadge = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showTabTypingBadge: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showEmptyTabBadges",
								type: "switch",
								name: "Show Empty",
								note: "",
								value: this.settings.showEmptyTabBadges,
								onChange: (checked) => {
									this.settings.showEmptyTabBadges = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showEmptyTabBadges: checked,
										});
									this.saveSettings();
								},
							},
						],
					},

					//#endregion

					//#region Badge Visibility - Active Tabs

					{
						id: "badgeVisibilityActiveTabs",
						type: "category",
						name: "Badge Visibility - Active Tabs",
						settings: [
							{
								id: "showActiveTabUnreadBadges",
								type: "switch",
								name: "Show Unread",
								note: "",
								value: this.settings.showActiveTabUnreadBadges,
								onChange: (checked) => {
									this.settings.showActiveTabUnreadBadges = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showActiveTabUnreadBadges: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showActiveTabMentionBadges",
								type: "switch",
								name: "Show Mentions",
								note: "",
								value: this.settings.showActiveTabMentionBadges,
								onChange: (checked) => {
									this.settings.showActiveTabMentionBadges = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showActiveTabMentionBadges: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showActiveTabTypingBadge",
								type: "switch",
								name: "Show Typing",
								note: "",
								value: this.settings.showActiveTabTypingBadge,
								onChange: (checked) => {
									this.settings.showActiveTabTypingBadge = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showActiveTabTypingBadge: checked,
										});
									this.saveSettings();
								},
							},
							{
								id: "showEmptyActiveTabBadges",
								type: "switch",
								name: "Show Empty",
								note: "",
								value: this.settings.showEmptyActiveTabBadges,
								onChange: (checked) => {
									this.settings.showEmptyActiveTabBadges = checked;
									if (TopBarRef.current)
										TopBarRef.current.setState({
											showEmptyActiveTabBadges: checked,
										});
									this.saveSettings();
								},
							},
						],
					},

					//#endregion
				],
			});
		}

		//#endregion
	}

	//#endregion

	return ChannelTabs;
}
