# discord-plugins

BetterDiscord plugins by echo4eva.

## [ChungusTabs](Plugins/ChungusTabs/README.md)

Browser-style tabs for Discord. Group tabs into folders, close a folder to save it for later, and drag tabs and bookmarks wherever you want. Each tab remembers where you were scrolled, and on macOS the tab bar sits neatly beside the window buttons.

![ChungusTabs tab row with tab folders and the bookmark row](docs/images/channeltabs-overview.png)

## [ChungusServers](Plugins/ChungusServers/README.md)

A wider server list for Discord. Folders show their names instead of a bubble of tiny icons, and you can drag servers and folders into whatever order you like. Drag the edge to make the list wider or narrower.

![ChungusServers' wide server list with pinned servers, named folders, and a parent folder](docs/images/chungusservers-overview.png)

## [ThreadNavigator](Plugins/ThreadNavigator/README.md)

A better way to browse threads. Click the Threads button to see every thread in the channel, then search, filter and open one on the side while the list stays put. Select several threads to join, leave or close them all at once.

![ThreadNavigator's thread browser beside an open thread](docs/images/threadnavigator-browser.png)

## [CategoryAlerts](Plugins/CategoryAlerts/README.md)

Get notified when something happens in a category you care about. Right-click a category to get alerts for new channels, new messages, or both. Each kind of alert has its own sound.

![CategoryAlerts category menu, a desktop notification, and an in-app toast](docs/images/categoryalerts.png)

## Vesktop and Vencord

ChungusTabs, ChungusServers, and ThreadNavigator have native Vencord versions. Each shares its React interface and behavior with the BetterDiscord version. Stock Vencord cannot load BetterDiscord `.plugin.js` files; use the native builds below for Vesktop.

### Native Vencord versions

The native adapters are in [`vencord/`](vencord). Custom plugins must be built into a Vencord source checkout:

1. Clone [Vencord](https://github.com/Vendicated/Vencord) next to this repository (or set `VENCORD_DIR` to its path) and run `pnpm install` in it.
2. Run `npm run vencord:build` here. It copies the adapters, shared source, and plugin manifests into Vencord's `src/userplugins` and builds Vencord. `npm run vencord` only copies.
3. In Vesktop settings, set the Vencord location to the checkout's `dist` folder and restart. Enable **ChungusTabs**, **ChungusServers**, and **ThreadNavigator** in Vencord's plugin list, then reload when prompted.

To update, pull Vencord and run `npm run vencord:build` again. A custom Vencord location requires manual Vencord updates. Reset that location in Vesktop settings to return to its bundled Vencord.

Settings are stored separately in BetterDiscord and Vencord; existing tabs, bookmarks, pins, and local parent folders are not automatically transferred. See [shared implementation and validation notes](docs/shared-plugin-ui.md) for source locations, build steps, and test coverage.

### BetterDiscord compatibility option

The same BetterDiscord files can also run through [BetterVencord](https://github.com/Davilarek/BetterVencordPatchset), a third-party Vencord patchset with a BD Compatibility Layer. Import the `.plugin.js` files into `/BD/plugins` in its Virtual Filesystem settings and reload BD Plugins. Use either the native plugins or the compatibility versions of these plugins in that app. If compatibility-layer right-click menus are missing, its configured CORS proxy may be unavailable.

## Credits

ChungusTabs is a fork of the original [ChannelTabs](https://github.com/samfundev/BetterDiscordStuff/tree/master/Plugins/ChannelTabs) by l0c4lh057 and CarJem Generations, maintained by samfundev and contributors in [samfundev/BetterDiscordStuff](https://github.com/samfundev/BetterDiscordStuff). This repository started from that one and keeps its git history and build tooling. It was previously called ChannelTabsMac, then ChannelTabs. ChungusServers, ThreadNavigator, and CategoryAlerts are original to this repository.

Everything here is under the [MIT license](LICENSE), which keeps the original ChannelTabs copyright notice.

## Problems

If you have a problem with something, please [open an issue about it](https://github.com/echo4eva/discord-plugins/issues/new/choose).

## Building

Edit the files in `src`, then run `npm ci` and one of these from the repository root to build into `Plugins`:

- `npm run build:tabs` for ChungusTabs
- `npm run build:servers` for ChungusServers
- `npm run build:threads` for ThreadNavigator
- `npm run build:alerts` for CategoryAlerts
- `npm run build` for all of them

Don't edit the files in `Plugins` directly. Each plugin's changelog is generated from commit messages that start with `added:`, `fixed:`, `improved:`, or `progress:`.

The README images are mockups with sample data, built from the plugins' own styles in [`docs/mockups`](docs/mockups). After changing one, run `docs/mockups/render.sh` (it uses Google Chrome) to regenerate the PNGs in `docs/images`.
