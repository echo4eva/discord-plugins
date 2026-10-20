/*
 * ThreadNavigator for Vencord, by echo4eva
 * SPDX-License-Identifier: MIT
 */

import { copyWithToast } from "@utils/discord";
import {
	DefaultExtractAndLoadChunksRegex,
	extractAndLoadChunksLazy,
	findModuleId,
	wreq,
} from "@webpack";
import { ChannelStore, ContextMenuApi, Menu } from "@webpack/common";

// Discord loads its thread right-click menu on demand. The thread sidebar
// header knows how to load it, so borrow its chunk list.
const loadThreadMenuChunks = extractAndLoadChunksLazy(
	["parentChannel:", "inSidebar:!0,handleContextMenu:"],
	new RegExp(
		"inSidebar:!0,handleContextMenu:.+?" +
			DefaultExtractAndLoadChunksRegex.source,
	),
);

let ThreadMenu: any = null;

async function getThreadMenu() {
	if (ThreadMenu) return ThreadMenu;
	try {
		await loadThreadMenuChunks();
		const id = findModuleId('navId:"thread-context"');
		ThreadMenu = id != null ? (wreq(id as any)?.default ?? null) : null;
	} catch (error) {
		console.warn("[ThreadNavigator] Thread menu lookup failed", error);
	}
	return ThreadMenu;
}

interface FallbackProps {
	thread: { id: string };
	guildId: string;
	onOpen(inTab: boolean): void;
}

function FallbackMenu({
	thread,
	guildId,
	onOpen,
	...props
}: FallbackProps & Record<string, any>) {
	return (
		<Menu.Menu
			navId="thread-navigator-thread"
			onClose={ContextMenuApi.closeContextMenu}
			{...props}
		>
			<Menu.MenuItem
				id="tn-open"
				label="Open thread"
				action={() => onOpen(false)}
			/>
			<Menu.MenuItem
				id="tn-open-tab"
				label="Open in new tab"
				action={() => onOpen(true)}
			/>
			<Menu.MenuSeparator />
			<Menu.MenuItem
				id="tn-copy-link"
				label="Copy link"
				action={() =>
					copyWithToast(
						`https://discord.com/channels/${guildId}/${thread.id}`,
						"Link copied",
					)
				}
			/>
			<Menu.MenuItem
				id="tn-copy-id"
				label="Copy thread ID"
				action={() => copyWithToast(thread.id, "Thread ID copied")}
			/>
		</Menu.Menu>
	);
}

// Same menu as right-clicking the thread in the channel list: Discord's own
// thread menu, with anything other plugins add to it.
export function openThreadMenu(
	event: React.MouseEvent,
	fallback: FallbackProps,
) {
	event.preventDefault();
	event.stopPropagation();
	const channel = ChannelStore.getChannel(fallback.thread.id);
	ContextMenuApi.openContextMenuLazy(event as any, async () => {
		const Native = channel && (await getThreadMenu());
		if (Native) return (props: any) => <Native {...props} channel={channel} />;
		return (props: any) => <FallbackMenu {...props} {...fallback} />;
	});
}
