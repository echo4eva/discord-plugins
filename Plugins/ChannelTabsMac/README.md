# ChannelTabsMac

ChannelTabsMac is a macOS layout variant of [ChannelTabs](../ChannelTabs/README.md) 2.8.9. The three navigation buttons sit together immediately to the right of the native red, yellow, and green window controls. The first tab follows the buttons. The layout change applies only on macOS.

On macOS, **Command-click** a server icon, channel, thread, direct message, or ChannelTabsMac bookmark to open it in a ChannelTabs tab. This also works for bookmarks inside folders. A server icon opens the server, with Discord choosing which channel to show. Your current view stays open unless you have enabled **Always focus new tabs**. In **ChannelTabsMac → Settings → Behavior**, choose a different click shortcut (Command-Shift, Option, Option-Shift, or Shift) or turn it off. The existing **ChannelTabs → Open in new tab** right-click menu remains available.

**Command-1** through **Command-9** switch to the corresponding tabs from left to right. When that numbered tab does not exist, the shortcut does nothing. Toggle **Command + number switches tabs** in Behavior settings to restore Discord's server shortcuts.

## Tab folders

Use the folder-plus button beside the new-tab button to create a named folder in the tab row. Right-click a tab and choose **Move to folder** to place it in an existing folder, create a folder for it, or move it back out. You can also drag a tab onto a folder label. Click a folder label to collapse or expand its tabs; right-click it to rename or delete the folder. Deleting a folder keeps its tabs open. New tabs, including duplicated tabs and tabs opened from bookmarks, start outside folders.

Folder labels have no border. An open folder has a faint line under its label and tabs. The folder holding the current tab gets a stronger U instead: a line down the label's left edge, along the bottom of the label and its tabs, and up the right edge of its last tab. Tabs outside folders sit after that outline, so they never look like part of a folder.

Dragging works like bookmarks: nothing moves until you let go. A blue line shows whether a tab or folder will land before or after the one under the cursor, and a folder label gets a blue outline when a dragged tab will go into it. A tab dropped next to a tab in a folder joins that folder.

### Closing and reopening folders

Right-click a folder and choose **Close folder** to take it and its tabs off the tab row without losing them. Once a folder is closed, a saved-folders button with a count appears beside the new-folder button. Click it to see your saved folders and click one to reopen it. It comes back at the end of the tab row with the same tabs, and you switch to its first tab. **Forget saved folder** in the same menu removes a saved folder for good. If the folder you close holds the current tab, you move to the tab next to where the folder was. If it held every open tab, a Friends tab opens so the row is never empty.

Collapsed folders show their tab count and highlight when they contain the current tab. The all-tabs menu still lists every tab, including hidden ones, and switching to a tab in a collapsed folder expands it. Command-number shortcuts count visible tabs from left to right, skipping tabs hidden inside collapsed folders.

Command-click also works on threads listed under a channel in the sidebar, including rows that aren't plain links.

## Copy a tab's link

Right-click a tab and choose **Copy link** to copy its Discord link: a channel, thread, forum post, direct message, or any other page the tab is showing. The link opens in Discord for anyone with access. It points at what the tab was last showing, so a tab you've browsed to a different channel copies that channel's link.

## Bookmarks

Drag a bookmark to reorder it, in the bookmark row or inside an open bookmark group. A line shows where it will land (left or right of the bookmark you're over, above or below inside a group), and it moves when you let go. Bookmarks stay in their own row or group while dragging, and letting go doesn't open the bookmark.

Bookmark groups show a folder icon before their name. Drag a group to move it anywhere in the row, including between loose bookmarks; the same drop line shows where it will land. You can also drag a loose bookmark to land beside a group. The spot is saved with the group.

Click a bookmark group to open it and click it again to close it. Clicking anywhere else, or pressing Escape, also closes it.

## Scroll position per tab

Each tab remembers how far you scrolled the channel list (left), the chat messages (middle), and the member list (right), and puts them back when you switch to that tab. Positions are saved with your tab settings, so they survive a Discord restart. The message position is anchored to the message at the top of the view, so it still lands in the right place if new messages arrived while you were away. If that message is no longer loaded, ChannelTabsMac asks Discord to load it. Scrolling by hand while a position is being restored cancels the restore. Turn this off with **Behavior → Remember scroll position per tab**.

Press **Option-W** to close the current tab. If it is the last tab, the same shortcut closes the Discord window while keeping that tab saved for the next launch. In **ChannelTabsMac → Settings → Behavior → Close current tab**, record a different keybind or clear it to disable the shortcut. The quick settings menu shows the currently assigned keybind.

Discord may process its native **Command-W** window shortcut before ChannelTabsMac receives the key press, so assigning Command-W is not guaranteed to close a tab first. Option-W avoids that conflict.

[ThreadNavigator](../ThreadNavigator/README.md) can also open its listed threads in ChannelTabsMac tabs using the arrow beside each thread or Command-click on its name.

## Install

1. [Download ChannelTabsMac.plugin.js](https://raw.githubusercontent.com/echo4eva/BetterDiscordStuff/master/Plugins/ChannelTabsMac/ChannelTabsMac.plugin.js).
2. Put the file in BetterDiscord's `plugins` folder and enable **ChannelTabsMac** in BetterDiscord's Plugins settings.
3. Disable **ChannelTabs** if it is installed; both plugins patch the same title bar.

This is a community fork, not a BetterDiscord store listing. The plugin keeps its own settings under the ChannelTabsMac name. Existing ChannelTabs settings are not copied automatically.

## Develop

Edit [`src/ChannelTabsMac/index.jsx`](../../src/ChannelTabsMac/index.jsx), then run `npm ci` and `npm run build:mac` from the repository root. The built plugin appears in this folder. Commit source and built plugin together so the download stays current. `npm run build:mac` does not change installed BetterDiscord plugins.

The macOS title bar rules are in `MacTitleBarStyle` in `applyStyle()`. The original authors retain credit, and this fork retains the repository's [MIT license](../../LICENSE).
