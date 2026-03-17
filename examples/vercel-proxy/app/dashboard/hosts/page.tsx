"use client";

import { useState, useEffect } from "react";

function StatusBadge({ status }: { status: string }) {
	const styles: Record<string, string> = {
		active: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30",
		pending: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
		pending_enrollment: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30",
		revoked: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
		rejected: "bg-red-500/15 text-red-400 ring-1 ring-red-500/30",
	};
	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status] ?? "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/25"}`}
		>
			{status.replace("_", " ")}
		</span>
	);
}

function Spinner() {
	return (
		<svg
			className="animate-spin h-4 w-4 text-muted"
			viewBox="0 0 24 24"
			fill="none"
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
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
			/>
		</svg>
	);
}

interface HostData {
	id: string;
	name: string | null;
	default_capabilities: string[];
	status: string;
	activated_at: string | null;
	expires_at: string | null;
	last_used_at: string | null;
	created_at: string;
	updated_at: string;
}

function timeAgo(date: string | null) {
	if (!date) return "Never";
	const now = Date.now();
	const then = new Date(date).getTime();
	const diff = now - then;
	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
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
	const [availableCaps, setAvailableCaps] = useState<{ name: string; description: string }[]>([]);
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
		} catch { /* ignore */ }
		setLoadingCaps(false);
	};

	const saveCaps = async (hostId: string) => {
		setSavingCaps(true);
		try {
			const res = await fetch("/api/auth/host/update", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ host_id: hostId, default_capabilities: [...selectedCaps] }),
			});
			if (res.ok) {
				setHosts((prev) =>
					prev.map((h) => h.id === hostId ? { ...h, default_capabilities: [...selectedCaps] } : h),
				);
			}
		} catch { /* ignore */ }
		setSavingCaps(false);
		setEditingHost(null);
	};

	useEffect(() => {
		setLoading(true);
		const params = filter !== "all" ? `?status=${filter}` : "";
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
					prev.map((h) =>
						h.id === hostId ? { ...h, status: "revoked" } : h,
					),
				);
			}
		} catch {
			/* ignore */
		} finally {
			setRevoking(null);
		}
	};

	const filters = [
		"all",
		"active",
		"pending",
		"pending_enrollment",
		"revoked",
	];

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-8">
			<div className="flex flex-col gap-6">
				<div className="flex items-start justify-between">
					<div>
						<h1 className="text-lg font-semibold text-white">
							Hosts
						</h1>
						<p className="mt-1 text-sm text-muted">
							Agent host environments and their configurations.
						</p>
					</div>
					<div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
						{filters.map((f) => (
							<button
								key={f}
								onClick={() => setFilter(f)}
								className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
									filter === f
										? "bg-white text-black"
										: "text-muted hover:text-foreground"
								}`}
							>
								{f === "pending_enrollment"
									? "enrolling"
									: f}
							</button>
						))}
					</div>
				</div>

				{loading ? (
					<div className="flex items-center justify-center py-20">
						<Spinner />
					</div>
				) : hosts.length === 0 ? (
					<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
						<svg
							className="h-8 w-8 text-muted/30 mb-3"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z"
							/>
						</svg>
						<p className="text-sm text-muted">No hosts found</p>
						<p className="mt-1 text-xs text-muted/60">
							Hosts are created when agents register from new
							environments.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{hosts.map((host) => {
							const isExpanded = expanded === host.id;

							return (
								<div
									key={host.id}
									className="rounded-lg border border-border bg-surface"
								>
									<button
										onClick={() =>
											setExpanded(
												isExpanded ? null : host.id,
											)
										}
										className="flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left"
									>
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<span className="text-sm font-medium text-white truncate">
													{host.name ??
														host.id.slice(0, 12) +
															"…"}
												</span>
												<StatusBadge
													status={host.status}
												/>
											</div>
											<p className="mt-0.5 text-xs text-muted">
												{host.default_capabilities
													.length > 0
													? `${host.default_capabilities.length} default capabilities`
													: "No default capabilities"}
												{" · "}
												{timeAgo(host.created_at)}
											</p>
										</div>
										<svg
											className={`h-4 w-4 shrink-0 text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M19 9l-7 7-7-7"
											/>
										</svg>
									</button>

									{isExpanded && (
										<div className="border-t border-border px-4 py-4">
											<div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
												<div>
													<p className="text-[10px] uppercase tracking-widest text-muted">
														Host ID
													</p>
													<code className="text-xs font-mono text-foreground break-all">
														{host.id}
													</code>
												</div>
												<div>
													<p className="text-[10px] uppercase tracking-widest text-muted">
														Name
													</p>
													<p className="text-xs text-foreground">
														{host.name ?? "—"}
													</p>
												</div>
												<div>
													<p className="text-[10px] uppercase tracking-widest text-muted">
														Last Used
													</p>
													<p className="text-xs text-foreground">
														{timeAgo(
															host.last_used_at,
														)}
													</p>
												</div>
												<div>
													<p className="text-[10px] uppercase tracking-widest text-muted">
														Activated
													</p>
													<p className="text-xs text-foreground">
														{host.activated_at
															? new Date(
																	host.activated_at,
																).toLocaleString()
															: "—"}
													</p>
												</div>
												<div>
													<p className="text-[10px] uppercase tracking-widest text-muted">
														Expires
													</p>
													<p className="text-xs text-foreground">
														{host.expires_at
															? new Date(
																	host.expires_at,
																).toLocaleString()
															: "Never"}
													</p>
												</div>
												<div>
													<p className="text-[10px] uppercase tracking-widest text-muted">
														Updated
													</p>
													<p className="text-xs text-foreground">
														{timeAgo(
															host.updated_at,
														)}
													</p>
												</div>
											</div>

											<div className="mb-4">
												<div className="flex items-center justify-between mb-2">
													<p className="text-[10px] uppercase tracking-widest text-muted">
														Default Capabilities
													</p>
													{editingHost === host.id ? (
														<div className="flex gap-1.5">
															<button
																onClick={() => saveCaps(host.id)}
																disabled={savingCaps}
																className="cursor-pointer rounded-lg bg-white px-3 py-1 text-[11px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
															>
																{savingCaps ? "Saving..." : "Save"}
															</button>
															<button
																onClick={() => setEditingHost(null)}
																className="cursor-pointer rounded-lg border border-border px-3 py-1 text-[11px] font-medium text-muted transition-colors hover:text-foreground"
															>
																Cancel
															</button>
														</div>
													) : host.status === "active" ? (
														<button
															onClick={() => startEditingCaps(host)}
															className="cursor-pointer rounded-lg border border-border px-3 py-1 text-[11px] font-medium text-muted transition-colors hover:text-foreground hover:bg-white/4"
														>
															Edit
														</button>
													) : null}
												</div>
												{editingHost === host.id ? (
													loadingCaps ? (
														<div className="flex justify-center py-6"><Spinner /></div>
													) : (
														<div className="space-y-1 max-h-60 overflow-y-auto">
															{availableCaps.map((cap) => {
																const isSelected = selectedCaps.has(cap.name);
																return (
																	<label
																		key={cap.name}
																		className={`flex items-center gap-3 rounded px-3 py-2 cursor-pointer transition-colors ${
																			isSelected ? "bg-emerald-500/10 ring-1 ring-emerald-500/20" : "bg-background hover:bg-white/4"
																		}`}
																	>
																		<input
																			type="checkbox"
																			checked={isSelected}
																			onChange={() => {
																				setSelectedCaps((prev) => {
																					const next = new Set(prev);
																					if (next.has(cap.name)) next.delete(cap.name);
																					else next.add(cap.name);
																					return next;
																				});
																			}}
																			className="h-3.5 w-3.5 rounded accent-emerald-500"
																		/>
																		<div className="flex-1 min-w-0">
																			<code className="text-xs font-mono text-foreground truncate block">{cap.name}</code>
																			{cap.description && (
																				<p className="text-[11px] text-muted/50 truncate">{cap.description}</p>
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
															<div key={cap} className="rounded bg-background px-3 py-2">
																<code className="text-xs font-mono text-foreground">{cap}</code>
															</div>
														))}
													</div>
												) : (
													<p className="text-xs text-muted/50 py-2">No default capabilities set.</p>
												)}
											</div>

											{host.status === "active" && (
												<button
													onClick={() =>
														handleRevoke(host.id)
													}
													disabled={
														revoking === host.id
													}
													className="cursor-pointer rounded-md border border-red-500/20 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
												>
													{revoking === host.id
														? "Revoking…"
														: "Revoke Host"}
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
