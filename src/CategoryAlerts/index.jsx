const api = new BdApi("CategoryAlerts");
const { Webpack, ContextMenu, Data, UI, React } = api;

const ChannelStore = Webpack.getStore("ChannelStore");
const GuildStore = Webpack.getStore("GuildStore");
const UserStore = Webpack.getStore("UserStore");
const FluxDispatcher = Webpack.getByKeys(
	"subscribe",
	"dispatch",
	"unsubscribe",
);
const transitionTo = Webpack.getByStrings("transitionTo - Transitioning to ", {
	searchExports: true,
});
// SoundUtils.playSound(name, volume, callback, soundpack, options). It returns
// early while Streamer Mode has sounds disabled.
const playSound = Webpack.getByStrings(
	"disableSounds",
	"getSoundpack",
	"playWithListener",
	{ searchExports: true },
);

const CATEGORY = 4;
const THREAD_TYPES = [10, 11, 12];
// A bot message this soon after a channel was created belongs to the
// new-channel alert, like a ticket bot's welcome message.
const WELCOME_WINDOW = 30_000;

const SOUNDS = [
	["none", "No sound"],
	["mention1", "Mention 1"],
	["mention2", "Mention 2"],
	["mention3", "Mention 3"],
	["message2", "Message 2"],
	["message3", "Message 3"],
	["message1", "Message 1 (Discord default)"],
	["discodo", "Discodo"],
	["poggermode_achievement_unlock", "Achievement unlocked"],
	["poggermode_applause", "Applause"],
	["success", "Success"],
	["stage_waiting", "Stage waiting"],
	["user_join", "User join"],
	["reconnect", "Reconnect"],
	["ptt_start", "Push to talk"],
	["human_man", "Human man"],
	["robot_man", "Robot man"],
].map(([value, label]) => ({ value, label }));

const defaults = {
	watched: {},
	desktop: true,
	toast: true,
	channelSound: "mention2",
	messageSound: "message3",
	volume: 60,
};

