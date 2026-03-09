"use client";

import { useEffect, useState } from "react";

interface Settings {
	freshSessionEnabled: boolean;
	freshSessionWindow: number;
}

export default function SettingsPage() {
	const [settings, setSettings] = useState<Settings | null>(null);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		fetch("/api/settings")
			.then((r) => r.json())
			.then(setSettings)
			.catch(() => {});
	}, []);

	const save = async (patch: Partial<Settings>) => {
		const next = { ...settings!, ...patch };
		setSettings(next);
		setSaving(true);
		setSaved(false);
		try {
			await fetch("/api/settings", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(next),
			});
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
		} finally {
			setSaving(false);
		}
	};

	if (!settings) {
		return (
			<div className="mx-auto w-full max-w-3xl px-6 py-8">
				<div className="h-6 w-32 animate-pulse rounded bg-surface" />
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-8">
			<div className="flex flex-col gap-8">
				<div>
					<h1 className="text-lg font-semibold text-white">
						Settings
					</h1>
					<p className="mt-1 text-sm text-muted">
						Configure security and approval settings for Agent Auth.
					</p>
				</div>

				<div className="flex flex-col gap-3">
					<h2 className="text-xs font-medium uppercase tracking-wider text-muted">
						Session Security
					</h2>
					<div className="rounded-lg border border-border bg-surface">
						<div className="flex items-center justify-between border-b border-border px-4 py-4">
							<div className="flex-1 pr-4">
								<p className="text-sm font-medium text-white">
									Require fresh session for approvals
								</p>
								<p className="mt-1 text-xs text-muted">
									When enabled, users must have signed in
									recently to approve agent capability
									requests. Helps prevent stale session
									hijacking.
								</p>
							</div>
							<button
								type="button"
								role="switch"
								aria-checked={settings.freshSessionEnabled}
								onClick={() =>
									save({
										freshSessionEnabled:
											!settings.freshSessionEnabled,
									})
								}
								className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
									settings.freshSessionEnabled
										? "bg-white"
										: "bg-zinc-700"
								}`}
							>
								<span
									className={`pointer-events-none inline-block h-5 w-5 rounded-full shadow-lg transition-transform ${
										settings.freshSessionEnabled
											? "translate-x-5 bg-black"
											: "translate-x-0 bg-zinc-400"
									}`}
								/>
							</button>
						</div>

						{settings.freshSessionEnabled && (
							<div className="flex items-center justify-between px-4 py-4">
								<div className="flex-1 pr-4">
									<p className="text-sm font-medium text-white">
										Session window
									</p>
									<p className="mt-1 text-xs text-muted">
										Maximum age (in seconds) of the session
										at time of approval.
									</p>
								</div>
								<div className="flex items-center gap-2">
									<input
										type="number"
										min={30}
										max={86400}
										value={settings.freshSessionWindow}
										onChange={(e) =>
											setSettings((s) => ({
												...s!,
												freshSessionWindow:
													parseInt(
														e.target.value,
														10,
													) || 300,
											}))
										}
										onBlur={() =>
											save({
												freshSessionWindow:
													settings.freshSessionWindow,
											})
										}
										className="w-24 rounded-md border border-border bg-background px-3 py-1.5 text-right text-sm text-white outline-none focus:border-white/30"
									/>
									<span className="text-xs text-muted">
										sec
									</span>
								</div>
							</div>
						)}
					</div>
				</div>

				{(saving || saved) && (
					<p className="text-xs text-muted">
						{saving ? "Saving…" : "Settings saved."}
					</p>
				)}
			</div>
		</div>
	);
}
