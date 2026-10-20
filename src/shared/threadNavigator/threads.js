// ThreadNavigator's thread data and bulk actions, shared by the BetterDiscord
// and Vencord versions. Each version passes in Discord's stores and request
// helpers, since they find them differently.

const BROWSABLE_PARENT_TYPES = [0, 5];
const DISCORD_EPOCH = 1420070400000n;
const MANAGE_THREADS = 1n << 34n;
const BULK_DELAY = 300;

export const PAGE = 40;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const plural = (n) => `${n} thread${n === 1 ? "" : "s"}`;

function snowflakeTime(id) {
	try {
		return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
	} catch {
		return 0;
	}
}

function storeThreads(store, method, ...args) {
	try {
		return store?.[method]?.(...args) ?? [];
	} catch {
		return [];
	}
}

// Threads that need attention sort first: mentions, then other unread
// messages, then everything else. Within each group the most recent activity
// is first, so read threads form a stack: the one read last is on top and sinks
// as other threads are read or updated.
function attentionRank(thread) {
	if (thread.mentions > 0) return 0;
	return thread.unread ? 1 : 2;
}

const SHOWN_FIELDS = [
	"id",
	"name",
	"archived",
	"locked",
	"joined",
	"unread",
	"unreadCount",
	"unreadEstimated",
	"mentions",
	"lastMessageId",
	"readAt",
];

// Read states change for every message anywhere, so the list only re-renders
// when something it shows has changed.
export function sameThreads(a, b) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++)
		for (const field of SHOWN_FIELDS)
			if (a[i][field] !== b[i][field]) return false;
	return true;
}

export function filterThreads(threads, { query, status, membership }) {
	const needle = query.trim().toLocaleLowerCase();
	return threads.filter(
		(thread) =>
			(status === "all" || (status === "archived") === thread.archived) &&
			(membership === "any" || (membership === "joined") === thread.joined) &&
			thread.name.toLocaleLowerCase().includes(needle),
	);
}

// Each action applies only to the selected threads its test accepts, so a
// mixed selection can run several actions without errors from no-op requests.
export const BULK_ACTIONS = [
	{
		id: "join",
		label: "Join",
		verb: "Joining",
		past: "Joined",
		applies: (thread) => !thread.joined && !thread.archived,
		request: (thread) => ["put", `/channels/${thread.id}/thread-members/@me`],
	},
	{
		id: "leave",
		label: "Leave",
		verb: "Leaving",
		past: "Left",
		applies: (thread) => thread.joined,
		request: (thread) => ["del", `/channels/${thread.id}/thread-members/@me`],
	},
	{
		id: "read",
		label: "Mark read",
		past: "Marked read",
		applies: (thread) => thread.unread,
	},
	{
		id: "close",
		label: "Close",
		verb: "Closing",
		past: "Closed",
		confirm: true,
		applies: (thread, can) => !thread.archived && can.moderate,
		request: (thread) => [
			"patch",
			`/channels/${thread.id}`,
			{ archived: true },
		],
	},
	{
		id: "lock",
		label: "Close & lock",
		verb: "Locking",
		past: "Closed and locked",
		confirm: true,
		applies: (thread, can) =>
			(!thread.archived || !thread.locked) && can.manage,
		request: (thread) => [
			"patch",
			`/channels/${thread.id}`,
			{ archived: true, locked: true },
		],
	},
	{
		id: "reopen",
		label: "Reopen",
		verb: "Reopening",
		past: "Reopened",
		applies: (thread, can) =>
			thread.archived && (can.manage || (can.moderate && !thread.locked)),
		request: (thread) => [
			"patch",
			`/channels/${thread.id}`,
			thread.locked ? { archived: false, locked: false } : { archived: false },
		],
	},
];

