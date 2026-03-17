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
				<div className="h-6 w-32 animate-pulse rounded-xl bg-surface" />
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-8">
			<div className="flex flex-col gap-8">
				<div>
					<h1 className="text-[22px] font-normal text-foreground">Settings</h1>
					<p className="mt-1 text-sm text-muted">
						Configure security and approval settings for Agent Auth.
					</p>
				</div>

				<div className="flex flex-col gap-3">
					<h2 className="text-xs font-medium uppercase tracking-wider text-muted">
						Session Security
					</h2>
					<div className="rounded-2xl border border-border bg-white shadow-sm">
						<div className="flex items-center justify-between border-b border-border px-5 py-5">
							<div className="flex-1 pr-4">
								<p className="text-sm font-medium text-foreground">
									Require fresh session for approvals
								</p>
								<p className="mt-1 text-xs text-muted">
									When enabled, users must have signed in recently to approve agent capability requests.
								</p>
							</div>
							<button
								type="button"
								role="switch"
								aria-checked={settings.freshSessionEnabled}
								onClick={() => save({ freshSessionEnabled: !settings.freshSessionEnabled })}
								className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
									settings.freshSessionEnabled ? "bg-accent" : "bg-gray-300"
								}`}
							>
								<span
									className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
										settings.freshSessionEnabled ? "translate-x-5" : "translate-x-0"
									}`}
								/>
							</button>
						</div>

						{settings.freshSessionEnabled && (
							<div className="flex items-center justify-between px-5 py-5">
								<div className="flex-1 pr-4">
									<p className="text-sm font-medium text-foreground">Session window</p>
									<p className="mt-1 text-xs text-muted">
										Maximum age (in seconds) of the session at time of approval.
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
												freshSessionWindow: parseInt(e.target.value, 10) || 300,
											}))
										}
										onBlur={() => save({ freshSessionWindow: settings.freshSessionWindow })}
										className="w-24 rounded-lg border border-border bg-white px-3 py-1.5 text-right text-sm text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
									/>
									<span className="text-xs text-muted">sec</span>
								</div>
							</div>
						)}
					</div>
				</div>

				<div className="flex flex-col gap-3">
					<h2 className="text-xs font-medium uppercase tracking-wider text-muted">
						Approval Method
					</h2>
					<div className="rounded-2xl border border-border bg-white shadow-sm">
						<div className="px-5 py-5">
							<p className="text-sm font-medium text-foreground">Preferred approval method</p>
							<p className="mt-1 text-xs text-muted">
								Choose how agents request user approval for capabilities.
							</p>
							<div className="mt-4 flex gap-3">
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
										key={opt.value}
										type="button"
										onClick={() => save({ preferredApprovalMethod: opt.value })}
										className={`flex flex-1 flex-col rounded-xl border-2 px-4 py-3.5 text-left transition-all ${
											settings.preferredApprovalMethod === opt.value
												? "border-accent bg-accent/5"
												: "border-border hover:border-muted"
										}`}
									>
										<span
											className={`text-sm font-medium ${
												settings.preferredApprovalMethod === opt.value
													? "text-accent"
													: "text-muted"
											}`}
										>
											{opt.label}
										</span>
										<span className="mt-0.5 text-xs text-muted">{opt.desc}</span>
									</button>
								))}
							</div>
						</div>
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
