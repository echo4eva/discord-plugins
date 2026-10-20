// Which channels have ThreadNavigator's thread list open, shared by the
// BetterDiscord and Vencord versions.

// ChungusTabs (from echo4eva/discord-plugins) shares its tabs through this
// global; ChannelTabsMac and ChannelTabs builds used older names.
export const tabApi = () =>
	globalThis.__ChannelTabsTabAPI ?? globalThis.__ChannelTabsMacTabAPI;

// The list is open per tab and channel, so a tab on another channel shows its
// normal chat and a new tab on the same channel starts with chat. Without
// ChungusTabs it is just per channel.
const browserKey = (parentId) =>
	`${tabApi()?.getActiveTabId?.() ?? ""}:${parentId}`;

const openBrowsers = new Set();
const listeners = new Set();

export function subscribe(listener) {
	listeners.add(listener);
	window.addEventListener("chungus-tabs-change", listener);
	return () => {
		listeners.delete(listener);
		window.removeEventListener("chungus-tabs-change", listener);
	};
}

// Also called when the active tab may have changed, since that changes which
// lists count as open.
export function notifyChange() {
	for (const listener of listeners) listener();
}

export function isBrowserOpen(parentId) {
	return parentId != null && openBrowsers.has(browserKey(parentId));
}

export function setBrowserOpen(parentId, open) {
	if (open === isBrowserOpen(parentId)) return;
	if (open) openBrowsers.add(browserKey(parentId));
	else openBrowsers.delete(browserKey(parentId));
	notifyChange();
}

export function closeAllBrowsers() {
	openBrowsers.clear();
	notifyChange();
}

// Search and filters stay the same when switching channels.
export const lastFilters = {
	query: "",
	status: "active",
	membership: "any",
};
