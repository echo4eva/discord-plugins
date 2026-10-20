// Render the settings model owned by the shared Tabs implementation.
import { FormSwitch } from "@components/FormSwitch";
import { React } from "@webpack/common";

function Setting({ setting }: any) {
	const [value, setValue] = React.useState(setting.value);
	const [recording, setRecording] = React.useState(false);
	const change = (next: any) => {
		setValue(next);
		setting.onChange?.(next);
	};
	if (setting.type === "category")
		return (
			<section style={{ marginBlock: 16 }}>
				<h3 style={{ color: "var(--text-normal)", marginBottom: 12 }}>
					{setting.name}
				</h3>
				{setting.settings.map((child: any) => (
					<Setting key={child.id} setting={child} />
				))}
			</section>
		);
	if (setting.type === "switch")
		return (
			<FormSwitch
				title={setting.name}
				description={setting.note}
				value={value}
				onChange={change}
			/>
		);
	return (
		<label
			style={{ display: "block", marginBlock: 14, color: "var(--text-normal)" }}
		>
			<span style={{ display: "block", marginBottom: 6 }}>{setting.name}</span>
			{setting.note && (
				<span
					style={{
						display: "block",
						color: "var(--text-muted)",
						marginBottom: 8,
					}}
				>
					{setting.note}
				</span>
			)}
			{setting.type === "slider" && (
				<>
					<input
						aria-label={setting.name}
						type="range"
						min={setting.min}
						max={setting.max}
						value={value}
						onChange={(event) => change(Number(event.target.value))}
					/>
					<output>
						{value}
						{setting.units}
					</output>
				</>
			)}
			{setting.type === "dropdown" && (
				<select
					aria-label={setting.name}
					value={value}
					onChange={(event) => change(event.target.value)}
				>
					{setting.options.map((option: any) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			)}
			{setting.type === "keybind" && (
				<>
					<button
						type="button"
						data-chungus-shortcut-recorder
						onClick={() => setRecording(!recording)}
						onBlur={() => setRecording(false)}
						onKeyDown={(event) => {
							if (!recording) return;
							event.preventDefault();
							event.stopPropagation();
							if (event.key === "Escape") {
								setRecording(false);
								return;
							}
							if (["Control", "Meta", "Shift", "Alt"].includes(event.key))
								return;
							change([
								...(event.ctrlKey ? ["Control"] : []),
								...(event.metaKey ? ["Meta"] : []),
								...(event.altKey ? ["Alt"] : []),
								...(event.shiftKey ? ["Shift"] : []),
								event.key,
							]);
							setRecording(false);
						}}
					>
						{recording ? "Press shortcut…" : value?.join(" + ") || "Off"}
					</button>
					<button
						type="button"
						onClick={() => {
							change([]);
							setRecording(false);
						}}
					>
						Clear
					</button>
				</>
			)}
		</label>
	);
}

export function SettingsPanel({ settings }: any) {
	return (
		<div>
			{settings.map((setting: any) => (
				<Setting key={setting.id} setting={setting} />
			))}
		</div>
	);
}
