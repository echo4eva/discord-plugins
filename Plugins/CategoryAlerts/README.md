# CategoryAlerts

CategoryAlerts notifies you when a new channel is created, or a new message is posted, inside a category you choose. An example is a **Tickets** section where each ticket gets its own channel. Discord has no notification setting for categories, so new ticket channels are easy to miss. Each kind of alert has its own sound, so you can tell a work alert from ordinary Discord pings.

## Use

Right-click a category in the channel list and turn on either or both:

- **Alert on new channels**: fires when a channel appears in the category, for example a new ticket.
- **Alert on new messages**: fires when someone other than you posts in a channel in that category, even if you are looking at it.

A bot message posted within 30 seconds of the new channel, like a ticket bot's welcome message, counts as part of the new-channel alert and doesn't alert again.

Each alert can show a desktop notification (macOS Notification Center), an in-app toast, or both. Clicking the desktop notification opens the channel or message.

Plugin settings let you:

- turn the desktop notification and the toast on or off
- pick a sound for new channels and a separate one for new messages from Discord's built-in sounds; picking one plays a preview
- set the alert volume
- see the watched categories and remove them

## Install

1. [Download CategoryAlerts.plugin.js](https://raw.githubusercontent.com/echo4eva/discord-plugins/master/Plugins/CategoryAlerts/CategoryAlerts.plugin.js).
2. Put it in BetterDiscord's `plugins` folder and enable **CategoryAlerts** in BetterDiscord's Plugins settings.

Alerts only arrive while Discord is running and connected. Threads are ignored. Desktop notifications need notifications for Discord turned on in macOS System Settings > Notifications. Streamer Mode mutes the alert sounds, like Discord's own sounds.

## Develop

Edit [`src/CategoryAlerts/index.jsx`](../../src/CategoryAlerts/index.jsx), then run `npm ci` and `npm run build:alerts` from the repository root. Commit the source and built plugin together. The repository's [MIT license](../../LICENSE) applies.
