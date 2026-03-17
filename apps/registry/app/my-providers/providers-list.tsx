"use client";

import {
	ArrowUpRight,
	Globe,
	Loader2,
	Pencil,
	Trash2,
	X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface MyProvider {
	id: string;
	name: string;
	displayName: string;
	description: string;
	url: string;
	issuer: string;
	version: string;
	modes: string[];
	categories: string[];
	logoUrl: string | null;
	public: boolean;
	verified: boolean;
	status: string;
	createdAt: string;
	updatedAt: string;
}

interface EditState {
	displayName: string;
	description: string;
	categories: string;
}

export function MyProvidersList({
	initialProviders,
}: {
	initialProviders: MyProvider[];
}) {
	const router = useRouter();
	const [providers, setProviders] = useState(initialProviders);
	const [editing, setEditing] = useState<string | null>(null);
	const [editState, setEditState] = useState<EditState>({
		displayName: "",
		description: "",
		categories: "",
	});
	const [actionLoading, setActionLoading] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<string | null>(null);

	const togglePublic = async (p: MyProvider) => {
		setActionLoading(p.name);
		try {
			const res = await fetch(
				`/api/my-providers/${encodeURIComponent(p.name)}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ public: !p.public }),
				},
			);
			if (res.ok) {
				setProviders((prev) =>
					prev.map((pr) =>
						pr.name === p.name ? { ...pr, public: !pr.public } : pr,
					),
				);
				router.refresh();
			}
		} finally {
			setActionLoading(null);
		}
	};

	const startEdit = (p: MyProvider) => {
		setEditing(p.name);
		setEditState({
			displayName: p.displayName,
			description: p.description,
			categories: p.categories.join(", "),
		});
	};

	const saveEdit = async (p: MyProvider) => {
		setActionLoading(p.name);
		try {
			const res = await fetch(
				`/api/my-providers/${encodeURIComponent(p.name)}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						displayName: editState.displayName.trim(),
						description: editState.description.trim(),
						categories: editState.categories
							.split(",")
							.map((c) => c.trim())
							.filter(Boolean),
					}),
				},
			);
			if (res.ok) {
				setProviders((prev) =>
					prev.map((pr) =>
						pr.name === p.name
							? {
									...pr,
									displayName: editState.displayName.trim(),
									description: editState.description.trim(),
									categories: editState.categories
										.split(",")
										.map((c) => c.trim())
										.filter(Boolean),
								}
							: pr,
					),
				);
				setEditing(null);
				router.refresh();
			}
		} finally {
			setActionLoading(null);
		}
	};

	const deleteProvider = async (p: MyProvider) => {
		setActionLoading(p.name);
		try {
			const res = await fetch(
				`/api/my-providers/${encodeURIComponent(p.name)}`,
				{ method: "DELETE" },
			);
			if (res.ok) {
				setProviders((prev) => prev.filter((pr) => pr.name !== p.name));
				setDeleting(null);
				router.refresh();
			}
		} finally {
			setActionLoading(null);
		}
	};

	return (
		<div className="space-y-3">
			{providers.map((p) => (
				<div
					key={p.id}
					className="border border-foreground/8 bg-foreground/[0.015]"
				>
					{editing === p.name ? (
						<div className="p-5 space-y-4">
							<div className="flex items-center justify-between">
								<span className="text-[11px] font-mono uppercase tracking-wider text-foreground/40">
									Editing — {p.displayName}
								</span>
								<button
									onClick={() => setEditing(null)}
									className="text-foreground/40 hover:text-foreground/60 transition-colors"
								>
									<X className="h-4 w-4" />
								</button>
							</div>

							<div className="space-y-3">
								<div className="space-y-1.5">
									<label className="text-[10px] font-mono uppercase tracking-wider text-foreground/40">
										Display Name
									</label>
									<input
										type="text"
										value={editState.displayName}
										onChange={(e) =>
											setEditState((s) => ({
												...s,
												displayName: e.target.value,
											}))
										}
										className="w-full bg-foreground/[0.03] border border-foreground/10 text-foreground font-mono text-xs focus:outline-none focus:border-foreground/25 transition-all px-3 py-2"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-[10px] font-mono uppercase tracking-wider text-foreground/40">
										Description
									</label>
									<textarea
										value={editState.description}
										onChange={(e) =>
											setEditState((s) => ({
												...s,
												description: e.target.value,
											}))
										}
										rows={3}
										className="w-full bg-foreground/[0.03] border border-foreground/10 text-foreground font-mono text-xs focus:outline-none focus:border-foreground/25 transition-all px-3 py-2 resize-none"
									/>
								</div>
								<div className="space-y-1.5">
									<label className="text-[10px] font-mono uppercase tracking-wider text-foreground/40">
										Categories (comma-separated)
									</label>
									<input
										type="text"
										value={editState.categories}
										onChange={(e) =>
											setEditState((s) => ({
												...s,
												categories: e.target.value,
											}))
										}
										className="w-full bg-foreground/[0.03] border border-foreground/10 text-foreground font-mono text-xs focus:outline-none focus:border-foreground/25 transition-all px-3 py-2"
									/>
								</div>
							</div>

							<div className="flex gap-2">
								<button
									onClick={() => saveEdit(p)}
									disabled={actionLoading === p.name}
									className="flex items-center gap-1.5 bg-foreground text-background hover:opacity-90 disabled:opacity-40 px-4 py-2 transition-opacity text-xs font-mono uppercase tracking-wider"
								>
									{actionLoading === p.name ? (
										<Loader2 className="h-3 w-3 animate-spin" />
									) : null}
									Save
								</button>
								<button
									onClick={() => setEditing(null)}
									className="border border-foreground/10 text-foreground/50 hover:border-foreground/20 hover:text-foreground/70 px-4 py-2 transition-all text-xs font-mono"
								>
									Cancel
								</button>
							</div>
						</div>
					) : deleting === p.name ? (
						<div className="p-5 space-y-4">
							<p className="text-sm text-foreground/70">
								Delete{" "}
								<span className="font-medium text-foreground">
									{p.displayName}
								</span>
								? This cannot be undone.
							</p>
							<div className="flex gap-2">
								<button
									onClick={() => deleteProvider(p)}
									disabled={actionLoading === p.name}
									className="flex items-center gap-1.5 bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-40 px-4 py-2 transition-opacity text-xs font-mono uppercase tracking-wider"
								>
									{actionLoading === p.name ? (
										<Loader2 className="h-3 w-3 animate-spin" />
									) : (
										<Trash2 className="h-3 w-3" />
									)}
									Delete
								</button>
								<button
									onClick={() => setDeleting(null)}
									className="border border-foreground/10 text-foreground/50 hover:border-foreground/20 hover:text-foreground/70 px-4 py-2 transition-all text-xs font-mono"
								>
									Cancel
								</button>
							</div>
						</div>
					) : (
						<>
							<div className="p-4 sm:p-5 space-y-3">
								<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2.5 flex-wrap">
											<h3 className="text-sm font-medium text-foreground">
												{p.displayName}
											</h3>
											{p.verified && (
												<span className="text-[10px] font-mono text-success border border-success/20 bg-success/5 px-1.5 py-0.5">
													Verified
												</span>
											)}
											<span
												className={`text-[10px] font-mono px-1.5 py-0.5 ${
													p.public
														? "text-foreground/60 border border-foreground/15 bg-foreground/5"
														: "text-foreground/35 border border-dashed border-foreground/15"
												}`}
											>
												{p.public ? "Public" : "Private"}
											</span>
										</div>
										<p className="text-[11px] font-mono text-foreground/35 mt-1 break-all">
											{p.name}
										</p>
									</div>
									<div className="flex items-center gap-1 shrink-0">
										<button
											onClick={() => togglePublic(p)}
											disabled={actionLoading === p.name}
											className={`inline-flex items-center gap-1.5 disabled:opacity-40 px-3 py-1.5 transition-all text-[11px] font-mono ${
												p.public
													? "border border-foreground/10 text-foreground/45 hover:border-foreground/20 hover:text-foreground/65"
													: "bg-foreground text-background hover:opacity-90"
											}`}
										>
											{actionLoading === p.name && (
												<Loader2 className="h-3 w-3 animate-spin" />
											)}
											{p.public ? "Make private" : "Make public"}
										</button>
										<button
											onClick={() => startEdit(p)}
											title="Edit"
											className="p-1.5 text-foreground/40 hover:text-foreground/70 transition-colors"
										>
											<Pencil className="h-3.5 w-3.5" />
										</button>
										<button
											onClick={() => setDeleting(p.name)}
											title="Delete"
											className="p-1.5 text-foreground/40 hover:text-destructive transition-colors"
										>
											<Trash2 className="h-3.5 w-3.5" />
										</button>
									</div>
								</div>

								<p className="text-xs text-foreground/50 leading-relaxed line-clamp-2">
									{p.description}
								</p>

								<div className="flex items-center gap-1.5 flex-wrap">
									{p.modes.map((mode) => (
										<span
											key={mode}
											className="text-[10px] font-mono text-foreground/40 border border-foreground/8 px-1.5 py-0.5"
										>
											{mode}
										</span>
									))}
									{p.categories.slice(0, 3).map((cat) => (
										<span
											key={cat}
											className="text-[10px] font-mono text-foreground/40 border border-foreground/8 px-1.5 py-0.5"
										>
											{cat}
										</span>
									))}
								</div>
							</div>

							<div className="border-t border-foreground/6 px-4 sm:px-5 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
								<span className="text-[10px] font-mono text-foreground/30 truncate flex items-center gap-1.5 min-w-0">
									<Globe className="h-3 w-3 shrink-0" />
									<span className="truncate">{p.url}</span>
								</span>
								<div className="flex items-center gap-3 shrink-0">
									<Link
										href={`/providers/${encodeURIComponent(p.name)}`}
										className="inline-flex items-center gap-1 text-[10px] font-mono text-foreground/40 hover:text-foreground/70 transition-colors"
									>
										View details
										<ArrowUpRight className="h-3 w-3" />
									</Link>
									<span className="text-[10px] font-mono text-foreground/20">
										{new Date(p.createdAt).toLocaleDateString()}
									</span>
								</div>
							</div>
						</>
					)}
				</div>
			))}
		</div>
	);
}
