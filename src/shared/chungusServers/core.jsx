// ChungusServers' server list, shared by the BetterDiscord and Vencord
// versions. Each version finds Discord's pieces its own way and passes them to
// init() before anything here runs. The BetterDiscord build turns JSX into
// React.createElement, so `React` must be a variable in this file.

let React;
let useState, useEffect, useMemo, useRef, useContext, useReducer;
let useStateFromStores;

let SortedGuildStore;
let GuildStore;
let GuildReadStateStore;
let SelectedGuildStore;
let SelectedChannelStore;
let UserGuildSettingsStore;
let PrivateChannelReadStateStore;
let ReadStateStore;
let ChannelStore;
let UserStore;
let RelationshipStore;
let RTCConnectionStore;
let ChannelRTCStore;

let GuildIconUtils;
let ChannelIconUtils;
let GuildNavigation;
let transitionTo;
let GuildCreation;
let GlobalDiscovery;
let NotificationActions;
// Discord's mute lengths, with labels in the user's language.
let getMuteOptions;
// Discord's own save for the server list. It takes folders in
// SortedGuildStore.getGuildFolders() form and syncs them to every device.
let saveGuildFolders;
let SidebarClasses;

// What each version provides besides Discord's modules:
//   storage: { load(key), save(key, value), delete(key) }
//   toast(text, type), where type is "success", "error" or "info"
//   confirm(title, body, { confirmText, danger, onConfirm })
//   openMenu(event, render): opens a context menu at the event
//   buildMenuChildren(items): BetterDiscord-style menu items to elements
//   Menu: Discord's menu component
//   SettingsSwitches({ settings, onChange }): switch rows for the settings panel
//   webpackRequire(): Discord's webpack require
let platform;

let DragContext;
let ErrorBoundary;

export function init(options) {
	platform = options;
	React = options.React;
	({ useState, useEffect, useMemo, useRef, useContext, useReducer } = React);
	useStateFromStores = options.useStateFromStores;
	({
		SortedGuildStore,
		GuildStore,
		GuildReadStateStore,
		SelectedGuildStore,
		SelectedChannelStore,
		UserGuildSettingsStore,
		PrivateChannelReadStateStore,
		ReadStateStore,
		ChannelStore,
		UserStore,
		RelationshipStore,
		RTCConnectionStore,
		ChannelRTCStore,
	} = options.stores);
	({
		GuildIconUtils,
		ChannelIconUtils,
		GuildNavigation,
		transitionTo,
		GuildCreation,
		GlobalDiscovery,
		NotificationActions,
		getMuteOptions,
		saveGuildFolders,
		SidebarClasses,
	} = options.modules);
	DragContext = React.createContext(null);
	ErrorBoundary = class extends React.Component {
		state = { error: null };
		static getDerivedStateFromError(error) {
			return { error };
		}
		componentDidCatch(error) {
			console.error("ChungusServers crashed; showing Discord's bar", error);
		}
		render() {
			return this.state.error ? this.props.fallback : this.props.children;
		}
	};
}

// Whether Discord's server list and the stores it needs were found.
export function isSupported() {
	return Boolean(SortedGuildStore && GuildStore);
}

const DRAG_TYPE = "application/x-chungus-servers";
// Dragging the column narrower than this switches to Discord's icon bar.
const ICON_MODE_BELOW = 120;
const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 240;

const defaults = {
	width: DEFAULT_WIDTH,
	iconMode: false,
	// Folder ids whose servers are shown. Kept apart from Discord's own
	// expanded folders, so the icon bar keeps its state.
	expanded: {},
	// Server ids shown in the Pinned section, in order. Pins are local: Discord
	// has nothing like them, and the servers stay where they are below too.
	pinned: [],
	pinnedCollapsed: false,
	// Parent folders, by id: { name, members }. `members` are the keys
	// ("f:<folderId>" or "g:<guildId>") of the folders and loose servers inside.
	// Discord's folders can't nest, so these are local too.
	parents: {},
	// Icon choices by key ("g:<guildId>", "f:<folderId>" or "parent:<id>"):
	// { hidden, image, hideServers }. `image` is a small data URL for a folder's
	// own picture, and `hideServers` hides the icons of a folder's servers.
	// Local, like the parent folders.
	icons: {},
	showUnreadDMs: true,
	showDiscover: true,
};

//#region Settings

let settings = { ...defaults };
const settingsListeners = new Set();

function setSettings(patch, persist = true) {
	if (patch.parents) patch = { ...patch, icons: pruneParentIcons(patch) };
	settings = { ...settings, ...patch };
	if (persist) platform.storage.save("settings", settings);
	for (const listener of settingsListeners) listener();
}

function useSettings() {
	const [, rerender] = useReducer((n) => n + 1, 0);
	useEffect(() => {
		settingsListeners.add(rerender);
		return () => settingsListeners.delete(rerender);
	}, []);
	return settings;
}

// `key` is a folder id, or "parent:<id>" for a parent folder.
function setExpanded(key, expanded) {
	const next = { ...settings.expanded };
	if (expanded) next[key] = true;
	else delete next[key];
	setSettings({ expanded: next });
}

// The parent folder being renamed in place. Not saved.
let renamingParent = null;
function setRenamingParent(id) {
	renamingParent = id;
	for (const listener of settingsListeners) listener();
}

function renameParent(id, name) {
	const parent = settings.parents[id];
	if (!parent || parent.name === name) return;
	setSettings({ parents: { ...settings.parents, [id]: { ...parent, name } } });
}

// An empty parent folder at the end of the list, being named.
function createParent() {
	const id = newParentId(settings.parents);
	setSettings({
		parents: { ...settings.parents, [id]: { name: "", members: [] } },
		expanded: { ...settings.expanded, [`parent:${id}`]: true },
	});
	setRenamingParent(id);
}

// Takes the folders and servers back out of a parent folder, where they are,
// or deletes an empty one.
function ungroupParent(id) {
	const { [id]: _, ...parents } = settings.parents;
	const expanded = { ...settings.expanded };
	delete expanded[`parent:${id}`];
	setSettings({ parents, expanded });
}

function togglePin(guildId) {
	setSettings({
		pinned: settings.pinned.includes(guildId)
			? settings.pinned.filter((id) => id !== guildId)
			: [...settings.pinned, guildId],
	});
}

// Pins `guildId` beside the pinned server `ref`, or last when `ref` is null.
// Returns the new pins, or null when nothing changes.
function movePin(pinned, guildId, ref, after) {
	const next = pinned.filter((id) => id !== guildId);
	const index = ref == null ? -1 : next.indexOf(ref);
	if (index < 0) next.push(guildId);
	else next.splice(index + (after ? 1 : 0), 0, guildId);
	return next.join() === pinned.join() ? null : next;
}

// Drops the icons of parent folders that no longer exist.
function pruneParentIcons(patch) {
	const icons = patch.icons ?? settings.icons;
	const gone = Object.keys(icons).filter(
		(key) => key.startsWith("parent:") && !(key.slice(7) in patch.parents),
	);
	if (!gone.length) return icons;
	const next = { ...icons };
	for (const key of gone) delete next[key];
	return next;
}

// Changes the icon choices for `key`, dropping any that are back to normal.
function setIcon(key, patch) {
	const next = { ...settings.icons[key], ...patch };
	for (const name of Object.keys(next)) if (!next[name]) delete next[name];
	const icons = { ...settings.icons };
	if (Object.keys(next).length) icons[key] = next;
	else delete icons[key];
	setSettings({ icons });
}

// The icon choices for `key`. Unlike useSettings, it only rerenders when they
// change, so every row doesn't rerender while the list is resized.
function useIcon(key) {
	const [, rerender] = useReducer((n) => n + 1, 0);
	const current = settings.icons[key];
	const seen = useRef(current);
	seen.current = current;
	useEffect(() => {
		const listener = () => {
			if (settings.icons[key] !== seen.current) rerender();
		};
		settingsListeners.add(listener);
		return () => settingsListeners.delete(listener);
	}, [key]);
	return current;
}

const ICON_IMAGE_SIZE = 64;

// Crops a picture to a square from its middle and scales it down, so a large
// one doesn't bloat the saved settings.
async function shrinkImage(file) {
	const bitmap = await createImageBitmap(file);
	const side = Math.min(bitmap.width, bitmap.height);
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = ICON_IMAGE_SIZE;
	const context = canvas.getContext("2d");
	context.imageSmoothingQuality = "high";
	context.drawImage(
		bitmap,
		(bitmap.width - side) / 2,
		(bitmap.height - side) / 2,
		side,
		side,
		0,
		0,
		ICON_IMAGE_SIZE,
		ICON_IMAGE_SIZE,
	);
	bitmap.close();
	return canvas.toDataURL("image/png");
}

function chooseIconImage(key) {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = "image/png,image/jpeg,image/gif,image/webp";
	input.onchange = async () => {
		const file = input.files?.[0];
		if (!file) return;
		try {
			setIcon(key, { image: await shrinkImage(file), hidden: false });
		} catch {
			platform.toast("ChungusServers couldn't read that image", "error");
		}
	};
	input.click();
}

// The Folder Icon submenu for a folder or parent folder.
function folderIconMenu(key) {
	const icon = settings.icons[key];
	return {
		type: "submenu",
		id: "chungus-servers-folder-icon",
		label: "Folder Icon",
		items: [
			{
				id: "chungus-servers-icon-image",
				label: "Choose Image…",
				action: () => chooseIconImage(key),
			},
			icon?.image && {
				id: "chungus-servers-icon-default",
				label: "Use Default Icon",
				action: () => setIcon(key, { image: null }),
			},
			{
				id: "chungus-servers-icon-hide",
				label: icon?.hidden ? "Show Icon" : "Hide Icon",
				action: () => setIcon(key, { hidden: !icon?.hidden }),
			},
		].filter(Boolean),
	};
}

//#endregion

//#region Folder notifications

const MUTE_OPTIONS = [
	{ value: 900, label: "For 15 Minutes" },
	{ value: 3600, label: "For 1 Hour" },
	{ value: 10800, label: "For 3 Hours" },
	{ value: 28800, label: "For 8 Hours" },
	{ value: 86400, label: "For 24 Hours" },
	{ value: -1, label: "Until I turn it back on" },
];