module.exports = class CategoryAlerts {
	constructor(meta) {
		this.meta = meta;
		this.onChannelCreate = this.onChannelCreate.bind(this);
		this.onMessageCreate = this.onMessageCreate.bind(this);
	}

	start() {
		this.settings = this.loadSettings();
		this.seen = new Set();
		this.created = new Map();
		FluxDispatcher?.subscribe("CHANNEL_CREATE", this.onChannelCreate);
		FluxDispatcher?.subscribe("MESSAGE_CREATE", this.onMessageCreate);
		this.unpatchMenu = ContextMenu.patch("channel-context", (menu, props) => {
			const category = props?.channel;
			if (category?.type !== CATEGORY) return;
			const watch = this.settings.watched[category.id];
			menu.props.children.push(
				ContextMenu.buildMenuChildren([
					{
						type: "group",
						items: [
							{
								type: "toggle",
								label: "Alert on new channels",
								checked: Boolean(watch?.channels),
								action: () => this.toggleWatch(category, "channels"),
							},
							{
								type: "toggle",
								label: "Alert on new messages",
								checked: Boolean(watch?.messages),
								action: () => this.toggleWatch(category, "messages"),
							},
						],
					},
				]),
			);
		});
	}

	stop() {
		FluxDispatcher?.unsubscribe("CHANNEL_CREATE", this.onChannelCreate);
		FluxDispatcher?.unsubscribe("MESSAGE_CREATE", this.onMessageCreate);
		this.unpatchMenu?.();
	}

	loadSettings() {
		const saved = Data.load("settings") ?? {};
		const settings = { ...defaults, ...saved };
		// 0.1.0 stored a sound on/off switch and watched new channels only.
		if (saved.sound === false && !("channelSound" in saved))
			settings.channelSound = "none";
		delete settings.sound;
		for (const watch of Object.values(settings.watched)) {
			watch.channels ??= true;
			watch.messages ??= false;
		}
		return settings;
	}

	save() {
		Data.save("settings", this.settings);
	}

	toggleWatch(category, kind) {
		const watched = this.settings.watched;
		const watch = (watched[category.id] ??= {
			name: category.name,
			guildId: category.guild_id,
			channels: false,
			messages: false,
		});
		watch.name = category.name;
		watch[kind] = !watch[kind];
		if (!watch.channels && !watch.messages) delete watched[category.id];

		const what = kind === "channels" ? "new channels" : "new messages";
		UI.showToast(
			watch[kind]
				? `Watching ${category.name} for ${what}`
				: `No longer alerting on ${what} in ${category.name}`,
			{ type: watch[kind] ? "success" : "info" },
		);
		this.save();
	}

	onChannelCreate({ channel }) {
		const watch = this.settings.watched[channel?.parent_id];
		if (!watch?.channels) return;
		if (channel.type === CATEGORY || THREAD_TYPES.includes(channel.type))
			return;
		if (this.seen.has(channel.id)) return;
		this.seen.add(channel.id);
		this.created.set(channel.id, Date.now());

		const guild = GuildStore?.getGuild?.(channel.guild_id)?.name;
		this.notify({
			title: `New channel in ${watch.name}`,
			body: `#${channel.name}${guild ? ` · ${guild}` : ""}`,
			sound: this.settings.channelSound,
			path: `/channels/${channel.guild_id}/${channel.id}`,
		});
	}

	onMessageCreate({ channelId, message, optimistic }) {
		if (optimistic || !message?.author) return;
		const channel = ChannelStore?.getChannel?.(channelId);
		const watch = this.settings.watched[channel?.parent_id];
		if (!watch?.messages || THREAD_TYPES.includes(channel.type)) return;
		if (message.author.id === UserStore?.getCurrentUser?.()?.id) return;

		const createdAt = this.created.get(channelId);
		if (
			message.author.bot &&
			createdAt &&
			Date.now() - createdAt < WELCOME_WINDOW
		)
			return;

		const author =
			message.member?.nick ??
			message.author.global_name ??
			message.author.username;
		this.notify({
			title: `${author} in #${channel.name}`,
			body: this.preview(message),
			sound: this.settings.messageSound,
			path: `/channels/${channel.guild_id}/${channel.id}/${message.id}`,
		});
	}

	preview(message) {
		const text = message.content?.replace(/\s+/g, " ").trim();
		if (text) return text.length > 140 ? `${text.slice(0, 139)}…` : text;
		if (message.attachments?.length) return "Sent an attachment";
		if (message.embeds?.length) return "Sent an embed";
		return "Sent a message";
	}

	play(sound) {
		if (!sound || sound === "none") return;
		playSound?.(sound, this.settings.volume / 100);
	}

	notify({ title, body, sound, path }) {
		const open = () => transitionTo?.(path);
		this.play(sound);
		if (this.settings.desktop) {
			const notification = new Notification(title, { body, silent: true });
			notification.onclick = () => {
				window.focus();
				open();
			};
		}
		if (this.settings.toast) {
			UI.showToast(`${title}: ${body}`, { type: "info", timeout: 8000 });
		}
	}

	getSettingsPanel() {
		const plugin = this;
		return React.createElement(function Panel() {
			const [, rerender] = React.useReducer((n) => n + 1, 0);
			const entries = Object.entries(plugin.settings.watched);
			return React.createElement(
				"div",
				null,
				UI.buildSettingsPanel({
					settings: [
						{
							type: "switch",
							id: "desktop",
							name: "Desktop notification",
							note: "Shows in macOS Notification Center. Clicking it opens the channel or message.",
							value: plugin.settings.desktop,
						},
						{
							type: "switch",
							id: "toast",
							name: "In-app toast",
							value: plugin.settings.toast,
						},
						{
							type: "dropdown",
							id: "channelSound",
							name: "New channel sound",
							note: "Plays a preview when you pick one.",
							value: plugin.settings.channelSound,
							options: SOUNDS,
						},
						{
							type: "dropdown",
							id: "messageSound",
							name: "New message sound",
							value: plugin.settings.messageSound,
							options: SOUNDS,
						},
						{
							type: "slider",
							id: "volume",
							name: "Volume",
							min: 0,
							max: 100,
							units: "%",
							value: plugin.settings.volume,
						},
					],
					onChange: (_category, id, value) => {
						plugin.settings[id] = id === "volume" ? Math.round(value) : value;
						plugin.save();
						if (id.endsWith("Sound")) plugin.play(value);
					},
				}),
				React.createElement(
					"h3",
					{ style: { color: "var(--header-primary)", margin: "16px 0 8px" } },
					"Watched categories",
				),
				entries.length === 0
					? React.createElement(
							"div",
							{ style: { color: "var(--text-muted)" } },
							"None yet. Right-click a category in the channel list and choose “Alert on new channels” or “Alert on new messages”.",
						)
					: entries.map(([id, { name, guildId, channels, messages }]) =>
							React.createElement(
								"div",
								{
									key: id,
									style: {
										display: "flex",
										alignItems: "center",
										gap: 8,
										padding: "6px 0",
										color: "var(--text-default)",
									},
								},
								React.createElement(
									"span",
									{ style: { flex: 1 } },
									`${name} · ${GuildStore?.getGuild?.(guildId)?.name ?? guildId} — ${[
										channels && "new channels",
										messages && "new messages",
									]
										.filter(Boolean)
										.join(", ")}`,
								),
								React.createElement(
									"button",
									{
										onClick: () => {
											delete plugin.settings.watched[id];
											plugin.save();
											rerender();
										},
									},
									"Remove",
								),
							),
						),
			);
		});
	}
};
