# CategoryAlerts

![CategoryAlerts category menu, a desktop notification, and an in-app toast](../../docs/images/categoryalerts.png)

Get notified when something happens in a category you care about. Right-click a category to get alerts for new channels, new messages, or both. Each kind of alert has its own sound.

## Features

- **New channel alerts**: know right away when a channel shows up in the category, like a new ticket.
- **New message alerts**: know when someone posts in any channel in the category.
- **Two kinds of alerts**: a desktop notification, a pop-up inside Discord, or both. Click the notification to jump to it.
- **Your own sounds**: pick a different sound for each kind of alert, and set the volume.
- **No double alerts**: a ticket bot's welcome message doesn't alert you again.

Change sounds, volume, and watched categories in the plugin's settings.

## Good to know

- Alerts only arrive while Discord is open.
- Desktop notifications need Discord's notifications turned on in your system settings.
- Streamer Mode mutes the alert sounds.

## Install

1. [Download CategoryAlerts.plugin.js](https://raw.githubusercontent.com/echo4eva/discord-plugins/master/Plugins/CategoryAlerts/CategoryAlerts.plugin.js).
2. Put it in BetterDiscord's `plugins` folder and turn it on in BetterDiscord's Plugins settings.

## Develop

Edit [`src/CategoryAlerts/index.jsx`](../../src/CategoryAlerts/index.jsx), then run `npm run build:alerts` from the repository root.