// Discord's message notification levels.
const ALL_MESSAGES = 0;
const ONLY_MENTIONS = 1;
const NO_MESSAGES = 2;

// Mute and notification items for a Discord folder, which change every server
// in it at once. Discord's folder menu has neither. A choice shows as checked
// only when all the servers have it.
function folderNotificationItems(folderId) {
	const ids =
		SortedGuildStore.getGuildFolders()
			.find((folder) => folder.folderId === folderId)
			?.guildIds.filter((id) => GuildStore.getGuild(id)) ?? [];
	if (!ids.length || !NotificationActions || !UserGuildSettingsStore) return [];
	const store = UserGuildSettingsStore;
	const update = (patch) => {
		for (const id of ids)
			NotificationActions.updateGuildNotificationSettings(id, patch);
	};
	const mute = (seconds) =>
		update({
			muted: true,
			mute_config: {
				selected_time_window: seconds,
				end_time:
					seconds > 0
						? new Date(Date.now() + seconds * 1000).toISOString()
						: null,
			},
		});
	const muted = ids.filter((id) => store.isMuted(id)).length;
	let options = MUTE_OPTIONS;
	try {
		options = getMuteOptions?.() ?? MUTE_OPTIONS;
	} catch {}
	const level = (value) => ({
		type: "radio",
		id: `chungus-servers-level-${value}`,
		checked: ids.every((id) => store.getMessageNotifications(id) === value),
		action: () => update({ message_notifications: value }),
	});
	const toggle = (id, label, isOn, setting) => {
		const on = ids.every((guildId) => isOn(guildId));
		return {
			type: "toggle",
			id: `chungus-servers-${id}`,
			label,
			checked: on,
			action: () => update({ [setting]: !on }),
		};
	};
	return [
		muted < ids.length && {
			type: "submenu",
			id: "chungus-servers-mute-folder",
			label: "Mute Folder",
			action: () => mute(-1),
			items: options.map((option) => ({
				id: `chungus-servers-mute-${option.value}`,
				label: option.label,
				action: () => mute(option.value),
			})),
		},
		muted > 0 && {
			id: "chungus-servers-unmute-folder",
			label: "Unmute Folder",
			action: () => update({ muted: false }),
		},
		{
			type: "submenu",
			id: "chungus-servers-folder-notifications",
			label: "Notification Settings",
			items: [
				{ ...level(ALL_MESSAGES), label: "All Messages" },
				{ ...level(ONLY_MENTIONS), label: "Only @mentions" },
				{ ...level(NO_MESSAGES), label: "Nothing" },
				{ type: "separator" },
				toggle(
					"suppress-everyone",
					"Suppress @everyone and @here",
					(id) => store.isSuppressEveryoneEnabled(id),
					"suppress_everyone",
				),
				toggle(
					"suppress-roles",
					"Suppress All Role @mentions",
					(id) => store.isSuppressRolesEnabled(id),
					"suppress_roles",
				),
				toggle(
					"mobile-push",
					"Mobile Push Notifications",
					(id) => store.isMobilePushEnabled(id),
					"mobile_push",
				),
			],
		},
	].filter(Boolean);
}

//#endregion

//#region Server list changes

// Folders as SortedGuildStore gives them, with each loose server on its own
// entry. Discord stores a loose server as a folder entry with no id.
function cloneFolders(folders) {
	const items = [];
	for (const folder of folders) {
		if (folder.folderId != null)
			items.push({
				folderId: folder.folderId,
				folderName: folder.folderName,
				folderColor: folder.folderColor,
				guildIds: [...folder.guildIds],
			});
		else for (const id of folder.guildIds) items.push({ guildIds: [id] });
	}
	return items;
}

function itemKey(item) {
	return item.folderId != null ? `f:${item.folderId}` : `g:${item.guildIds[0]}`;
}

function layoutSignature(items) {
	return JSON.stringify(items.map((item) => [item.folderId, item.guildIds]));
}

function newFolderId(items) {
	const taken = new Set(items.map((item) => item.folderId));
	let id;
	do id = Math.floor(Math.random() * 2 ** 32);
	while (taken.has(id));
	return id;
}

function newParentId(parents) {
	let id;
	// Starts with a letter, so the ids keep their order as object keys.
	do id = "p" + Math.random().toString(36).slice(2, 10);
	while (id in parents);
	return id;
}

// The server list as it's shown: every top-level folder and loose server, with
// `parent` set to the parent folder it's in, or null. A parent folder's items
// are kept together where its first one is in Discord's order.
function arrange(folders, parents) {
	const parentOf = new Map();
	for (const [id, parent] of Object.entries(parents))
		for (const key of parent.members)
			if (!parentOf.has(key)) parentOf.set(key, id);
	const list = [];
	const groups = new Map();
	for (const item of cloneFolders(folders)) {
		const parent = parentOf.get(itemKey(item)) ?? null;
		const entry = { ...item, parent };
		if (parent == null) list.push([entry]);
		else if (groups.has(parent)) groups.get(parent).push(entry);
		else {
			const group = [entry];
			groups.set(parent, group);
			list.push(group);
		}
	}
	return list.flat();
}

// An arranged list as rows: { item } for a top-level folder or loose server,
// and { parentId, items } for a parent folder.
function groupByParent(list) {
	const layout = [];
	for (const entry of list) {
		const last = layout[layout.length - 1];
		if (entry.parent == null) layout.push({ item: entry });
		else if (last?.parentId === entry.parent) last.items.push(entry);
		else layout.push({ parentId: entry.parent, items: [entry] });
	}
	return layout;
}

// The parent folders as an arranged list has them. The `empty` ones, which
// had nothing in them already, stay; one whose last item just left is gone.
function parentsOf(list, parents, empty) {
	const next = {};
	for (const entry of list) {
		if (entry.parent == null) continue;
		next[entry.parent] ??= {
			...(parents[entry.parent] ?? { name: "" }),
			members: [],
		};
		next[entry.parent].members.push(itemKey(entry));
	}
	for (const id of empty) next[id] ??= { ...parents[id], members: [] };
	return next;
}

// The list's rows, with empty parent folders at the end.
function layoutOf(folders, parents) {
	const layout = groupByParent(arrange(folders, parents));
	const shown = new Set(layout.map((row) => row.parentId));
	for (const id of Object.keys(parents))
		if (!shown.has(id)) layout.push({ parentId: id, items: [] });
	return layout;
}

// Returns the server list and parent folders with `drag` moved to `move`.
// `drag` is { kind: "guild", guildId }, { kind: "folder", folderId }, or
// { kind: "parent", parentId }. Returns null when nothing changes.
//
// Moves:
// - { type: "top", ref, after }: beside a top-level item, by key. Beside an
//   item in a parent folder joins that parent; "parent:<id>" is beside the
//   whole parent folder.
// - { type: "into", folderId, atStart }: into a folder.
// - { type: "inFolder", folderId, ref, after }: beside a server in a folder.
// - { type: "combine", ref }: makes a new folder from a loose server and the
//   dragged one, the way Discord does.
// - { type: "intoParent", parentId, atStart }: into a parent folder. An
//   empty one is at the end of the list. A server put in an empty one turns
//   it into a normal folder.
// - { type: "nest", ref }: makes a new parent folder from a top-level item and
//   the dragged folder.
// - { type: "newParent", ref }: puts the top-level item `ref` in a new parent
//   folder of its own, where it is. `drag` is unused.
//
// `created` is the id of a folder the move made, and `createdParent` of a
// parent folder.
function applyMove(folders, parents, drag, move) {
	const before = arrange(folders, parents);
	let list = before.map((entry) => ({
		...entry,
		guildIds: [...entry.guildIds],
	}));
	let empty = Object.keys(parents).filter(
		(id) => !before.some((entry) => entry.parent === id),
	);
	const parentsBefore = parentsOf(before, parents, empty);
	let created = null;
	let createdParent = null;
	const finish = () => {
		const items = list.map(({ parent, ...item }) => item);
		const nextParents = parentsOf(list, parents, empty);
		const itemsChanged =
			layoutSignature(items) !== layoutSignature(cloneFolders(folders));
		const parentsChanged =
			JSON.stringify(nextParents) !== JSON.stringify(parentsBefore);
		if (!itemsChanged && !parentsChanged) return null;
		return {
			items,
			parents: nextParents,
			itemsChanged,
			parentsChanged,
			created,
			createdParent,
		};
	};

	if (move.type === "newParent") {
		const entry = list.find((entry) => itemKey(entry) === move.ref);
		if (!entry || entry.parent != null) return null;
		entry.parent = createdParent = newParentId(parents);
		return finish();
	}

	let moving;
	if (drag.kind === "parent") {
		moving = list.filter((entry) => entry.parent === drag.parentId);
		if (!moving.length) return null;
		list = list.filter((entry) => entry.parent !== drag.parentId);
	} else if (drag.kind === "folder") {
		const index = list.findIndex((entry) => entry.folderId === drag.folderId);
		if (index < 0) return null;
		moving = list.splice(index, 1);
	} else {
		let found = false;
		list = list.flatMap((entry) => {
			if (!entry.guildIds.includes(drag.guildId)) return [entry];
			found = true;
			if (entry.folderId == null) return [];
			const guildIds = entry.guildIds.filter((id) => id !== drag.guildId);
			// Discord drops a folder once its last server leaves.
			return guildIds.length ? [{ ...entry, guildIds }] : [];
		});
		if (!found) return null;
		moving = [{ guildIds: [drag.guildId], parent: null }];
	}
	// A parent folder keeps its items. Anything else takes on the parent of
	// where it lands.
	const place = (index, parent) => {
		if (drag.kind !== "parent")
			for (const entry of moving) entry.parent = parent;
		list.splice(index, 0, ...moving);
	};
	const parentBounds = (parentId) => {
		const first = list.findIndex((entry) => entry.parent === parentId);
		if (first >= 0)
			return [first, list.findLastIndex((entry) => entry.parent === parentId)];
		// An empty parent folder is shown at the end.
		return parentId in parents ? [list.length, list.length - 1] : null;
	};
	const findFolder = (folderId) =>
		list.find((entry) => entry.folderId === folderId);

	switch (move.type) {
		case "top": {
			if (move.ref.startsWith("parent:")) {
				const bounds = parentBounds(move.ref.slice(7));
				if (!bounds) return null;
				place(move.after ? bounds[1] + 1 : bounds[0], null);
				break;
			}
			const index = list.findIndex((entry) => itemKey(entry) === move.ref);
			if (index < 0) return null;
			const parent = list[index].parent;
			// Parent folders don't nest.
			if (drag.kind === "parent" && parent != null) return null;
			place(index + (move.after ? 1 : 0), parent);
			break;
		}
		case "into": {
			const folder = findFolder(move.folderId);
			if (!folder || drag.kind !== "guild") return null;
			if (move.atStart) folder.guildIds.unshift(drag.guildId);
			else folder.guildIds.push(drag.guildId);
			break;
		}
		case "inFolder": {
			const folder = findFolder(move.folderId);
			if (!folder || drag.kind !== "guild") return null;
			const index = folder.guildIds.indexOf(move.ref);
			if (index < 0) return null;
			folder.guildIds.splice(index + (move.after ? 1 : 0), 0, drag.guildId);
			break;
		}
		case "combine": {
			const index = list.findIndex(
				(entry) => entry.folderId == null && entry.guildIds[0] === move.ref,
			);
			if (index < 0 || drag.kind !== "guild") return null;
			created = newFolderId(list);
			list.splice(index, 1, {
				folderId: created,
				guildIds: [move.ref, drag.guildId],
				parent: list[index].parent,
			});
			break;
		}
		case "intoParent": {
			if (drag.kind === "parent") return null;
			const bounds = parentBounds(move.parentId);
			if (!bounds) return null;
			// A new folder holds folders only once one goes in. With a server
			// first, it's a normal folder, which syncs like any other.
			if (drag.kind === "guild" && empty.includes(move.parentId)) {
				created = newFolderId(list);
				list.push({
					folderId: created,
					folderName: parents[move.parentId].name || null,
					folderColor: null,
					guildIds: [drag.guildId],
					parent: null,
				});
				empty = empty.filter((id) => id !== move.parentId);
				break;
			}
			place(move.atStart ? bounds[0] : bounds[1] + 1, move.parentId);
			break;
		}
		case "nest": {
			if (drag.kind !== "folder") return null;
			const index = list.findIndex((entry) => itemKey(entry) === move.ref);
			if (index < 0 || list[index].parent != null) return null;
			createdParent = newParentId(parents);
			list[index].parent = createdParent;
			place(index + 1, createdParent);
			break;
		}
		default:
			return null;
	}
	return finish();
}

