# discord-plugins

BetterDiscord plugins by echo4eva.

## ChannelTabsMac

[ChannelTabsMac](Plugins/ChannelTabsMac/README.md) is a macOS port of ChannelTabs. It places back, forward, and close-tab immediately to the right of the native window controls. It adds tab folders that can be closed and reopened later, per-tab scroll memory, drag-to-reorder tabs and bookmarks, and a configurable modifier-click shortcut for opening sidebar channels, threads, and direct messages in new tabs. It has its own plugin name so it can be installed without replacing ChannelTabs. Enable only one of ChannelTabs and ChannelTabsMac at a time.

## ThreadNavigator

[ThreadNavigator](Plugins/ThreadNavigator/README.md) turns Discord's Threads button into a searchable browser in the channel chat area. Selecting a thread opens its chat on the right while the browser stays visible. It includes archived-thread filters, bulk thread actions, Discord's own thread right-click menu, and optional one-click opening in ChannelTabsMac tabs.

## CategoryAlerts

[CategoryAlerts](Plugins/CategoryAlerts/README.md) notifies you, with its own sounds, when a new channel or message appears in a category you watch, such as a ticket section, since Discord has no notification setting for categories.

## Credits

ChannelTabsMac is built on [ChannelTabs](https://github.com/samfundev/BetterDiscordStuff/tree/master/Plugins/ChannelTabs) by l0c4lh057 and CarJem Generations, maintained by samfundev and contributors in [samfundev/BetterDiscordStuff](https://github.com/samfundev/BetterDiscordStuff). This repository started from that one and keeps its git history and build tooling. ThreadNavigator and CategoryAlerts are original to this repository.

Everything here is under the [MIT license](LICENSE), which keeps the original ChannelTabs copyright notice.

## Problems

If you have a problem with something, please [open an issue about it](https://github.com/echo4eva/discord-plugins/issues/new/choose).

## Building

Edit the files in `src`, then run `npm ci` and one of these from the repository root to build into `Plugins`:

- `npm run build:mac` for ChannelTabsMac
- `npm run build:threads` for ThreadNavigator
- `npm run build:alerts` for CategoryAlerts
- `npm run build` for all of them

Don't edit the files in `Plugins` directly. Each plugin's changelog is generated from commit messages that start with `added:`, `fixed:`, `improved:`, or `progress:`.
