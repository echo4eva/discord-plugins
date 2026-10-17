# BetterDiscordStuff

A fork of aarondoet/l0c4lh057's ChannelTabs plugin to help maintain it.

## ChannelTabsMac

This fork includes [ChannelTabsMac](Plugins/ChannelTabsMac/README.md), a macOS variant that places back, forward, and close-tab immediately to the right of the native window controls. It also adds a configurable modifier-click shortcut for opening sidebar channels, threads, and direct messages in new tabs. It has a separate plugin name so it can be installed without replacing the upstream file. Enable only one of ChannelTabs and ChannelTabsMac at a time.

## ThreadNavigator

[ThreadNavigator](Plugins/ThreadNavigator/README.md) turns Discord's Threads button into a searchable browser in the channel chat area. Selecting a thread opens its chat on the right while the browser stays visible. It includes loaded archived-thread filters and optional one-click opening in ChannelTabsMac tabs.

## CategoryAlerts

[CategoryAlerts](Plugins/CategoryAlerts/README.md) notifies you, with its own sounds, when a new channel or message appears in a category you watch, such as a ticket section, since Discord has no notification setting for categories.

### Problems

If you have a problem with something, please [open an issue about it](https://github.com/samfundev/BetterDiscordStuff/issues/new/choose).

### Contributing
If you want to contribute, please edit the files in the `src` folder and then run the dev script to build them into the `Plugins` folder. Please don't edit the files in the `Plugins` folder directly.