function loadBackup() {
	const backup = platform.storage.load("backup");
	return backup?.folders ? backup : null;
}

// BetterVencord's storage has no delete and skips saving empty values, so an empty
// object stands in for a forgotten backup there.
function forgetBackup() {
	if (platform.storage.delete) platform.storage.delete("backup");
	else platform.storage.save("backup", {});
}

// Keeps the server list as it was before ChungusServers first changed it, so
// it can be restored from the settings.
function backUpServerList() {
	if (loadBackup()) return;
	platform.storage.save("backup", {
		savedAt: Date.now(),
		folders: cloneFolders(SortedGuildStore.getGuildFolders()),
	});
}

function saveServerList(items) {
	if (!saveGuildFolders) {
		platform.toast("ChungusServers can't save the server list here", "error");
		return;
	}
	backUpServerList();
	saveGuildFolders(items);
}

// Moves something in the server list and saves what changed: the order to
// Discord, and parent folders to the plugin's settings.
function commitMove(drag, move) {
	const result = applyMove(
		SortedGuildStore.getGuildFolders(),
		settings.parents,
		drag,
		move,
	);
	if (!result) return null;
	const expanded = { ...settings.expanded };
	if (result.created != null) expanded[result.created] = true;
	if (result.createdParent != null)
		expanded[`parent:${result.createdParent}`] = true;
	// A new folder that became a normal one by taking a server keeps its icon.
	const icons = { ...settings.icons };
	const icon = icons[`parent:${move.parentId}`];
	if (move.type === "intoParent" && result.created != null && icon)
		icons[`f:${result.created}`] = icon;
	setSettings({
		expanded,
		icons,
		...(result.parentsChanged && { parents: result.parents }),
	});
	if (result.itemsChanged) saveServerList(result.items);
	if (result.createdParent != null) setRenamingParent(result.createdParent);
	return result;
}

// A parent folder's name, or its folders' and servers' names when it has none.
function parentName(parent, items) {
	if (parent?.name) return parent.name;
	return items
		.map(
			(item) =>
				item.folderName ||
				item.guildIds
					.map((id) => GuildStore.getGuild(id)?.name)
					.filter(Boolean)
					.join(", "),
		)
		.filter(Boolean)
		.join(", ");
}

// Items for Discord's menu on a top-level folder or loose server: move it into
// or out of a parent folder.
function parentMenuItems(key) {
	const list = arrange(SortedGuildStore.getGuildFolders(), settings.parents);
	const entry = list.find((entry) => itemKey(entry) === key);
	if (!entry) return [];
	const drag = key.startsWith("f:")
		? { kind: "folder", folderId: entry.folderId }
		: { kind: "guild", guildId: entry.guildIds[0] };
	if (entry.parent != null)
		return [
			{
				id: "chungus-servers-leave-parent",
				label: "Remove from Parent Folder",
				action: () =>
					commitMove(drag, {
						type: "top",
						ref: `parent:${entry.parent}`,
						after: true,
					}),
			},
		];
	const parents = layoutOf(
		SortedGuildStore.getGuildFolders(),
		settings.parents,
	).filter((row) => row.parentId != null);
	return [
		{
			type: "submenu",
			id: "chungus-servers-parent",
			label: "Move to Parent Folder",
			items: [
				...parents.map((row) => ({
					id: `chungus-servers-parent-${row.parentId}`,
					label:
						parentName(settings.parents[row.parentId], row.items) ||
						"New Folder",
					action: () =>
						commitMove(drag, { type: "intoParent", parentId: row.parentId }),
				})),
				parents.length > 0 && { type: "separator" },
				{
					id: "chungus-servers-new-parent",
					label: "New Parent Folder",
					action: () => commitMove(drag, { type: "newParent", ref: key }),
				},
			].filter(Boolean),
		},
	];
}

//#endregion

//#region Native menus

// Discord loads its server and folder menus on first use. Both are the menu
// with navId "guild-context"; only the folder one has folder settings.
const MENUS = {
	guild: {
		prop: "guild",
		isMenu: (source) =>
			source.includes('"guild-context"') &&
			!source.includes('"folder-settings"'),
	},
	folder: {
		prop: "folderId",
		isMenu: (source) =>
			source.includes('"guild-context"') &&
			source.includes('"folder-settings"'),
	},
};

// Discord's app shares its chunk array with a few helper bundles, and each
// one's webpack runs the callback. The app is the one that has loaded the most
// modules; requiring through a helper would load a second, broken copy.
let webpackRequire = null;
function getWebpackRequire() {
	if (webpackRequire) return webpackRequire;
	webpackRequire = platform.webpackRequire?.();
	if (webpackRequire) return webpackRequire;
	const requires = [];
	const chunk = window.webpackChunkdiscord_app;
	chunk.push([
		[Symbol("ChungusServers")],
		{},
		(require) => requires.push(require),
	]);
	chunk.pop();
	const loaded = (require) => Object.keys(require.c ?? {}).length;
	webpackRequire = requires.sort((a, b) => loaded(b) - loaded(a))[0];
	return webpackRequire;
}

// Places that lazy-load a component given `prop`, like the server bar's
//   Promise.all([n.e("1"),n.e("2")]).then(n.bind(n,237600));return e=>(0,r.jsx)(t,{...e,guild:i})
// as { id, chunks }.
function findLazyLoads(require, prop) {
	const pattern = new RegExp(
		String.raw`Promise\.all\(\[([^\]]*)\]\)\.then\(\w+\.bind\(\w+,(\d+)\)\);return \w+=>\(0,\w+\.jsxs?\)\(\w+,\{\.\.\.\w+,${prop}:`,
		"g",
	);
	const found = new Map();
	for (const factory of Object.values(require.m)) {
		const source = String(factory);
		if (!source.includes(`,${prop}:`)) continue;
		for (const match of source.matchAll(pattern))
			found.set(
				match[2],
				[...match[1].matchAll(/\.e\("?(\w+)"?\)/g)].map((m) => m[1]),
			);
	}
	return [...found].map(([id, chunks]) => ({ id, chunks }));
}

const menuCache = {};
async function loadMenu(kind) {
	if (menuCache[kind]) return menuCache[kind];
	const { prop, isMenu } = MENUS[kind];
	const require = getWebpackRequire();
	const isMenuModule = (id) => require.m[id] && isMenu(String(require.m[id]));
	let id = Object.keys(require.m).find(isMenuModule);
	if (!id)
		for (const load of findLazyLoads(require, prop)) {
			await Promise.all(load.chunks.map((chunk) => require.e(chunk)));
			if (isMenuModule(load.id)) {
				id = load.id;
				break;
			}
		}
	const Menu = id && require(id)?.default;
	if (Menu) menuCache[kind] = Menu;
	return Menu ?? null;
}

// Opens Discord's own menu, so it has every native item plus what other
// plugins add (like ChungusTabs' "Save guild as bookmark").
function openNativeMenu(event, kind, props) {
	event.preventDefault();
	event.stopPropagation();
	const target = event.currentTarget;
	const { pageX, pageY } = event;
	loadMenu(kind)
		.then((Menu) => {
			if (!Menu) throw new Error(`No ${kind} menu`);
			// The real event is over by now; Discord's opener only needs these.
			const place = {
				currentTarget: target,
				target,
				pageX,
				pageY,
				stopPropagation() {},
				preventDefault() {},
			};
			platform.openMenu(place, (menuProps) => (
				<Menu {...menuProps} {...props} />
			));
		})
		.catch((error) => {
			console.error("ChungusServers: couldn't open the menu", error);
			platform.toast("ChungusServers couldn't open Discord's menu", "error");
		});
}