// stores: ChannelStore, ActiveJoinedThreadsStore, ReadStateStore,
// JoinedThreadsStore, PermissionStore, UserStore.
// getRest(): Discord's REST client ({ put, del, patch } taking { url, body }).
// dispatcher: Discord's Flux dispatcher.
export function createThreadData({ stores, getRest, dispatcher }) {
	const {
		ChannelStore,
		ActiveJoinedThreadsStore,
		ReadStateStore,
		JoinedThreadsStore,
		PermissionStore,
		UserStore,
	} = stores;
	const readAt = new Map();
	const wasUnread = new Map();

	// The list belongs to a text or announcement channel. A thread open in
	// full view shows the thread itself; its channel's list stays open for
	// when you go back.
	function browsableChannel(channel) {
		if (!channel?.guild_id || !BROWSABLE_PARENT_TYPES.includes(channel.type))
			return null;
		return {
			guildId: channel.guild_id,
			parentId: channel.id,
			name: channel.name || "Channel",
		};
	}

	function getThreads({ guildId, parentId }) {
		const byId = new Map();
		const joinedIds = new Set();
		for (const thread of storeThreads(
			ChannelStore,
			"getAllThreadsForParent",
			parentId,
		))
			if (thread?.id) byId.set(thread.id, thread);
		for (const method of [
			"getActiveJoinedThreadsForParent",
			"getActiveUnjoinedThreadsForParent",
		]) {
			const entries = storeThreads(
				ActiveJoinedThreadsStore,
				method,
				guildId,
				parentId,
			);
			for (const value of Object.values(entries)) {
				const thread = value?.channel ?? value;
				if (!thread?.id) continue;
				byId.set(thread.id, thread);
				if (method === "getActiveJoinedThreadsForParent")
					joinedIds.add(thread.id);
			}
		}
		return [...byId.values()]
			.map((thread) => {
				const unread = Boolean(ReadStateStore?.hasUnread?.(thread.id));
				const mentions = ReadStateStore?.getMentionCount?.(thread.id) ?? 0;
				const needsAttention = unread || mentions > 0;
				if (wasUnread.get(thread.id) && !needsAttention)
					readAt.set(thread.id, Date.now());
				wasUnread.set(thread.id, needsAttention);
				const read = needsAttention ? 0 : (readAt.get(thread.id) ?? 0);
				const lastMessageId =
					thread.lastMessageId || thread.last_message_id || thread.id;
				return {
					id: thread.id,
					record: thread,
					name: thread.name || "Untitled thread",
					archived: Boolean(
						thread.threadMetadata?.archived ?? thread.thread_metadata?.archived,
					),
					locked: Boolean(
						thread.threadMetadata?.locked ?? thread.thread_metadata?.locked,
					),
					joined:
						typeof JoinedThreadsStore?.hasJoined === "function"
							? Boolean(JoinedThreadsStore.hasJoined(thread.id))
							: joinedIds.has(thread.id),
					ownerId: thread.ownerId ?? thread.owner_id,
					unread,
					unreadCount: ReadStateStore?.getUnreadCount?.(thread.id) ?? 0,
					unreadEstimated: Boolean(ReadStateStore?.isEstimated?.(thread.id)),
					mentions,
					lastMessageId,
					readAt: read,
					activity: Math.max(snowflakeTime(lastMessageId), read),
				};
			})
			.sort(
				(a, b) =>
					attentionRank(a) - attentionRank(b) || b.activity - a.activity,
			);
	}

	function permissions(thread) {
		let manage = true;
		try {
			if (typeof PermissionStore?.can === "function")
				manage = Boolean(PermissionStore.can(MANAGE_THREADS, thread.record));
		} catch {}
		const owner =
			thread.ownerId && thread.ownerId === UserStore?.getCurrentUser?.()?.id;
		return { manage, moderate: manage || owner };
	}

	function actionTargets(action, threads) {
		return threads.filter((thread) =>
			action.applies(thread, permissions(thread)),
		);
	}

	function markRead(threads) {
		for (let i = 0; i < threads.length; i += 100)
			dispatcher.dispatch({
				type: "BULK_ACK",
				context: "APP",
				channels: threads.slice(i, i + 100).map((thread) => ({
					channelId: thread.id,
					messageId:
						ReadStateStore?.lastMessageId?.(thread.id) ??
						thread.record.lastMessageId ??
						thread.lastMessageId,
					readStateType: 0,
				})),
			});
	}

	// Retries rate-limited requests after Discord's retry_after.
	async function request(method, url, body) {
		const client = getRest();
		if (!client) throw new Error("Discord's request client is unavailable.");
		for (let attempt = 0; ; attempt++) {
			try {
				return await client[method]({ url, body });
			} catch (error) {
				if (error?.status !== 429 || attempt >= 3) throw error;
				await sleep(Math.max(1, error.body?.retry_after ?? 1) * 1000);
			}
		}
	}

	return {
		browsableChannel,
		getThreads,
		actionTargets,
		markRead,
		request,
		BULK_DELAY,
	};
}
