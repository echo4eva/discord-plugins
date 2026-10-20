// BetterVencord (Vesktop/Vencord) has a BdApi.UI.showConfirmationModal that
// crashes Discord, because the modal components it looks for are gone. Use
// Vencord's own alert dialog there instead.
export function showConfirmationModal(title, content, options = {}) {
	const alerts =
		window.BdCompatLayer && globalThis.Vencord?.Webpack?.Common?.Alerts;
	if (!alerts?.show)
		return BdApi.UI.showConfirmationModal(title, content, options);
	alerts.show({
		title,
		body: content,
		confirmText: options.confirmText ?? "Okay",
		cancelText:
			options.cancelText === null
				? undefined
				: (options.cancelText ?? "Cancel"),
		onConfirm: options.onConfirm,
		onCancel: options.onCancel,
	});
}