//#endregion

//#region Icons

const ChevronIcon = ({ open }) => (
	<svg
		className={
			"chungusServers-chevron" + (open ? " chungusServers-chevronOpen" : "")
		}
		viewBox="0 0 24 24"
		width="12"
		height="12"
		aria-hidden="true"
	>
		<path
			fill="none"
			stroke="currentColor"
			strokeWidth="3"
			strokeLinecap="round"
			strokeLinejoin="round"
			d="M9 6l6 6-6 6"
		/>
	</svg>
);

const DiscordIcon = () => (
	<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
		<path
			fill="currentColor"
			d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z"
		/>
	</svg>
);

const PlusIcon = () => (
	<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
		<path
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			d="M12 5v14M5 12h14"
		/>
	</svg>
);

const NewFolderIcon = () => (
	<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
		<path
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinejoin="round"
			d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
		/>
		<path
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			d="M12 10.5v5M9.5 13h5"
		/>
	</svg>
);

const CompassIcon = () => (
	<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
		<circle
			cx="12"
			cy="12"
			r="9.5"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		/>
		<path fill="currentColor" d="M15.5 8.5l-2 5-5 2 2-5z" />
	</svg>
);

const SpeakerIcon = () => (
	<svg
		className="chungusServers-voice"
		viewBox="0 0 24 24"
		width="14"
		height="14"
		aria-label="In voice"
	>
		<path
			fill="currentColor"
			d="M12 3a1 1 0 0 0-1.7-.7L6.6 6H4a2 2 0 0 0-2 2v8c0 1.1.9 2 2 2h2.6l3.7 3.7A1 1 0 0 0 12 21V3Zm3.1 5.3a1 1 0 0 1 1.4 0 5 5 0 0 1 0 7.4 1 1 0 1 1-1.4-1.4 3 3 0 0 0 0-4.6 1 1 0 0 1 0-1.4Z"
		/>
	</svg>
);

function GuildIcon({ guild, className = "chungusServers-icon" }) {
	const url =
		guild.icon &&
		GuildIconUtils?.getGuildIconURL({
			id: guild.id,
			icon: guild.icon,
			size: 64,
			canAnimate: false,
		});
	if (url)
		return <img className={className} src={url} alt="" draggable={false} />;
	return (
		<div className={className + " chungusServers-acronym"}>
			{getAcronym(guild.name)}
		</div>
	);
}

