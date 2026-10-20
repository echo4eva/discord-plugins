// ThreadNavigator's thread list panel, shared by the BetterDiscord and Vencord
// versions. It is made by a function so each version can pass in Discord's
// React and the other pieces it found its own way. The BetterDiscord build
// turns JSX into React.createElement, so `React` must be in scope here.

import {
	lastFilters,
	setBrowserOpen,
	subscribe,
	isBrowserOpen,
	tabApi,
} from "./state.js";
import {
	BULK_ACTIONS,
	PAGE,
	filterThreads,
	plural,
	sameThreads,
	sleep,
} from "./threads.js";

const ITEM_FIELDS = [
	"name",
	"archived",
	"locked",
	"joined",
	"unread",
	"unreadCount",
	"unreadEstimated",
	"mentions",
];

const classes = (...names) => names.filter(Boolean).join(" ");

// platform: {
//   React, useStateFromStores, data (from createThreadData), threadStores(),
//   ChannelSectionStore, isMac, navigate(url), toast(text, kind),
//   confirm({ title, body, confirmText, onConfirm }),
//   openThreadMenu(event, { thread, guildId, onOpen }), openDiscovery(parentId),
// }
export function createThreadBrowser(platform) {
	const {
		React,
		useStateFromStores,
		data,
		threadStores,
		ChannelSectionStore,
		isMac,
	} = platform;
	const { useCallback, useMemo, useRef, useState } = React;

	function ThreadItemView({
		thread,
		href,
		open,
		selecting,
		checked,
		handlers,
	}) {
		const details = [
			thread.archived ? "Archived" : "Active",
			thread.locked && "Locked",
			thread.joined && "Joined",
			open && "Open on right",
		]
			.filter(Boolean)
			.join(" · ");
		const estimate = thread.unreadEstimated ? "+" : "";
		return (
			<div
				className={classes(
					"tn-item",
					(thread.unread || thread.mentions > 0) && "tn-item-unread",
					thread.mentions > 0 && "tn-item-mentioned",
					open && "tn-item-selected",
					checked && "tn-item-checked",
				)}
				onContextMenu={(event) => handlers.menu(thread, event)}
			>
				{selecting && (
					<input
						className="tn-check"
						type="checkbox"
						checked={checked}
						aria-label={`Select ${thread.name}`}
						onClick={(event) => handlers.check(thread, event)}
						onChange={() => {}}
					/>
				)}
				<a
					className="tn-item-link"
					href={href}
					title={thread.name}
					onClick={(event) => handlers.click(thread, event)}
				>
					<span className="tn-item-main">
						<span className="tn-item-name">{thread.name}</span>
						<span className="tn-item-meta">{details}</span>
					</span>
				</a>
				{(thread.mentions > 0 || thread.unread) && (
					<span className="tn-badges">
						{thread.mentions > 0 && (
							<span
								className="tn-badge tn-badge-mention"
								title={`${thread.mentions} mention${thread.mentions === 1 ? "" : "s"}`}
							>
								{thread.mentions}
							</span>
						)}
						{thread.unread && (
							<span
								className="tn-badge tn-badge-unread"
								title={
									thread.unreadCount
										? `${thread.unreadCount}${estimate} unread message${thread.unreadCount === 1 ? "" : "s"}`
										: "Unread messages"
								}
							>
								{thread.unreadCount ? thread.unreadCount + estimate : "New"}
							</span>
						)}
					</span>
				)}
				<button
					className="tn-tab-action"
					type="button"
					title="Open in a ChungusTabs tab"
					aria-label={`Open ${thread.name} in a new tab`}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						handlers.openInTab(thread);
					}}
				>
					↗
				</button>
			</div>
		);
	}

	// Rows only re-render when something they show changes, so a new message
	// in one thread doesn't redraw the whole list.
	const ThreadItem = React.memo(
		ThreadItemView,
		(a, b) =>
			a.open === b.open &&
			a.selecting === b.selecting &&
			a.checked === b.checked &&
			a.href === b.href &&
			ITEM_FIELDS.every((field) => a.thread[field] === b.thread[field]),
	);

	function ThreadBrowser({ channel }) {
		const { guildId, parentId } = channel;
		const threads = useStateFromStores(
			threadStores(),
			() => data.getThreads(channel),
			[guildId, parentId],
			sameThreads,
		);
		const sidebarThreadId = useStateFromStores(
			[ChannelSectionStore],
			() => ChannelSectionStore?.getCurrentSidebarChannelId?.(parentId) ?? null,
			[parentId],
		);

		const [filters, setFilterState] = useState(() => ({ ...lastFilters }));
		const [limit, setLimit] = useState(PAGE);
		const [selecting, setSelectingState] = useState(false);
		const [selected, setSelected] = useState(() => new Set());
		const [run, setRun] = useState(null);
		const runRef = useRef(null);
		const anchorId = useRef(null);

		const visible = useMemo(
			() => filterThreads(threads, filters),
			[threads, filters],
		);
		const selectedThreads = useMemo(
			() => threads.filter((thread) => selected.has(thread.id)),
			[threads, selected],
		);

		const setFilters = (change) => {
			Object.assign(lastFilters, change);
			setFilterState((current) => ({ ...current, ...change }));
			setLimit(PAGE);
		};

		const setSelecting = (value) => {
			setSelectingState(value);
			if (!value) {
				setSelected(new Set());
				anchorId.current = null;
			}
		};

		const openThread = (thread, inTab) => {
			if (inTab) {
				if (tabApi()?.openChannelInTab(guildId, thread.id, `#${thread.name}`))
					return;
				platform.toast("Enable ChungusTabs to open a new tab.", "info");
				return;
			}
			platform.navigate(
				`/channels/${guildId}/${parentId}/threads/${thread.id}`,
			);
		};

		const selectThread = (thread, range) => {
			setSelected((current) => {
				const next = new Set(current);
				const from = range
					? visible.findIndex((item) => item.id === anchorId.current)
					: -1;
				const to = visible.findIndex((item) => item.id === thread.id);
				if (from !== -1 && to !== -1) {
					const [start, end] = from < to ? [from, to] : [to, from];
					for (const item of visible.slice(start, end + 1)) next.add(item.id);
				} else if (next.has(thread.id)) next.delete(thread.id);
				else next.add(thread.id);
				return next;
			});
			anchorId.current = thread.id;
		};

		const toggleAllVisible = (select) => {
			setSelected((current) => {
				const next = new Set(current);
				const all = select ?? !visible.every((thread) => next.has(thread.id));
				for (const thread of visible)
					if (all) next.add(thread.id);
					else next.delete(thread.id);
				return next;
			});
		};

		// Rows get one stable set of handlers that always calls the latest
		// render's functions, so memoized rows don't re-render with the list.
		const latest = useRef(null);
		latest.current = { openThread, selectThread, selecting, setSelecting };
		const handlers = useMemo(
			() => ({
				click(thread, event) {
					if (event.button !== 0) return;
					event.preventDefault();
					const { selecting, setSelecting, selectThread, openThread } =
						latest.current;
					if (selecting || event.shiftKey) {
						if (!selecting) setSelecting(true);
						selectThread(thread, event.shiftKey);
						return;
					}
					openThread(thread, isMac ? event.metaKey : event.ctrlKey);
				},
				check(thread, event) {
					event.stopPropagation();
					latest.current.selectThread(thread, event.shiftKey);
				},
				menu(thread, event) {
					platform.openThreadMenu(event, {
						thread,
						guildId,
						onOpen: (inTab) => latest.current.openThread(thread, inTab),
					});
				},
				openInTab(thread) {
					latest.current.openThread(thread, true);
				},
			}),
			[guildId],
		);

		const executeBulk = async (action, targets) => {
			if (action.id === "read") {
				data.markRead(targets);
				platform.toast(`Marked ${plural(targets.length)} read.`, "success");
				return;
			}
			const state = {
				verb: action.verb,
				done: 0,
				total: targets.length,
				cancelled: false,
			};
			runRef.current = state;
			setRun({ ...state });
			const failures = [];
			for (const thread of targets) {
				if (state.cancelled) break;
				const [method, url, body] = action.request(thread);
				try {
					await data.request(method, url, body);
				} catch (error) {
					failures.push({ thread, error });
				}
				state.done++;
				setRun({ ...state });
				if (state.done < state.total && !state.cancelled)
					await sleep(data.BULK_DELAY);
			}
			runRef.current = null;
			setRun(null);
			const succeeded = state.done - failures.length;
			const parts = [`${action.past} ${plural(succeeded)}.`];
			if (failures.length) {
				const reason = failures[0].error?.body?.message;
				parts.push(
					`${plural(failures.length)} failed` + (reason ? `: ${reason}` : "."),
				);
				console.warn("[ThreadNavigator] Bulk action failures", failures);
			}
			if (state.cancelled && state.done < state.total)
				parts.push(`Stopped with ${state.total - state.done} left.`);
			platform.toast(
				parts.join(" "),
				failures.length ? (succeeded ? "warning" : "error") : "success",
			);
		};

		const runBulk = (action) => {
			if (runRef.current) return;
			const targets = data.actionTargets(action, selectedThreads);
			if (!targets.length) return;
			const start = () => void executeBulk(action, targets);
			if (!action.confirm) return start();
			const names = targets.slice(0, 5).map((thread) => `• ${thread.name}`);
			if (targets.length > 5) names.push(`…and ${targets.length - 5} more`);
			platform.confirm({
				title: `${action.label} ${plural(targets.length)}?`,
				body: (
					<div>
						{names.map((name, index) => (
							<div key={index}>{name}</div>
						))}
					</div>
				),
				confirmText: action.label,
				onConfirm: start,
			});
		};

		const onKeyDown = (event) => {
			// The list sits inside the chat element, whose own key handlers
			// shouldn't see keys typed here.
			event.stopPropagation();
			if (!selecting) return;
			const typing = event.target.matches?.(
				"input:not([type=checkbox]), select",
			);
			if (event.key === "Escape" && !typing) {
				event.preventDefault();
				setSelecting(false);
			} else if (
				event.key.toLowerCase() === "a" &&
				(event.metaKey || event.ctrlKey) &&
				!typing
			) {
				event.preventDefault();
				toggleAllVisible(true);
			}
		};

		const onScroll = useCallback(
			(event) => {
				const list = event.currentTarget;
				if (list.scrollTop + list.clientHeight >= list.scrollHeight - 240)
					setLimit((current) =>
						current < visible.length ? current + PAGE : current,
					);
			},
			[visible.length],
		);

		const shown = visible.filter((thread) => selected.has(thread.id)).length;
		const hidden = selectedThreads.length - shown;
		const allShownChecked = visible.length > 0 && shown === visible.length;

		return (
			<div
				className={classes("tn-browser", selecting && "tn-selecting")}
				onKeyDown={onKeyDown}
			>
				<div className="tn-browser-bar">
					<div className="tn-browser-title">Threads in #{channel.name}</div>
					<button
						className="tn-browser-close"
						type="button"
						title="Return to channel chat"
						aria-label="Return to channel chat"
						onClick={() => setBrowserOpen(parentId, false)}
					>
						×
					</button>
				</div>
				<div className="tn-browser-controls">
					<input
						className="tn-search"
						type="search"
						placeholder="Search threads"
						aria-label="Search threads in browser"
						value={filters.query}
						onChange={(event) =>
							setFilters({ query: event.currentTarget.value })
						}
					/>
					<select
						className="tn-filter"
						aria-label="Filter threads"
						value={filters.status}
						onChange={(event) =>
							setFilters({ status: event.currentTarget.value })
						}
					>
						<option value="active">Active</option>
						<option value="archived">Archived (loaded)</option>
						<option value="all">All loaded</option>
					</select>
					<select
						className="tn-filter"
						aria-label="Filter threads by membership"
						value={filters.membership}
						onChange={(event) =>
							setFilters({ membership: event.currentTarget.value })
						}
					>
						<option value="any">Joined or not</option>
						<option value="joined">Joined</option>
						<option value="unjoined">Not joined</option>
					</select>
					<button
						className="tn-discover tn-select-toggle"
						type="button"
						aria-pressed={selecting}
						title="Select threads for bulk actions (Shift-click a thread)"
						onClick={() => setSelecting(!selecting)}
					>
						Select
					</button>
					<button
						className="tn-discover"
						type="button"
						title="Open Discord's thread discovery"
						onClick={() => platform.openDiscovery(parentId)}
					>
						Discord discovery
					</button>
				</div>
				<div className="tn-browser-list" onScroll={onScroll}>
					{visible.length === 0 && (
						<div className="tn-empty">
							No matching threads loaded for this channel.
						</div>
					)}
					{visible.slice(0, limit).map((thread) => (
						<ThreadItem
							key={thread.id}
							thread={thread}
							href={`/channels/${guildId}/${parentId}/threads/${thread.id}`}
							open={thread.id === sidebarThreadId}
							selecting={selecting}
							checked={selecting && selected.has(thread.id)}
							handlers={handlers}
						/>
					))}
					{visible.length > limit && (
						<div className="tn-load">
							Showing {limit} of {visible.length}. Scroll for more.
						</div>
					)}
				</div>
				{selecting && (
					<div className="tn-bulk">
						<input
							className="tn-check"
							type="checkbox"
							checked={allShownChecked}
							ref={(element) => {
								if (element)
									element.indeterminate = shown > 0 && !allShownChecked;
							}}
							title={
								allShownChecked
									? "Deselect shown threads"
									: `Select all ${visible.length} shown threads`
							}
							disabled={Boolean(run) || !visible.length}
							onChange={() => toggleAllVisible()}
						/>
						<span className="tn-bulk-count">
							{run
								? `${run.verb} ${run.done} of ${run.total}…`
								: `${selectedThreads.length} selected` +
									(hidden ? ` · ${hidden} hidden by filters` : "")}
						</span>
						{run ? (
							<button
								type="button"
								onClick={() => {
									if (runRef.current) runRef.current.cancelled = true;
								}}
							>
								Stop
							</button>
						) : (
							<>
								{BULK_ACTIONS.map((action) => {
									const count = data.actionTargets(
										action,
										selectedThreads,
									).length;
									return (
										<button
											key={action.id}
											type="button"
											className={action.confirm ? "tn-danger" : undefined}
											disabled={!count}
											title={
												!count && selectedThreads.length
													? `None of the selected threads can be ${action.past.toLowerCase()}`
													: undefined
											}
											onClick={() => runBulk(action)}
										>
											{count ? `${action.label} (${count})` : action.label}
										</button>
									);
								})}
								<button
									type="button"
									disabled={!selectedThreads.length}
									onClick={() => setSelected(new Set())}
								>
									Clear
								</button>
							</>
						)}
						<button
							type="button"
							disabled={Boolean(run)}
							onClick={() => setSelecting(false)}
						>
							Done
						</button>
					</div>
				)}
			</div>
		);
	}

	// Whether a channel's list is open, re-rendering when that changes.
	function useBrowserOpen(parentId) {
		return React.useSyncExternalStore(subscribe, () => isBrowserOpen(parentId));
	}

	return { ThreadBrowser, useBrowserOpen };
}
