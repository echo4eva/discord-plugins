# ThreadNavigator

![ThreadNavigator's thread browser beside an open thread](../../docs/images/threadnavigator-browser.png)

A better way to browse threads. Click the Threads button to see every thread in the channel, then search, filter and open one on the side while the list stays put. Select several threads to join, leave or close them all at once.

## Features

- **Thread list**: click the Threads button in a channel to see all its threads. Click it again, or **×**, to go back to chat.
- **Open on the side**: click a thread to open it on the right. The list stays open.
- **Search and filter**: search by name, and filter by active or archived, joined or not joined.
- **Unread first**: threads with mentions and new messages sit at the top, with red and blue badges.
- **Right-click menu**: right-click a thread for the same menu you get in Discord's channel list.
- **Open in a tab**: with [ChannelTabsMac](../ChannelTabsMac/README.md), the ↗ button opens a thread in a new tab, and each tab keeps its own list open or closed.

## Bulk actions

![ThreadNavigator selection mode with the bulk action bar](../../docs/images/threadnavigator-bulk.png)

Click **Select**, or Shift-click a thread, to pick several threads. Then **Join**, **Leave**, **Mark read**, **Close**, **Close & lock**, or **Reopen** them all at once. Shift-click selects a range, and Command-A selects everything shown.

Closing and locking need the Manage Threads permission.

## Good to know

- The list only shows threads Discord has already loaded. Use **Discord discovery** to find older archived threads.
- Discord layout updates can break the plugin until it's updated.

## Install

1. [Download ThreadNavigator.plugin.js](https://raw.githubusercontent.com/echo4eva/discord-plugins/master/Plugins/ThreadNavigator/ThreadNavigator.plugin.js).
2. Put it in BetterDiscord's `plugins` folder and turn it on in BetterDiscord's Plugins settings.
3. Optional: install [ChannelTabsMac](../ChannelTabsMac/README.md) to open threads in tabs.

## Develop

Edit [`src/ThreadNavigator/index.jsx`](../../src/ThreadNavigator/index.jsx), then run `npm run build:threads` from the repository root.
