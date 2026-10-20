// Turns BetterDiscord-style menu item lists into Discord menu elements, for the
// Vencord versions, which don't have BdApi.ContextMenu.buildMenuChildren. Items
// are { id, label, action, type, items, checked, danger }, where type is
// "submenu", "group", "separator", "toggle" or "radio". Discord's menu checks
// its children's component types, so items can't be wrapped in components.
export function createMenuBuilder(React, Menu) {
	function buildItem(item, index) {
		const { type, items, danger, render, ...props } = item;
		if (type === "separator") return <Menu.MenuSeparator key={index} />;
		if (type === "group")
			return <Menu.MenuGroup key={index}>{build(items)}</Menu.MenuGroup>;
		const id =
			props.id ??
			String(props.label ?? index).replace(/^[^a-z]+|[^\w-]+/gi, "-");
		if (danger) props.color = "danger";
		if (render)
			return (
				<Menu.MenuControlItem key={id} {...props} id={id} control={render} />
			);
		if (type === "toggle") {
			// Like BetterDiscord, keep the shown state in the menu so it updates
			// as soon as it is clicked. Menus are built while they render.
			const [checked, setChecked] = React.useState(() =>
				Boolean(
					typeof props.checked === "function" ? props.checked() : props.checked,
				),
			);
			const action = props.action;
			return (
				<Menu.MenuCheckboxItem
					key={id}
					{...props}
					id={id}
					checked={checked}
					action={(event) => {
						setChecked(!checked);
						action?.(event);
					}}
				/>
			);
		}
		if (type === "radio")
			return (
				<Menu.MenuRadioItem
					key={id}
					group={props.group ?? id}
					{...props}
					id={id}
				/>
			);
		return (
			<Menu.MenuItem key={id} {...props} id={id}>
				{type === "submenu" ? build(items ?? []) : undefined}
			</Menu.MenuItem>
		);
	}

	function build(items) {
		return items.filter(Boolean).map(buildItem);
	}

	return build;
}
