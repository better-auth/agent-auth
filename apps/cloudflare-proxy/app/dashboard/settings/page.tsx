"use client";

import { useEffect, useState } from "react";

type ApprovalMethod = "device_authorization" | "ciba";

interface Settings {
	freshSessionEnabled: boolean;
	freshSessionWindow: number;
	preferredApprovalMethod: ApprovalMethod;
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
					<h1 className="font-semibold text-lg text-white">Settings</h1>
					<p className="mt-1 text-muted text-sm">
						Configure security and approval settings for Agent Auth.
					</p>
				</div>

				<div className="flex flex-col gap-3">
					<h2 className="font-medium text-muted text-xs uppercase tracking-wider">
						Session Security
					</h2>
					<div className="rounded-lg border border-border bg-surface">
						<div className="flex items-center justify-between border-border border-b px-4 py-4">
							<div className="flex-1 pr-4">
								<p className="font-medium text-sm text-white">
									Require fresh session for approvals
								</p>
								<p className="mt-1 text-muted text-xs">
									When enabled, users must have signed in recently to approve
									agent capability requests. Helps prevent stale session
									hijacking.
								</p>
							</div>
							<button
								aria-checked={settings.freshSessionEnabled}
								className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
									settings.freshSessionEnabled ? "bg-white" : "bg-zinc-700"
								}`}
								onClick={() =>
									save({
										freshSessionEnabled: !settings.freshSessionEnabled,
									})
								}
								role="switch"
								type="button"
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
									<p className="font-medium text-sm text-white">
										Session window
									</p>
									<p className="mt-1 text-muted text-xs">
										Maximum age (in seconds) of the session at time of approval.
									</p>
								</div>
								<div className="flex items-center gap-2">
									<input
										className="w-24 rounded-md border border-border bg-background px-3 py-1.5 text-right text-sm text-white outline-none focus:border-white/30"
										max={86_400}
										min={30}
										onBlur={() =>
											save({
												freshSessionWindow: settings.freshSessionWindow,
											})
										}
										onChange={(e) =>
											setSettings((s) => ({
												...s!,
												freshSessionWindow:
													Number.parseInt(e.target.value, 10) || 300,
											}))
										}
										type="number"
										value={settings.freshSessionWindow}
									/>
									<span className="text-muted text-xs">sec</span>
								</div>
							</div>
						)}
					</div>
				</div>

				<div className="flex flex-col gap-3">
					<h2 className="font-medium text-muted text-xs uppercase tracking-wider">
						Approval Method
					</h2>
					<div className="rounded-lg border border-border bg-surface">
						<div className="px-4 py-4">
							<p className="font-medium text-sm text-white">
								Preferred approval method
							</p>
							<p className="mt-1 text-muted text-xs">
								Choose how agents request user approval for capabilities. The
								agent can still request a specific method, but this sets the
								server default.
							</p>
							<div className="mt-3 flex gap-3">
								{(
									[
										{
											value: "device_authorization",
											label: "Device Authorization",
											desc: "User enters a code on a verification page",
										},
										{
											value: "ciba",
											label: "CIBA (Backchannel)",
											desc: "Server pushes approval request to the user",
										},
									] as const
								).map((opt) => (
									<button
										className={`flex flex-1 flex-col rounded-lg border px-4 py-3 text-left transition-colors ${
											settings.preferredApprovalMethod === opt.value
												? "border-white bg-white/5"
												: "border-border hover:border-white/20"
										}`}
										key={opt.value}
										onClick={() =>
											save({
												preferredApprovalMethod: opt.value,
											})
										}
										type="button"
									>
										<span
											className={`font-medium text-sm ${
												settings.preferredApprovalMethod === opt.value
													? "text-white"
													: "text-zinc-400"
											}`}
										>
											{opt.label}
										</span>
										<span className="mt-0.5 text-muted text-xs">
											{opt.desc}
										</span>
									</button>
								))}
							</div>
						</div>
					</div>
				</div>

				{(saving || saved) && (
					<p className="text-muted text-xs">
						{saving ? "Saving…" : "Settings saved."}
					</p>
				)}
			</div>
		</div>
	);
}
