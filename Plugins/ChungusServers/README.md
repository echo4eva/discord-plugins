# ChungusServers

![ChungusServers' wide server list with pinned servers, named folders, and a parent folder](../../docs/images/chungusservers-overview.png)

A wider server list for Discord. Folders show their names instead of a bubble of tiny icons, and you can drag servers and folders into whatever order you like. Drag the edge to make the list wider or narrower.

## Features

- **Named folders**: each folder shows as a row with its name, so you can tell them apart at a glance. A folder without a name shows the names of its servers. Click a folder to open it, and its servers appear indented underneath.
- **Pinned servers**: right-click a server and choose **Pin Server** to keep it in a Pinned section at the top, or drag it there. Drag pins to reorder them. Pinned servers stay in their folders too, and pins are only on this computer. Click the Pinned header to fold it up.
- **Your order, your way**: drag a server or folder up or down to move it. Put your favorite servers at the top as loose servers, and push the rest into folders lower down.
- **Synced**: the order is saved to your Discord account, so it shows up on your phone and other computers too.
- **Unreads at a glance**: unread servers are bright and have a white pill, mentions show a red count, muted servers are dimmed, and a speaker shows where you're in voice. A closed folder adds up the mentions inside it.
- **Resizable**: drag the right edge of the list. Double-click it to go back to the default width.
- **Icon mode**: drag the edge all the way in, or press Command-Shift-B (Ctrl-Shift-B on Windows), to switch back to Discord's own icon bar. Drag the edge back out to bring the names back.
- **Discord's menus**: right-click a server or folder for Discord's usual menu, including Folder Settings to rename or recolor a folder.
- **Works with ChungusTabs**: Command-click (Ctrl-click on Windows) a server to open it in a new tab, or drag it onto the bookmark row to bookmark it.

## Folders

![Dragging a server into a folder, naming a new folder, and moving a folder into a parent folder](../../docs/images/chungusservers-folders.png)

- **Folders by dragging**: drop a server in the middle of a folder to put it inside. Drop one server on another to make a new folder, the same way Discord does. Drag a server out of a folder to make it loose again.
- **New folders**: click the folder button to the right of **Add a Server** to make an empty folder at the bottom of the list, and type a name for it. Whatever you drag in first decides what it is: a server makes it a normal folder, and a folder makes it a folder of folders.
- **Folders in folders**: drop a folder in the middle of another folder (or a loose server) to put both in a parent folder, then type a name for it. Drop more folders and servers on the parent to add them, and drag them out to take them out. You can also right-click a folder or loose server and choose **Move to Parent Folder**. Right-click a parent folder to rename it or ungroup it (or delete it, if it's empty). A parent folder only goes one level deep, and a closed one adds up the mentions inside it.

## Good to know

- Folders you open in ChungusServers are separate from the ones open in Discord's icon bar.
- Discord's folders can't hold other folders, so parent folders are only on this computer. Your phone and Discord's icon bar still show the folders inside, one after another.
- With CollapsibleUI, the channel list keeps its own resize edge on its right side, so resizing the server list doesn't change it.
- The first time you move something, ChungusServers keeps a copy of your server list. If you ever want your old order back, use **Restore original server order** in the plugin's settings.

## Install

1. [Download ChungusServers.plugin.js](https://raw.githubusercontent.com/echo4eva/discord-plugins/master/Plugins/ChungusServers/ChungusServers.plugin.js).
2. Put it in BetterDiscord's `plugins` folder and turn it on in BetterDiscord's Plugins settings.

## Develop

Edit [`src/ChungusServers/index.jsx`](../../src/ChungusServers/index.jsx), then run `npm run build:servers` from the repository root.
