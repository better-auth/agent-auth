"use client";

import { useEffect, useState } from "react";

function StatusBadge({ status }: { status: string }) {
	const styles: Record<string, string> = {
		active: "bg-gmail-green/10 text-gmail-green ring-1 ring-gmail-green/20",
		pending: "bg-gmail-yellow/15 text-gmail-yellow ring-1 ring-gmail-yellow/30",
		pending_enrollment:
			"bg-gmail-yellow/15 text-gmail-yellow ring-1 ring-gmail-yellow/30",
		revoked: "bg-gmail-red/10 text-gmail-red ring-1 ring-gmail-red/20",
		rejected: "bg-gmail-red/10 text-gmail-red ring-1 ring-gmail-red/20",
	};
	return (
		<span
			className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium text-[11px] ${styles[status] ?? "bg-gray-100 text-gray-500 ring-1 ring-gray-200"}`}
		>
			{status.replace("_", " ")}
		</span>
	);
}

function Spinner() {
	return (
		<svg
			className="h-5 w-5 animate-spin text-muted"
			fill="none"
			viewBox="0 0 24 24"
		>
			<circle
				className="opacity-25"
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="4"
			/>
			<path
				className="opacity-75"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
				fill="currentColor"
			/>
		</svg>
	);
}

interface HostData {
	activated_at: string | null;
	created_at: string;
	default_capabilities: string[];
	expires_at: string | null;
	id: string;
	last_used_at: string | null;
	name: string | null;
	status: string;
	updated_at: string;
}

function timeAgo(date: string | null) {
	if (!date) {
		return "Never";
	}
	const now = Date.now();
	const then = new Date(date).getTime();
	const diff = now - then;
	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) {
		return "just now";
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export default function HostsPage() {
	const [hosts, setHosts] = useState<HostData[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState("all");
	const [expanded, setExpanded] = useState<string | null>(null);
	const [revoking, setRevoking] = useState<string | null>(null);
	const [editingHost, setEditingHost] = useState<string | null>(null);
	const [availableCaps, setAvailableCaps] = useState<
		{ name: string; description: string }[]
	>([]);
	const [selectedCaps, setSelectedCaps] = useState<Set<string>>(new Set());
	const [savingCaps, setSavingCaps] = useState(false);
	const [loadingCaps, setLoadingCaps] = useState(false);

	const startEditingCaps = async (host: HostData) => {
		setEditingHost(host.id);
		setLoadingCaps(true);
		setSelectedCaps(new Set(host.default_capabilities));
		try {
			const res = await fetch("/api/auth/capability/list?limit=500");
			if (res.ok) {
				const data = await res.json();
				setAvailableCaps(data.capabilities ?? []);
			}
		} catch {
			/* ignore */
		}
		setLoadingCaps(false);
	};

	const saveCaps = async (hostId: string) => {
		setSavingCaps(true);
		try {
			const res = await fetch("/api/auth/host/update", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					host_id: hostId,
					default_capabilities: [...selectedCaps],
				}),
			});
			if (res.ok) {
				setHosts((prev) =>
					prev.map((h) =>
						h.id === hostId
							? { ...h, default_capabilities: [...selectedCaps] }
							: h
					)
				);
			}
		} catch {
			/* ignore */
		}
		setSavingCaps(false);
		setEditingHost(null);
	};

	useEffect(() => {
		setLoading(true);
		const params = filter === "all" ? "" : `?status=${filter}`;
		fetch(`/api/auth/host/list${params}`)
			.then((r) => (r.ok ? r.json() : { hosts: [] }))
			.then((data) => setHosts(data.hosts ?? []))
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [filter]);

	const handleRevoke = async (hostId: string) => {
		setRevoking(hostId);
		try {
			const res = await fetch("/api/auth/host/revoke", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ host_id: hostId }),
			});
			if (res.ok) {
				setHosts((prev) =>
					prev.map((h) => (h.id === hostId ? { ...h, status: "revoked" } : h))
				);
			}
		} catch {
			/* ignore */
		} finally {
			setRevoking(null);
		}
	};

	const filters = ["all", "active", "pending", "pending_enrollment", "revoked"];

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-8">
			<div className="flex flex-col gap-6">
				<div className="flex items-start justify-between">
					<div>
						<h1 className="font-normal text-[22px] text-foreground">Hosts</h1>
						<p className="mt-1 text-muted text-sm">
							Agent host environments and their configurations.
						</p>
					</div>
					<div className="flex gap-0.5 rounded-full border border-border bg-white p-0.5 shadow-sm">
						{filters.map((f) => (
							<button
								className={`cursor-pointer rounded-full px-3 py-1.5 font-medium text-xs transition-colors ${
									filter === f
										? "bg-accent text-white shadow-sm"
										: "text-muted hover:bg-surface hover:text-foreground"
								}`}
								key={f}
								onClick={() => setFilter(f)}
							>
								{f === "pending_enrollment" ? "enrolling" : f}
							</button>
						))}
					</div>
				</div>

				{loading ? (
					<div className="flex items-center justify-center py-20">
						<Spinner />
					</div>
				) : hosts.length === 0 ? (
					<div className="flex flex-col items-center justify-center rounded-2xl border border-border border-dashed py-16">
						<div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface">
							<svg
								className="h-6 w-6 text-muted"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.5}
								/>
							</svg>
						</div>
						<p className="font-medium text-foreground text-sm">
							No hosts found
						</p>
						<p className="mt-1 text-muted text-xs">
							Hosts are created when agents register from new environments.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-2.5">
						{hosts.map((host) => {
							const isExpanded = expanded === host.id;
							return (
								<div
									className="rounded-2xl border border-border bg-white shadow-sm"
									key={host.id}
								>
									<button
										className="flex w-full cursor-pointer items-center gap-4 px-5 py-4 text-left"
										onClick={() => setExpanded(isExpanded ? null : host.id)}
									>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span className="truncate font-medium text-foreground text-sm">
													{host.name ?? `${host.id.slice(0, 12)}…`}
												</span>
												<StatusBadge status={host.status} />
											</div>
											<p className="mt-0.5 text-muted text-xs">
												{host.default_capabilities.length > 0
													? `${host.default_capabilities.length} default capabilities`
													: "No default capabilities"}
												{" · "}
												{timeAgo(host.created_at)}
											</p>
										</div>
										<svg
											className={`h-4 w-4 shrink-0 text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												d="M19 9l-7 7-7-7"
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
											/>
										</svg>
									</button>

									{isExpanded && (
										<div className="border-border border-t px-5 py-4">
											<div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3">
												<div>
													<p className="text-[10px] text-muted uppercase tracking-widest">
														Host ID
													</p>
													<code className="break-all font-mono text-foreground text-xs">
														{host.id}
													</code>
												</div>
												<div>
													<p className="text-[10px] text-muted uppercase tracking-widest">
														Name
													</p>
													<p className="text-foreground text-xs">
														{host.name ?? "—"}
													</p>
												</div>
												<div>
													<p className="text-[10px] text-muted uppercase tracking-widest">
														Last Used
													</p>
													<p className="text-foreground text-xs">
														{timeAgo(host.last_used_at)}
													</p>
												</div>
												<div>
													<p className="text-[10px] text-muted uppercase tracking-widest">
														Activated
													</p>
													<p className="text-foreground text-xs">
														{host.activated_at
															? new Date(host.activated_at).toLocaleString()
															: "—"}
													</p>
												</div>
												<div>
													<p className="text-[10px] text-muted uppercase tracking-widest">
														Expires
													</p>
													<p className="text-foreground text-xs">
														{host.expires_at
															? new Date(host.expires_at).toLocaleString()
															: "Never"}
													</p>
												</div>
												<div>
													<p className="text-[10px] text-muted uppercase tracking-widest">
														Updated
													</p>
													<p className="text-foreground text-xs">
														{timeAgo(host.updated_at)}
													</p>
												</div>
											</div>

											<div className="mb-4">
												<div className="mb-2 flex items-center justify-between">
													<p className="text-[10px] text-muted uppercase tracking-widest">
														Default Capabilities
													</p>
													{editingHost === host.id ? (
														<div className="flex gap-1.5">
															<button
																className="cursor-pointer rounded-full bg-accent px-3 py-1 font-medium text-[11px] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
																disabled={savingCaps}
																onClick={() => saveCaps(host.id)}
															>
																{savingCaps ? "Saving..." : "Save"}
															</button>
															<button
																className="cursor-pointer rounded-full border border-border px-3 py-1 font-medium text-[11px] text-muted transition-colors hover:text-foreground"
																onClick={() => setEditingHost(null)}
															>
																Cancel
															</button>
														</div>
													) : host.status === "active" ? (
														<button
															className="cursor-pointer rounded-full border border-border px-3 py-1 font-medium text-[11px] text-muted transition-colors hover:bg-surface hover:text-foreground"
															onClick={() => startEditingCaps(host)}
														>
															Edit
														</button>
													) : null}
												</div>
												{editingHost === host.id ? (
													loadingCaps ? (
														<div className="flex justify-center py-6">
															<Spinner />
														</div>
													) : (
														<div className="max-h-60 space-y-1 overflow-y-auto">
															{availableCaps.map((cap) => {
																const isSelected = selectedCaps.has(cap.name);
																return (
																	<label
																		className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
																			isSelected
																				? "bg-accent/10 ring-1 ring-accent/20"
																				: "bg-surface hover:bg-surface-hover"
																		}`}
																		key={cap.name}
																	>
																		<input
																			checked={isSelected}
																			className="h-3.5 w-3.5 rounded accent-gmail-blue"
																			onChange={() => {
																				setSelectedCaps((prev) => {
																					const next = new Set(prev);
																					if (next.has(cap.name)) {
																						next.delete(cap.name);
																					} else {
																						next.add(cap.name);
																					}
																					return next;
																				});
																			}}
																			type="checkbox"
																		/>
																		<div className="min-w-0 flex-1">
																			<code className="block truncate font-mono text-foreground text-xs">
																				{cap.name}
																			</code>
																			{cap.description && (
																				<p className="truncate text-[11px] text-muted">
																					{cap.description}
																				</p>
																			)}
																		</div>
																	</label>
																);
															})}
														</div>
													)
												) : host.default_capabilities.length > 0 ? (
													<div className="space-y-1">
														{host.default_capabilities.map((cap) => (
															<div
																className="rounded-xl bg-surface px-3 py-2"
																key={cap}
															>
																<code className="font-mono text-foreground text-xs">
																	{cap}
																</code>
															</div>
														))}
													</div>
												) : (
													<p className="py-2 text-muted text-xs">
														No default capabilities set.
													</p>
												)}
											</div>

											{host.status === "active" && (
												<button
													className="cursor-pointer rounded-full border border-gmail-red/20 px-4 py-1.5 font-medium text-gmail-red text-xs transition-colors hover:bg-gmail-red/5 disabled:opacity-50"
													disabled={revoking === host.id}
													onClick={() => handleRevoke(host.id)}
												>
													{revoking === host.id ? "Revoking…" : "Revoke Host"}
												</button>
											)}
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
