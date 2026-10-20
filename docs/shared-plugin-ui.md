# Shared plugin interfaces

ChungusTabs, ChungusServers, and ThreadNavigator each have one React interface and shared behavior used by both BetterDiscord and native Vencord builds. Changes to the shared source reach both builds after rebuilding and reloading each app.

## Where to edit

- `src/shared/chungusTabs/core.jsx`: tab and bookmark bars, tab folders, drag behavior, navigation, shortcuts, scroll memory, settings model, and styles. `createChannelTabs(platform)` creates the implementation after Discord's React and modules are available.
- `src/shared/chungusServers/core.jsx`: server list, pins, parent folders, drag behavior, resizing, menu actions, settings, and styles. Each adapter calls `init(platform)` before rendering it.
- `src/shared/threadNavigator/`: thread panel, thread data/actions, open state, filters, and styles.
- `src/shared/menuItems.jsx`: converts menu descriptions to Discord menu elements for native Vencord, including function-valued checkboxes and custom controls.

The BetterDiscord adapters are `src/ChungusTabs/index.jsx`, `src/ChungusServers/index.jsx`, and `src/ThreadNavigator/index.jsx`. The native adapters are in the corresponding `vencord/` directories. They provide Discord module lookup, storage, platform dialogs and controls, and the hooks that put the shared interface on screen.

BetterDiscord patches the title bar and server bar at runtime; Vencord patches Discord's source before those modules execute. The Vencord Tabs adapter also listens for channel selection, replacing BetterDiscord's `onSwitch` callback. Shared Tabs emits `chungus-tabs-change` after the active tab changes, including switches between tabs on the same channel. ThreadNavigator listens to that event so its per-tab open state updates without relying on a route change.

## Build and reload

For installation, follow the official guides linked from the [README](../README.md#native-vencord-versions). The commands below describe this repository's development workflow.

Run `npm run build` for all BetterDiscord files, or `npm run build:tabs`, `npm run build:servers`, and `npm run build:threads` individually. Release builds write to `Plugins/`. `npm run dev` watches source and copies development builds into BetterDiscord's plugin folder.

Run `npm run vencord:build` to copy the native adapters, shared source, and plugin manifests into a Vencord checkout and build it. The default checkout is `../Vencord`; override it with `VENCORD_DIR`. The copies in Vencord's `src/userplugins/` are build inputs, so edit this repository and copy again. Restart or reload Vesktop to load the rebuilt code. Turn on the three plugins in Vencord's plugin settings; source patches require a reload when enabled.

A shared visual or behavior change usually needs only the shared source. A new Discord API dependency must be supplied by both adapters. Keep shared code free of direct `BdApi` or Vencord imports and avoid using Discord's React or stores at module load.

## Saved data

The platforms store settings separately. Sharing source does not copy saved tabs, bookmarks, pins, or local parent folders between apps. BetterDiscord Tabs retains its historic `ChannelTabsMac` namespaces and account-specific keys. Native Tabs uses the same account-specific keys inside Vencord's ChungusTabs settings. Native adapters copy JSON data into and out of Vencord's settings proxies so saving does not fail with a structured-clone error. Discord's own server folders and server order remain account data.

## Verification on 2026-10-20

ChungusTabs 3.1.0 and ChungusServers 1.5.0 use the shared implementations. The native versions build against the local Vencord checkout; its TypeScript check passes. The BetterDiscord build also passes.

Native Vesktop checks cover navigation, creating/switching/closing tabs, keyboard shortcuts, tab-folder creation/collapse/save/reopen, bookmarks and their menus, settings switches, quick-settings checkboxes and slider, reload persistence, server/folder menus, pinning, icon mode, and same-channel tab state in ThreadNavigator.

The same BetterDiscord bundles were exercised through BetterVencord in a separate Vesktop profile: navigation, tab folders, bookmarks, menus, configured shortcuts, settings-switch changes, pinning, icon mode, and same-channel ThreadNavigator state passed. Actual BetterDiscord was not runtime-tested in this session. The compatibility layer still lacks a keybind recorder in its settings panel; use native Vencord, actual BetterDiscord, or keep the shortcuts already saved. Its loader also logs its own module-lookup warnings.

Server reorder and bulk notification changes are excluded from smoke checks because they change account data. Per-tab scroll restoration and Windows were not runtime-tested during this refactor. Both platforms require separate builds and reloads; shared source is not a live synchronization mechanism.