// The letters Discord shows for a server without an icon, like "et" for
// "echo test".
function getAcronym(name) {
	return name
		.replace(/'s /g, " ")
		.replace(/\w+/g, (word) => word[0])
		.replace(/\s/g, "")
		.slice(0, 3);
}

// Discord's folder bubble: the first four servers' icons on the folder colour.
function FolderIcon({ guilds, color }) {
	return (
		<div
			className="chungusServers-folderIcon"
			style={color ? { "--chungusServers-folderColor": color } : undefined}
		>
			{guilds.slice(0, 4).map((guild) => (
				<GuildIcon
					key={guild.id}
					guild={guild}
					className="chungusServers-folderIconItem"
				/>
			))}
		</div>
	);
}

const ParentFolderIcon = () => (
	<span className="chungusServers-icon chungusServers-glyph chungusServers-parentIcon">
		<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
			<path
				fill="currentColor"
				d="M2 6.5A2.5 2.5 0 0 1 4.5 4h4.2c.66 0 1.3.26 1.77.73L12 6.3h7.5A2.5 2.5 0 0 1 22 8.8v8.7a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5v-11Z"
			/>
		</svg>
	</span>
);

// A folder's own picture, chosen from the folder's menu.
const CustomIcon = ({ src }) => (
	<img className="chungusServers-icon" src={src} alt="" draggable={false} />
);

function MentionBadge({ count }) {
	if (!count) return null;
	return (
		<span className="chungusServers-mention">
			{count > 999 ? "999+" : count}
		</span>
	);
}

//#endregion

//#region Rows

function cls(...names) {
	return names.filter(Boolean).join(" ");
}

function folderColorCss(color) {
	return color != null ? `#${color.toString(16).padStart(6, "0")}` : null;
}

function rowDropClass(dnd, key) {
	if (dnd.drop?.level !== "row" || dnd.drop.key !== key) return null;
	return `chungusServers-drop-${dnd.drop.where}`;
}

function groupDropClass(dnd, key) {
	if (dnd.drop?.level !== "group" || dnd.drop.key !== key) return null;
	return `chungusServers-drop-${dnd.drop.where}`;
}

// A server's row. `pinned` is its copy in the Pinned section, which only moves
// within that section.
function ServerRow({ guildId, parentId, pinned = false }) {
	const dnd = useContext(DragContext);
	const guild = useStateFromStores([GuildStore], () =>
		GuildStore.getGuild(guildId),
	);
	const selected = useStateFromStores(
		[SelectedGuildStore],
		() => SelectedGuildStore.getGuildId() === guildId,
	);
	const unread = useStateFromStores([GuildReadStateStore], () =>
		GuildReadStateStore.hasUnread(guildId),
	);
	const mentions = useStateFromStores([GuildReadStateStore], () =>
		GuildReadStateStore.getMentionCount(guildId),
	);
	const muted = useStateFromStores([UserGuildSettingsStore], () =>
		UserGuildSettingsStore.isMuted(guildId),
	);
	const inVoice = useStateFromStores(
		[RTCConnectionStore],
		() => RTCConnectionStore?.getGuildId?.() === guildId,
	);
	const icon = useIcon(`g:${guildId}`);
	const folderIcon = useIcon(parentId != null ? `f:${parentId}` : "");
	if (!guild) return null;
	const key = `${pinned ? "p" : "g"}:${guildId}`;
	return (
		<div
			className={cls(
				"chungusServers-row",
				parentId != null && "chungusServers-child",
				selected && "chungusServers-selected",
				unread && "chungusServers-unread",
				muted && "chungusServers-muted",
				dnd.dragKey === key && "chungusServers-dragging",
				rowDropClass(dnd, key),
			)}
			// ChungusTabs looks for this to open the server in a new tab.
			data-list-item-id={`guildsnav___${guildId}`}
			data-chungus-key={key}
			data-chungus-parent={parentId ?? undefined}
			data-chungus-pinned={pinned || undefined}
			role="treeitem"
			aria-selected={selected}
			tabIndex={-1}
			title={guild.name}
			draggable
			onDragStart={(e) =>
				dnd.start(e, { kind: pinned ? "pinned" : "guild", guildId }, key)
			}
			onDragEnd={dnd.end}
			onClick={() => GuildNavigation?.transitionToGuildSync(guildId)}
			onContextMenu={(e) => openNativeMenu(e, "guild", { guild })}
		>
			<span className="chungusServers-pill" />
			{!icon?.hidden && !folderIcon?.hideServers && <GuildIcon guild={guild} />}
			<span className="chungusServers-name">{guild.name}</span>
			{inVoice && <SpeakerIcon />}
			<MentionBadge count={mentions} />
		</div>
	);
}

function guildListEqual(a, b) {
	return a.length === b.length && a.every((guild, i) => guild === b[i]);
}

// `inParent` is the id of the parent folder it's in.
function FolderGroup({ folder, inParent }) {
	const dnd = useContext(DragContext);
	const { expanded } = useSettings();
	const open = Boolean(expanded[folder.folderId]);
	const guilds = useStateFromStores(
		[GuildStore],
		() => folder.guildIds.map((id) => GuildStore.getGuild(id)).filter(Boolean),
		[folder],
		guildListEqual,
	);
	const unread = useStateFromStores(
		[GuildReadStateStore],
		() => folder.guildIds.some((id) => GuildReadStateStore.hasUnread(id)),
		[folder],
	);
	const mentions = useStateFromStores(
		[GuildReadStateStore],
		() =>
			folder.guildIds.reduce(
				(sum, id) => sum + GuildReadStateStore.getMentionCount(id),
				0,
			),
		[folder],
	);
	const holdsSelected = useStateFromStores(
		[SelectedGuildStore],
		() => folder.guildIds.includes(SelectedGuildStore.getGuildId()),
		[folder],
	);
	const inVoice = useStateFromStores(
		[RTCConnectionStore],
		() => folder.guildIds.includes(RTCConnectionStore?.getGuildId?.()),
		[folder],
	);
	const key = `f:${folder.folderId}`;
	const icon = useIcon(key);
	const color = folderColorCss(folder.folderColor);
	// An unnamed folder goes by its servers' names.
	const name =
		folder.folderName || guilds.map((guild) => guild.name).join(", ");
	return (
		<div
			className={cls("chungusServers-group", groupDropClass(dnd, key))}
			data-chungus-group={key}
			data-chungus-inparent={inParent ?? undefined}
			style={color ? { "--chungusServers-folderColor": color } : undefined}
		>
			<div
				className={cls(
					"chungusServers-row",
					"chungusServers-folder",
					open && "chungusServers-open",
					!open && holdsSelected && "chungusServers-selected",
					unread && "chungusServers-unread",
					dnd.dragKey === key && "chungusServers-dragging",
					rowDropClass(dnd, key),
				)}
				data-chungus-key={key}
				data-chungus-expanded={open}
				role="treeitem"
				aria-expanded={open}
				tabIndex={-1}
				title={name}
				draggable
				onDragStart={(e) =>
					dnd.start(e, { kind: "folder", folderId: folder.folderId }, key)
				}
				onDragEnd={dnd.end}
				onClick={() => setExpanded(folder.folderId, !open)}
				onContextMenu={(e) =>
					openNativeMenu(e, "folder", {
						folderId: folder.folderId,
						folderName: folder.folderName,
						folderColor: folder.folderColor,
						unread: unread || mentions > 0,
					})
				}
			>
				<span className="chungusServers-pill" />
				{icon?.hidden ? null : icon?.image ? (
					<CustomIcon src={icon.image} />
				) : (
					<FolderIcon guilds={guilds} color={color} />
				)}
				<span className="chungusServers-name">{name}</span>
				{!open && inVoice && <SpeakerIcon />}
				{!open && <MentionBadge count={mentions} />}
				<ChevronIcon open={open} />
			</div>
			{open && (
				<div className="chungusServers-folderChildren" role="group">
					{folder.guildIds.map((id) => (
						<ServerRow key={id} guildId={id} parentId={folder.folderId} />
					))}
				</div>
			)}
		</div>
	);
}

function LooseServer({ guildId, inParent }) {
	const dnd = useContext(DragContext);
	const key = `g:${guildId}`;
	return (
		<div
			className={cls("chungusServers-group", groupDropClass(dnd, key))}
			data-chungus-group={key}
			data-chungus-inparent={inParent ?? undefined}
		>
			<ServerRow guildId={guildId} parentId={null} />
		</div>
	);
}

function TopLevelItem({ item, inParent = null }) {
	return item.folderId != null ? (
		<FolderGroup folder={item} inParent={inParent} />
	) : (
		<LooseServer guildId={item.guildIds[0]} inParent={inParent} />
	);
}

// Edits a parent folder's name in place. Enter or leaving the field saves it,
// and Escape cancels.
function NameInput({ initial, onDone }) {
	const [value, setValue] = useState(initial);
	const ref = useRef(null);
	const done = useRef(false);
	// Focus waits a frame: a menu that started the rename gives focus back as
	// it closes.
	useEffect(() => {
		const frame = requestAnimationFrame(() => {
			ref.current?.focus();
			ref.current?.select();
		});
		return () => cancelAnimationFrame(frame);
	}, []);
	const finish = (save) => {
		if (done.current) return;
		done.current = true;
		onDone(save ? value.trim() : null);
	};
	return (
		<input
			ref={ref}
			className="chungusServers-nameInput"
			value={value}
			placeholder="Name this folder"
			aria-label="Folder name"
			maxLength={100}
			onChange={(e) => setValue(e.target.value)}
			onKeyDown={(e) => {
				e.stopPropagation();
				if (e.key === "Enter") finish(true);
				else if (e.key === "Escape") finish(false);
			}}
			onBlur={() => finish(true)}
			onClick={(e) => e.stopPropagation()}
		/>
	);
}

function openParentMenu(event, id, empty) {
	event.preventDefault();
	event.stopPropagation();
	const items = platform.buildMenuChildren([
		{
			id: "rename",
			label: "Rename Folder",
			action: () => setRenamingParent(id),
		},
		folderIconMenu(`parent:${id}`),
		{ type: "separator" },
		{
			id: "ungroup",
			label: empty ? "Delete Folder" : "Ungroup Folders",
			danger: true,
			action: () => ungroupParent(id),
		},
	]);
	platform.openMenu(event, (props) => (
		<platform.Menu {...props} navId="chungus-servers-parent">
			{items}
		</platform.Menu>
	));
}

// A local folder holding folders and loose servers, one level deep.
function ParentGroup({ id, parent, items }) {
	const dnd = useContext(DragContext);
	const { expanded } = useSettings();
	const key = `parent:${id}`;
	const icon = useIcon(key);
	const open = Boolean(expanded[key]);
	const renaming = renamingParent === id;
	const guildIds = items.flatMap((item) => item.guildIds);
	const ids = guildIds.join();
	const name = useStateFromStores(
		[GuildStore],
		() => parentName(parent, items),
		[parent, items],
	);
	const unread = useStateFromStores(
		[GuildReadStateStore],
		() => guildIds.some((guildId) => GuildReadStateStore.hasUnread(guildId)),
		[ids],
	);
	const mentions = useStateFromStores(
		[GuildReadStateStore],
		() =>
			guildIds.reduce(
				(sum, guildId) => sum + GuildReadStateStore.getMentionCount(guildId),
				0,
			),
		[ids],
	);
	const holdsSelected = useStateFromStores(
		[SelectedGuildStore],
		() => guildIds.includes(SelectedGuildStore.getGuildId()),
		[ids],
	);
	const inVoice = useStateFromStores(
		[RTCConnectionStore],
		() => guildIds.includes(RTCConnectionStore?.getGuildId?.()),
		[ids],
	);
	return (
		<div
			className={cls(
				"chungusServers-group",
				"chungusServers-parentGroup",
				groupDropClass(dnd, key),
			)}
			data-chungus-group={key}
		>
			<div
				className={cls(
					"chungusServers-row",
					"chungusServers-folder",
					"chungusServers-parent",
					open && "chungusServers-open",
					!open && holdsSelected && "chungusServers-selected",
					unread && "chungusServers-unread",
					dnd.dragKey === key && "chungusServers-dragging",
					rowDropClass(dnd, key),
				)}
				data-chungus-key={key}
				data-chungus-expanded={open}
				role="treeitem"
				aria-expanded={open}
				tabIndex={-1}
				title={name}
				draggable={!renaming}
				onDragStart={(e) => dnd.start(e, { kind: "parent", parentId: id }, key)}
				onDragEnd={dnd.end}
				onClick={() => !renaming && setExpanded(key, !open)}
				onContextMenu={(e) => openParentMenu(e, id, !items.length)}
			>
				<span className="chungusServers-pill" />
				{icon?.hidden ? null : icon?.image ? (
					<CustomIcon src={icon.image} />
				) : (
					<ParentFolderIcon />
				)}
				{renaming ? (
					<NameInput
						initial={parent?.name ?? ""}
						onDone={(next) => {
							setRenamingParent(null);
							if (next != null) renameParent(id, next);
						}}
					/>
				) : (
					<span className="chungusServers-name">{name || "New Folder"}</span>
				)}
				{!open && inVoice && <SpeakerIcon />}
				{!open && <MentionBadge count={mentions} />}
				<ChevronIcon open={open} />
			</div>
			{open && (
				<div className="chungusServers-parentChildren" role="group">
					{items.map((item) => (
						<TopLevelItem key={itemKey(item)} item={item} inParent={id} />
					))}
					{!items.length && (
						<div className="chungusServers-parentEmpty">
							Drag servers or folders here
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// Pinned servers, above everything else. While a server is being dragged and
// nothing is pinned yet, it shows a spot to drop it on.
function PinnedSection({ pinned, collapsed }) {
	const dnd = useContext(DragContext);
	const offerDrop = !pinned.length && dnd.dragKind === "guild";
	if (!pinned.length && !offerDrop) return null;
	return (
		<div
			className={cls(
				"chungusServers-pinZone",
				dnd.drop?.level === "zone" && "chungusServers-drop-into",
			)}
			data-chungus-pinzone
		>
			<div
				className="chungusServers-sectionHeader"
				role="button"
				aria-expanded={!collapsed}
				onClick={() => setSettings({ pinnedCollapsed: !collapsed })}
			>
				<ChevronIcon open={!collapsed} />
				Pinned
			</div>
			{!collapsed &&
				pinned.map((id) => (
					<ServerRow key={id} guildId={id} parentId={null} pinned />
				))}
			{offerDrop && (
				<div className="chungusServers-pinPlaceholder">
					Drop a server here to pin it
				</div>
			)}
			<div className="chungusServers-separator" />
		</div>
	);
}

function isHomePath() {
	return location.pathname.startsWith("/channels/@me");
}

function HomeRow({ countDMs }) {
	const selected = useStateFromStores(
		[SelectedGuildStore, SelectedChannelStore],
		isHomePath,
	);
	const requests = useStateFromStores(
		[RelationshipStore],
		() => RelationshipStore?.getPendingCount?.() ?? 0,
	);
	const dmMentions = useStateFromStores([GuildReadStateStore], () =>
		countDMs ? (GuildReadStateStore.getPrivateChannelMentionCount?.() ?? 0) : 0,
	);
	return (
		<div
			className={cls(
				"chungusServers-row",
				selected && "chungusServers-selected",
			)}
			data-list-item-id="guildsnav___home"
			role="treeitem"
			tabIndex={-1}
			onClick={() => transitionTo?.("/channels/@me")}
		>
			<span className="chungusServers-pill" />
			<span className="chungusServers-icon chungusServers-glyph chungusServers-home">
				<DiscordIcon />
			</span>
			<span className="chungusServers-name">Direct Messages</span>
			<MentionBadge count={requests + dmMentions} />
		</div>
	);
}

function DMRow({ channelId }) {
	const channel = useStateFromStores([ChannelStore], () =>
		ChannelStore.getChannel(channelId),
	);
	const user = useStateFromStores([UserStore], () =>
		channel?.type === 1 ? UserStore.getUser(channel.recipients?.[0]) : null,
	);
	const mentions = useStateFromStores([ReadStateStore], () =>
		ReadStateStore.getMentionCount(channelId),
	);
	const selected = useStateFromStores(
		[SelectedChannelStore],
		() => SelectedChannelStore.getChannelId() === channelId,
	);
	if (!channel) return null;
	const name = user
		? user.globalName || user.username
		: channel.name ||
			(channel.recipients ?? [])
				.map((id) => {
					const recipient = UserStore.getUser(id);
					return recipient?.globalName || recipient?.username;
				})
				.filter(Boolean)
				.join(", ");
	const icon = user
		? user.getAvatarURL?.(undefined, 48)
		: ChannelIconUtils?.getChannelIconURL?.({
				id: channel.id,
				icon: channel.icon,
				size: 48,
			});
	return (
		<div
			className={cls(
				"chungusServers-row",
				"chungusServers-dm",
				"chungusServers-unread",
				selected && "chungusServers-selected",
			)}
			role="treeitem"
			tabIndex={-1}
			title={name}
			onClick={() => transitionTo?.(`/channels/@me/${channelId}`)}
		>
			<span className="chungusServers-pill" />
			{icon ? (
				<img
					className="chungusServers-icon chungusServers-avatar"
					src={icon}
					alt=""
					draggable={false}
				/>
			) : (
				<span className="chungusServers-icon chungusServers-avatar" />
			)}
			<span className="chungusServers-name">{name}</span>
			<MentionBadge count={mentions} />
		</div>
	);
}

function ActionRow({ icon, label, onClick }) {
	return (
		<div
			className="chungusServers-row chungusServers-action"
			role="button"
			tabIndex={-1}
			onClick={onClick}
		>
			<span className="chungusServers-icon chungusServers-glyph">{icon}</span>
			<span className="chungusServers-name">{label}</span>
		</div>
	);
}

//#endregion

//#region Dragging

function sameDrop(a, b) {
	return a?.level === b?.level && a?.key === b?.key && a?.where === b?.where;
}

// Works out where a dragged server or folder would land from the row under
// the pointer. Returns { level, key, where, move }: `level` and `key` say
// which row or group shows the marker, and `move` is for applyMove.
function getDrop(drag, dragKey, event, scroller) {
	const element = event.target instanceof Element ? event.target : null;

	// Any server can be pinned. A pinned copy only moves among the pins.
	if (element?.closest("[data-chungus-pinzone]")) {
		if (drag.kind === "folder" || drag.kind === "parent") return null;
		const row = element.closest("[data-chungus-pinned]");
		if (!row)
			return {
				level: "zone",
				key: "pins",
				where: "into",
				move: { type: "pin", ref: null },
			};
		const ref = row.dataset.chungusKey.slice(2);
		if (ref === drag.guildId) return null;
		const rect = row.getBoundingClientRect();
		const where =
			event.clientY < rect.top + rect.height / 2 ? "before" : "after";
		return {
			level: "row",
			key: row.dataset.chungusKey,
			where,
			move: { type: "pin", ref, after: where === "after" },
		};
	}
	if (drag.kind === "pinned") return null;

	// Beside a group. Beside one inside a parent folder joins that parent.
	const beside = (key, where) =>
		key === dragKey
			? null
			: {
					level: "group",
					key,
					where,
					move: { type: "top", ref: key, after: where === "after" },
				};
	const byHalf = (box) => {
		const rect = box.getBoundingClientRect();
		return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
	};

	const group = element?.closest("[data-chungus-group]");
	if (!group) {
		// Past the last server: drop at the end.
		const groups = scroller.querySelectorAll(":scope > [data-chungus-group]");
		const last = groups[groups.length - 1];
		if (!last) return null;
		const bottom = last.getBoundingClientRect().bottom;
		if (event.clientY < bottom || event.clientY > bottom + 40) return null;
		return beside(last.dataset.chungusGroup, "after");
	}
	const groupKey = group.dataset.chungusGroup;
	const inParent = group.dataset.chungusInparent != null;
	const row = element.closest("[data-chungus-key]");
	const rect = row?.getBoundingClientRect();
	const y = row ? (event.clientY - rect.top) / rect.height : 0.5;

	// Parent folders don't nest, so one only goes beside top-level groups.
	if (drag.kind === "parent") {
		const top = inParent
			? group.parentElement.closest("[data-chungus-group]")
			: group;
		return beside(top.dataset.chungusGroup, byHalf(top));
	}

	if (groupKey.startsWith("parent:")) {
		const into = {
			level: "row",
			key: groupKey,
			where: "into",
			move: { type: "intoParent", parentId: groupKey.slice(7) },
		};
		if (row?.dataset.chungusKey !== groupKey)
			// An empty parent folder's drop spot, or between the items of an
			// open one.
			return element.closest(".chungusServers-parentEmpty") ? into : null;
		if (y < 0.25) return beside(groupKey, "before");
		if (y > 0.75) {
			if (row.dataset.chungusExpanded !== "true")
				return beside(groupKey, "after");
			const first = group.querySelector("[data-chungus-inparent]");
			return first ? beside(first.dataset.chungusGroup, "before") : into;
		}
		return into;
	}

	const topLevel = (where) => beside(groupKey, where);

	if (drag.kind === "folder") {
		// The middle of a top-level folder or loose server makes a parent
		// folder from the two.
		const onHead = row && row.dataset.chungusKey === groupKey;
		if (onHead && !inParent && groupKey !== dragKey) {
			if (y < 0.25) return topLevel("before");
			if (y > 0.75 && row.dataset.chungusExpanded !== "true")
				return topLevel("after");
			return {
				level: "row",
				key: groupKey,
				where: "into",
				move: { type: "nest", ref: groupKey },
			};
		}
		return topLevel(byHalf(group));
	}

	if (!row) return null;
	const rowKey = row.dataset.chungusKey;

	if (rowKey.startsWith("f:")) {
		const folderId = Number(rowKey.slice(2));
		if (y < 0.25) return topLevel("before");
		if (y > 0.75) {
			if (row.dataset.chungusExpanded !== "true") return topLevel("after");
			// Between an open folder and its first server.
			const first = group.querySelector("[data-chungus-parent]");
			if (!first || first.dataset.chungusKey === dragKey) return null;
			return {
				level: "row",
				key: first.dataset.chungusKey,
				where: "before",
				move: {
					type: "inFolder",
					folderId,
					ref: first.dataset.chungusKey.slice(2),
					after: false,
				},
			};
		}
		return {
			level: "row",
			key: rowKey,
			where: "into",
			move: { type: "into", folderId },
		};
	}

	if (rowKey === dragKey) return null;
	const guildId = rowKey.slice(2);
	if (row.dataset.chungusParent) {
		const where = y < 0.5 ? "before" : "after";
		return {
			level: "row",
			key: rowKey,
			where,
			move: {
				type: "inFolder",
				folderId: Number(row.dataset.chungusParent),
				ref: guildId,
				after: where === "after",
			},
		};
	}
	if (y < 0.3) return topLevel("before");
	if (y > 0.7) return topLevel("after");
	return {
		level: "row",
		key: rowKey,
		where: "into",
		move: { type: "combine", ref: guildId },
	};
}

//#endregion

//#region Column

function ServerList({
	showUnreadDMs,
	showDiscover,
	pinned,
	pinnedCollapsed,
	parents,
}) {
	const folders = useStateFromStores([SortedGuildStore], () =>
		SortedGuildStore.getGuildFolders(),
	);
	const layout = useMemo(() => layoutOf(folders, parents), [folders, parents]);
	const unreadDMs = useStateFromStores([PrivateChannelReadStateStore], () =>
		showUnreadDMs
			? PrivateChannelReadStateStore.getUnreadPrivateChannelIds().join(",")
			: "",
	);
	const [drop, setDrop] = useState(null);
	const [dragging, setDragging] = useState(null);
	const dragRef = useRef(null);
	const dropRef = useRef(null);

	const showDrop = (next) => {
		if (sameDrop(next, dropRef.current)) return;
		dropRef.current = next;
		setDrop(next);
	};
	const endDrag = () => {
		dragRef.current = null;
		setDragging(null);
		showDrop(null);
	};
	const dnd = {
		drop,
		dragKey: dragging?.key,
		dragKind: dragging?.drag.kind,
		start(event, drag, key) {
			// Discord's drag library listens on the window and cancels drags it
			// didn't start, so this one stops here.
			event.stopPropagation();
			event.dataTransfer.setData(DRAG_TYPE, key);
			event.dataTransfer.effectAllowed = "move";
			const current = { drag, key };
			dragRef.current = current;
			// A row that moves or disappears mid-drag never gets its dragend, so
			// the drag also ends on the window's dragend or drop, or on a mouse
			// move once drag events have stopped coming.
			let lastDragEvent = Date.now();
			const noteDragEvent = () => (lastDragEvent = Date.now());
			const moved = () => {
				if (Date.now() - lastDragEvent > 500) finish();
			};
			const finish = () => {
				window.removeEventListener("dragend", finish, true);
				window.removeEventListener("drop", finishLater, true);
				window.removeEventListener("dragover", noteDragEvent, true);
				window.removeEventListener("mousemove", moved, true);
				if (dragRef.current === current) endDrag();
			};
			// After the list's own drop handler, which needs the drag.
			const finishLater = () => setTimeout(finish);
			window.addEventListener("dragend", finish, true);
			window.addEventListener("drop", finishLater, true);
			window.addEventListener("dragover", noteDragEvent, true);
			window.addEventListener("mousemove", moved, true);
			// Changing the list in the same frame cancels the drag in Chromium.
			// The drag may be over by the next frame.
			requestAnimationFrame(() => {
				if (dragRef.current === current) setDragging(current);
			});
		},
		end: endDrag,
	};

	const onDragOver = (event) => {
		const current = dragRef.current;
		if (!current || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
		// Discord's drag library would mark the spot as not droppable.
		event.stopPropagation();
		const next = getDrop(current.drag, current.key, event, event.currentTarget);
		showDrop(next);
		if (!next) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
	};
	const onDragLeave = (event) => {
		if (!event.currentTarget.contains(event.relatedTarget)) showDrop(null);
	};
	const onDrop = (event) => {
		const current = dragRef.current;
		const target = dropRef.current;
		if (!current) return;
		// Discord's drag library would throw on a drop it didn't start.
		event.stopPropagation();
		endDrag();
		if (!target) return;
		event.preventDefault();
		if (target.move.type === "pin") {
			const next = movePin(
				settings.pinned,
				current.drag.guildId,
				target.move.ref,
				target.move.after,
			);
			if (next) setSettings({ pinned: next, pinnedCollapsed: false });
			return;
		}
		commitMove(current.drag, target.move);
	};

	return (
		<DragContext.Provider value={dnd}>
			<div
				className={cls(
					"chungusServers-scroller",
					dragging && "chungusServers-isDragging",
				)}
				role="tree"
				aria-label="Servers"
				onDragEnter={onDragOver}
				onDragOver={onDragOver}
				onDragLeave={onDragLeave}
				onDrop={onDrop}
			>
				<HomeRow countDMs={!showUnreadDMs} />
				{unreadDMs &&
					unreadDMs.split(",").map((id) => <DMRow key={id} channelId={id} />)}
				<div className="chungusServers-separator" />
				<PinnedSection pinned={pinned} collapsed={pinnedCollapsed} />
				{layout.map((row) =>
					row.parentId != null ? (
						<ParentGroup
							key={`parent:${row.parentId}`}
							id={row.parentId}
							parent={parents[row.parentId]}
							items={row.items}
						/>
					) : (
						<TopLevelItem key={itemKey(row.item)} item={row.item} />
					),
				)}
				<div className="chungusServers-separator" />
				<div className="chungusServers-actionLine">
					<ActionRow
						icon={<PlusIcon />}
						label="Add a Server"
						onClick={() =>
							GuildCreation?.openCreateGuildModal({ location: "Guild List" })
						}
					/>
					<button
						className="chungusServers-newFolder"
						title="New Folder"
						aria-label="New Folder"
						onClick={createParent}
					>
						<NewFolderIcon />
					</button>
				</div>
				{showDiscover && (
					<ActionRow
						icon={<CompassIcon />}
						label="Discover"
						onClick={() =>
							GlobalDiscovery?.transitionToGlobalDiscovery({ tab: "servers" })
						}
					/>
				)}
			</div>
		</DragContext.Provider>
	);
}

function ResizeHandle({ columnRef }) {
	// Listens on the window: crossing into or out of icon mode replaces the
	// handle, which would drop pointer capture.
	const onPointerDown = (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		const startX = event.clientX;
		const startWidth = columnRef.current?.getBoundingClientRect().width ?? 0;
		document.body.classList.add("chungusServers-resizing");
		const move = (e) => {
			const width = startWidth + e.clientX - startX;
			if (width < ICON_MODE_BELOW) setSettings({ iconMode: true }, false);
			else
				setSettings(
					{
						iconMode: false,
						width: Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width))),
					},
					false,
				);
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
			window.removeEventListener("blur", up);
			document.body.classList.remove("chungusServers-resizing");
			setSettings({});
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
		window.addEventListener("blur", up);
	};
	return (
		<div
			className="chungusServers-resizeHandle"
			title="Drag to resize. Double-click to reset."
			onPointerDown={onPointerDown}
			onDoubleClick={() =>
				setSettings({ iconMode: false, width: DEFAULT_WIDTH })
			}
		/>
	);
}

function ServerColumn({ barProps, native }) {
	const {
		width,
		iconMode,
		showUnreadDMs,
		showDiscover,
		pinned,
		pinnedCollapsed,
		parents,
	} = useSettings();
	const columnRef = useRef(null);
	// Discord hides its bar for fullscreen video; keep doing that.
	const fullscreen = useStateFromStores(
		[ChannelRTCStore],
		() => ChannelRTCStore?.isFullscreenInContext?.() ?? false,
	);
	if (fullscreen) return native;
	// Discord's bar keeps its own classes here, so plugins and themes that
	// style it still work.
	if (iconMode)
		return (
			<div
				ref={columnRef}
				className="chungusServers-column chungusServers-iconMode"
			>
				{native}
				<ResizeHandle columnRef={columnRef} />
			</div>
		);
	return (
		<nav
			ref={columnRef}
			className={cls(barProps.className, "chungusServers-column")}
			style={{ width }}
			aria-label="Servers sidebar"
		>
			<ServerList
				showUnreadDMs={showUnreadDMs}
				showDiscover={showDiscover}
				pinned={pinned}
				pinnedCollapsed={pinnedCollapsed}
				parents={parents}
			/>
			<ResizeHandle columnRef={columnRef} />
		</nav>
	);
}

// Falls back to Discord's bar if the column breaks.
//#endregion

//#region Styles

// Fixes for the sidebar around the wide column, mostly for CollapsibleUI:
// - The account panel spans the server and channel lists. Discord sizes it to
//   the sidebar, but CollapsibleUI sizes it from Discord's 72px server bar.
// - CollapsibleUI's channel list resize grip is placed from the sidebar's left
//   edge, which lands on this column's resize edge. Placing it from the channel
//   list puts it back on the channel list's edge.
function layoutCss() {
	if (!SidebarClasses) return "";
	const wideSidebar = `body .${SidebarClasses.sidebar}:has(> .chungusServers-column:not(.chungusServers-iconMode))`;
	return `
${wideSidebar} > .${SidebarClasses.panels} {
	width: calc(100% - var(--custom-panels-spacing, 8px) * 2) !important;
}

${wideSidebar} > .${SidebarClasses.sidebarList} {
	position: relative;
}
`;
}

const css = `
.chungusServers-column {
	grid-area: guildsList;
	display: flex;
	flex-direction: column;
	flex-shrink: 0;
	position: relative;
	box-sizing: border-box;
	min-height: 0;
	overflow: hidden;
	background-color: var(--background-base-lowest);
	/* Leave room for the account panel that sits over the bottom of the sidebar. */
	margin-bottom: calc(var(--custom-app-panels-height, 0px) + var(--space-xs, 6px) - 16px);
	mask: linear-gradient(#000, transparent) center bottom / 100% 16px no-repeat,
		linear-gradient(#000, #000) center top / 100% calc(100% - 15px) no-repeat;
}

.refresh-fast-follow-guild-bg .chungusServers-column {
	background-color: var(--app-frame-background);
}

.custom-theme-background .chungusServers-column {
	background: var(--background-gradient-app-frame, var(--background-base-lowest));
}

.chungusServers-iconMode {
	width: auto;
	margin-bottom: 0;
	mask: none;
	background: none;
}

.chungusServers-iconMode > nav {
	flex: 1 1 auto;
	min-height: 0;
}

.chungusServers-scroller {
	flex: 1 1 auto;
	min-height: 0;
	overflow-x: hidden;
	overflow-y: auto;
	padding: var(--space-xs, 6px) 8px 24px 8px;
	scrollbar-width: thin;
	scrollbar-color: var(--scrollbar-thin-thumb, rgba(128, 128, 128, 0.3)) transparent;
}

.chungusServers-row {
	display: flex;
	align-items: center;
	gap: 8px;
	position: relative;
	height: 32px;
	margin: 1px 0;
	padding: 0 8px;
	border-radius: 6px;
	box-sizing: border-box;
	cursor: pointer;
	user-select: none;
	color: var(--interactive-text-default);
	font-size: 14px;
	font-weight: 500;
	line-height: 18px;
}

.chungusServers-row:hover {
	background: var(--interactive-background-hover);
	color: var(--interactive-text-hover);
}

.chungusServers-row:active {
	background: var(--interactive-background-active);
}

.chungusServers-row.chungusServers-selected {
	background: var(--interactive-background-selected);
	color: var(--interactive-text-active);
}

.chungusServers-row.chungusServers-unread {
	color: var(--interactive-text-active);
	font-weight: 600;
}

.chungusServers-row.chungusServers-muted:not(.chungusServers-selected) {
	opacity: 0.45;
}

.chungusServers-row.chungusServers-dragging {
	opacity: 0.4;
}

/* The white pill Discord shows beside unread and selected servers. */
.chungusServers-pill {
	position: absolute;
	left: -8px;
	top: 50%;
	width: 4px;
	height: 0;
	border-radius: 0 4px 4px 0;
	background: var(--interactive-text-active);
	transform: translateY(-50%);
	transition: height 0.15s ease;
}

.chungusServers-unread > .chungusServers-pill {
	height: 8px;
}

.chungusServers-row:hover > .chungusServers-pill {
	height: 16px;
}

.chungusServers-selected > .chungusServers-pill {
	height: 24px;
}

.chungusServers-icon {
	flex: 0 0 auto;
	width: 24px;
	height: 24px;
	border-radius: 8px;
	object-fit: cover;
	-webkit-user-drag: none;
}

.chungusServers-acronym {
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	background: var(--background-base-low);
	color: var(--interactive-text-active);
	font-size: 9px;
	font-weight: 600;
	white-space: nowrap;
}

.chungusServers-glyph {
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--background-base-low);
	color: var(--interactive-text-active);
}

.chungusServers-row:hover .chungusServers-home,
.chungusServers-selected .chungusServers-home {
	background: var(--brand-500);
	color: #fff;
}

.chungusServers-avatar {
	border-radius: 50%;
	background: var(--background-base-low);
}

.chungusServers-name {
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.chungusServers-mention {
	flex: 0 0 auto;
	min-width: 16px;
	height: 16px;
	padding: 0 5px;
	border-radius: 8px;
	box-sizing: border-box;
	background: var(--status-danger, #f23f43);
	color: #fff;
	font-size: 11px;
	font-weight: 700;
	line-height: 16px;
	text-align: center;
}

.chungusServers-voice {
	flex: 0 0 auto;
	color: var(--status-positive, #23a55a);
}

.chungusServers-chevron {
	flex: 0 0 auto;
	color: var(--icon-muted, currentColor);
	transition: transform 0.15s ease;
}

.chungusServers-chevronOpen {
	transform: rotate(90deg);
}

.chungusServers-folderIcon {
	--chungusServers-folderColor: var(--brand-500);
	flex: 0 0 auto;
	display: grid;
	grid-template-columns: repeat(2, 10px);
	grid-auto-rows: 10px;
	gap: 2px;
	align-content: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	border-radius: 8px;
	background: color-mix(in srgb, var(--chungusServers-folderColor) 40%, transparent);
}

.chungusServers-folderIconItem {
	width: 10px;
	height: 10px;
	border-radius: 3px;
	object-fit: cover;
	-webkit-user-drag: none;
}

.chungusServers-folderIconItem.chungusServers-acronym {
	font-size: 0;
}

.chungusServers-folderChildren {
	margin: 0 0 2px 11px;
	padding-left: 6px;
	border-left: 2px solid color-mix(in srgb, var(--chungusServers-folderColor, var(--brand-500)) 55%, transparent);
}

.chungusServers-child {
	height: 30px;
}

.chungusServers-parentIcon {
	color: var(--interactive-text-default);
}

.chungusServers-parent.chungusServers-open .chungusServers-parentIcon,
.chungusServers-parent:hover .chungusServers-parentIcon {
	color: var(--interactive-text-active);
}

.chungusServers-parentChildren {
	margin: 0 0 2px 11px;
	padding-left: 6px;
	border-left: 2px solid var(--border-subtle, rgba(128, 128, 128, 0.3));
}

.chungusServers-parentChildren .chungusServers-row > .chungusServers-pill {
	left: -16px;
}

.chungusServers-parentEmpty {
	display: flex;
	align-items: center;
	height: 30px;
	margin: 1px 0;
	padding: 0 8px;
	border: 1px dashed var(--text-muted);
	border-radius: 6px;
	box-sizing: border-box;
	color: var(--text-muted);
	font-size: 12px;
}

.chungusServers-isDragging .chungusServers-parentEmpty {
	border-color: var(--brand-500, #5865f2);
}

.chungusServers-actionLine {
	display: flex;
	align-items: center;
	gap: 2px;
}

.chungusServers-actionLine > .chungusServers-row {
	flex: 1 1 auto;
	min-width: 0;
}

.chungusServers-newFolder {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	padding: 0;
	border-radius: 6px;
	background: none;
	color: var(--interactive-text-default);
	cursor: pointer;
}

.chungusServers-newFolder:hover {
	background: var(--interactive-background-hover);
	color: var(--status-positive, #23a55a);
}

.chungusServers-nameInput {
	flex: 1 1 auto;
	min-width: 0;
	height: 22px;
	padding: 0 6px;
	border: none;
	border-radius: 4px;
	outline: 2px solid var(--brand-500, #5865f2);
	background: var(--input-background, var(--background-base-lowest));
	color: var(--text-default, #fff);
	font: inherit;
}

.chungusServers-child > .chungusServers-pill {
	left: -16px;
}

.chungusServers-sectionHeader {
	display: flex;
	align-items: center;
	gap: 4px;
	height: 24px;
	padding: 0 4px;
	cursor: pointer;
	user-select: none;
	color: var(--text-muted);
	font-size: 12px;
	font-weight: 600;
	letter-spacing: 0.02em;
	text-transform: uppercase;
}

.chungusServers-sectionHeader:hover {
	color: var(--interactive-text-hover);
}

.chungusServers-sectionHeader .chungusServers-chevron {
	width: 10px;
	height: 10px;
	color: currentColor;
}

.chungusServers-pinZone {
	position: relative;
	border-radius: 6px;
}

.chungusServers-pinZone.chungusServers-drop-into {
	box-shadow: inset 0 0 0 2px var(--brand-500, #5865f2);
}

.chungusServers-pinPlaceholder {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 32px;
	margin: 2px 0;
	border: 1px dashed var(--text-muted);
	border-radius: 6px;
	color: var(--text-muted);
	font-size: 12px;
}

.chungusServers-separator {
	height: 1px;
	margin: 6px 8px;
	background: var(--border-subtle);
}

.chungusServers-action .chungusServers-glyph {
	color: var(--status-positive, #23a55a);
}

.chungusServers-action:hover .chungusServers-glyph {
	background: var(--status-positive, #23a55a);
	color: #fff;
}

.chungusServers-settingsRow {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 16px;
}

.chungusServers-settingsButton {
	padding: 6px 12px;
	border-radius: 6px;
	background: var(--background-mod-subtle, rgba(128, 128, 128, 0.2));
	color: var(--text-default, #fff);
	font-size: 14px;
	font-weight: 500;
}

.chungusServers-settingsButton:hover:not(:disabled) {
	background: var(--interactive-background-hover);
}

.chungusServers-settingsButton:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.chungusServers-settingsNote {
	margin-top: 8px;
	color: var(--text-muted);
	font-size: 13px;
	line-height: 18px;
}

/* Drop markers, like ChungusTabs: a blue line where it lands, or an outline
   when it goes into a folder. */
.chungusServers-group {
	position: relative;
}

.chungusServers-group.chungusServers-drop-before::before,
.chungusServers-group.chungusServers-drop-after::after,
.chungusServers-row.chungusServers-drop-before::before,
.chungusServers-row.chungusServers-drop-after::after {
	content: "";
	position: absolute;
	left: 4px;
	right: 4px;
	height: 2px;
	border-radius: 1px;
	background: var(--brand-500, #5865f2);
	pointer-events: none;
	z-index: 1;
}

.chungusServers-group.chungusServers-drop-before::before,
.chungusServers-row.chungusServers-drop-before::before {
	top: -2px;
}

.chungusServers-group.chungusServers-drop-after::after,
.chungusServers-row.chungusServers-drop-after::after {
	bottom: -2px;
}

.chungusServers-row.chungusServers-drop-into {
	box-shadow: inset 0 0 0 2px var(--brand-500, #5865f2);
	background: var(--interactive-background-hover);
}

.chungusServers-isDragging .chungusServers-row:not(.chungusServers-drop-into):hover {
	background: none;
}

.chungusServers-resizeHandle {
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	width: 5px;
	cursor: col-resize;
	z-index: 2;
}

.chungusServers-resizeHandle:hover,
body.chungusServers-resizing .chungusServers-resizeHandle {
	background: color-mix(in srgb, var(--brand-500) 50%, transparent);
}

body.chungusServers-resizing {
	cursor: col-resize;
	user-select: none;
}

/* CollapsibleUI animates the bar's width, which makes resizing lag. */
body.chungusServers-resizing .chungusServers-column,
body.chungusServers-resizing .chungusServers-column > nav {
	transition: none !important;
}
`;

//#endregion

export function getCss() {
	return css + layoutCss();
}

function isToggleShortcut(event) {
	const mod = navigator.platform.startsWith("Mac")
		? event.metaKey
		: event.ctrlKey;
	return mod && event.shiftKey && !event.altKey && event.code === "KeyB";
}

// Loads the saved settings. Call before the list first renders.
export function loadSettings() {
	settings = { ...defaults, ...(platform.storage.load("settings") ?? {}) };
}

// Command-Shift-B (Ctrl-Shift-B elsewhere) switches between the wide list and
// Discord's icon bar.
export function onKeyDown(event) {
	if (event.repeat || !isToggleShortcut(event)) return;
	event.preventDefault();
	event.stopPropagation();
	setSettings({ iconMode: !settings.iconMode });
}

// Stands in for Discord's server bar. `native` is what Discord rendered, shown
// in icon mode and if the list crashes.
export function renderServerBar(barProps, native) {
	return (
		<ErrorBoundary fallback={native}>
			<ServerColumn barProps={barProps} native={native} />
		</ErrorBoundary>
	);
}

// Discord's server and folder menus (also used by its icon bar) get a pin item
// for servers, parent folder items for top-level folders and loose servers, and
// icon items for both. Folders also get mute and notification items for all
// their servers. Returns BetterDiscord-style menu groups to add.
export function guildMenuGroups(props) {
	const guild = props?.guild;
	const items = [];
	if (guild) {
		items.push({
			id: "chungus-servers-pin",
			label: settings.pinned.includes(guild.id) ? "Unpin Server" : "Pin Server",
			action: () => togglePin(guild.id),
		});
		items.push(...parentMenuItems(`g:${guild.id}`));
		// Icon choices only show in the wide list, not Discord's icon bar.
		// A folder hiding all its servers' icons covers this one too.
		const hidden = settings.icons[`g:${guild.id}`]?.hidden;
		const folder = SortedGuildStore.getGuildFolders().find(
			(folder) => folder.folderId != null && folder.guildIds.includes(guild.id),
		);
		if (
			!settings.iconMode &&
			!settings.icons[`f:${folder?.folderId}`]?.hideServers
		)
			items.push({
				id: "chungus-servers-hide-icon",
				label: hidden ? "Show Server Icon" : "Hide Server Icon",
				action: () => setIcon(`g:${guild.id}`, { hidden: !hidden }),
			});
	} else if (props?.folderId != null) {
		items.push(...parentMenuItems(`f:${props.folderId}`));
		if (!settings.iconMode) {
			const key = `f:${props.folderId}`;
			const hideServers = settings.icons[key]?.hideServers;
			items.push(folderIconMenu(key), {
				id: "chungus-servers-hide-server-icons",
				label: hideServers ? "Show Server Icons" : "Hide Server Icons",
				action: () => setIcon(key, { hideServers: !hideServers }),
			});
		}
	}
	const groups = [];
	if (props?.folderId != null && !guild)
		groups.push({
			type: "group",
			items: folderNotificationItems(props.folderId),
		});
	if (items.length) groups.push({ type: "group", items });
	return groups;
}

export function SettingsPanel() {
	const current = useSettings();
	const [backup, setBackup] = useState(loadBackup);
	const shortcut = navigator.platform.startsWith("Mac")
		? "Command-Shift-B"
		: "Ctrl-Shift-B";
	const restore = () => {
		if (!backup || !saveGuildFolders) return;
		platform.confirm(
			"Restore server list",
			`Put your servers and folders back the way they were on ${new Date(backup.savedAt).toLocaleString()}? Changes since then are lost.`,
			{
				confirmText: "Restore",
				danger: true,
				onConfirm: () => {
					saveGuildFolders(backup.folders);
					platform.toast("Server list restored", "success");
				},
			},
		);
	};
	return (
		<div>
			{platform.SettingsSwitches({
				settings: [
					{
						type: "switch",
						id: "iconMode",
						name: "Show icons only",
						note: `Switch back to Discord's narrow icon bar. You can also press ${shortcut}, or drag the right edge of the list.`,
						value: current.iconMode,
					},
					{
						type: "switch",
						id: "showUnreadDMs",
						name: "Show unread direct messages",
						note: "List unread direct messages under Direct Messages, like Discord's bar.",
						value: current.showUnreadDMs,
					},
					{
						type: "switch",
						id: "showDiscover",
						name: "Show Discover",
						value: current.showDiscover,
					},
				],
				onChange: (_category, id, value) => setSettings({ [id]: value }),
			})}
			<div className="chungusServers-settingsRow">
				<button
					className="chungusServers-settingsButton"
					onClick={() => setSettings({ iconMode: false, width: DEFAULT_WIDTH })}
				>
					Reset width
				</button>
				<button
					className="chungusServers-settingsButton"
					disabled={!backup}
					onClick={restore}
				>
					Restore original server order
				</button>
				{backup && (
					<button
						className="chungusServers-settingsButton"
						onClick={() => {
							forgetBackup();
							setBackup(null);
						}}
					>
						Forget backup
					</button>
				)}
			</div>
			<div className="chungusServers-settingsNote">
				{backup
					? `A copy of your server list from ${new Date(backup.savedAt).toLocaleString()} was saved the first time ChungusServers changed it. Forgetting it saves a new copy the next time you move something.`
					: "ChungusServers saves a copy of your server list the first time you move something, so you can put it back here."}
			</div>
		</div>
	);
}
