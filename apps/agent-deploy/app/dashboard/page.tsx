"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Site {
	createdAt: string;
	description: string;
	id: string;
	name: string;
	slug: string;
	status: string;
	updatedAt: string;
}

export default function DashboardPage() {
	const [sites, setSites] = useState<Site[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [showCreate, setShowCreate] = useState(false);

	const fetchSites = useCallback(async () => {
		try {
			const res = await fetch("/api/sites");
			if (res.ok) {
				const data = await res.json();
				setSites(data.sites);
				setTotal(data.total);
			}
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchSites();
	}, [fetchSites]);

	return (
		<div className="px-5 py-8 sm:px-6 lg:px-8">
			<div className="mx-auto max-w-5xl">
				{/* Header */}
				<div className="mb-8 flex items-center justify-between">
					<div>
						<h1 className="font-semibold text-lg tracking-tight">Sites</h1>
						<p className="mt-1 font-mono text-[11px] text-foreground/35">
							{loading
								? "Loading..."
								: `${total} site${total === 1 ? "" : "s"} deployed`}
						</p>
					</div>
					<button
						className="inline-flex items-center gap-2 bg-foreground px-4 py-2 font-mono text-background text-xs transition-opacity hover:opacity-90"
						onClick={() => setShowCreate(true)}
					>
						<svg
							fill="none"
							height="12"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							viewBox="0 0 24 24"
							width="12"
						>
							<line x1="12" x2="12" y1="5" y2="19" />
							<line x1="5" x2="19" y1="12" y2="12" />
						</svg>
						New Site
					</button>
				</div>

				{/* Create modal */}
				{showCreate && (
					<CreateSiteModal
						onClose={() => setShowCreate(false)}
						onCreated={() => {
							setShowCreate(false);
							fetchSites();
						}}
					/>
				)}

				{/* Sites grid */}
				{loading ? (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{Array.from({ length: 3 }).map((_, i) => (
							<div
								className="h-36 animate-pulse border border-foreground/[0.06] bg-foreground/[0.02]"
								key={i}
							/>
						))}
					</div>
				) : sites.length === 0 ? (
					<div className="space-y-4 py-20 text-center">
						<div className="text-foreground/15">
							<svg
								className="mx-auto"
								fill="none"
								height="48"
								stroke="currentColor"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth="1"
								viewBox="0 0 24 24"
								width="48"
							>
								<rect height="14" rx="2" ry="2" width="20" x="2" y="3" />
								<line x1="8" x2="16" y1="21" y2="21" />
								<line x1="12" x2="12" y1="17" y2="21" />
							</svg>
						</div>
						<div>
							<p className="font-medium text-foreground/50 text-sm">
								No sites yet
							</p>
							<p className="mt-1 text-foreground/30 text-xs">
								Deploy your first HTML site or let an AI agent do it for you
							</p>
						</div>
						<button
							className="inline-flex items-center border border-foreground/[0.12] bg-foreground/[0.04] px-4 py-2 font-mono text-xs transition-colors hover:border-foreground/[0.20] hover:bg-foreground/[0.08]"
							onClick={() => setShowCreate(true)}
						>
							Create your first site
						</button>
					</div>
				) : (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{sites.map((site) => (
							<SiteCard key={site.id} onDeleted={fetchSites} site={site} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function SiteCard({ site, onDeleted }: { site: Site; onDeleted: () => void }) {
	const [deleting, setDeleting] = useState(false);

	async function handleDelete() {
		if (!confirm(`Delete "${site.name}"? This cannot be undone.`)) {
			return;
		}
		setDeleting(true);
		try {
			const res = await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
			if (res.ok) {
				toast.success("Site deleted");
				onDeleted();
			} else {
				toast.error("Failed to delete site");
			}
		} finally {
			setDeleting(false);
		}
	}

	const siteUrl = `/sites/${site.slug}`;
	const timeAgo = formatTimeAgo(site.updatedAt);

	return (
		<div className="group space-y-3 border border-foreground/[0.08] bg-foreground/[0.02] p-5 transition-colors hover:border-foreground/[0.14] hover:bg-foreground/[0.04]">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<Link
						className="block truncate font-medium text-sm underline-offset-2 hover:underline"
						href={`/dashboard/sites/${site.id}`}
					>
						{site.name}
					</Link>
					{site.description && (
						<p className="mt-1 line-clamp-2 text-[11px] text-foreground/40">
							{site.description}
						</p>
					)}
				</div>
				<span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
			</div>

			<div className="flex items-center gap-2">
				<a
					className="truncate font-mono text-[10px] text-foreground/30 transition-colors hover:text-foreground/50"
					href={siteUrl}
					rel="noopener noreferrer"
					target="_blank"
				>
					{site.slug}
				</a>
			</div>

			<div className="flex items-center justify-between border-foreground/[0.06] border-t pt-1">
				<span className="font-mono text-[10px] text-foreground/25">
					{timeAgo}
				</span>
				<div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
					<Link
						className="font-mono text-[10px] text-foreground/40 transition-colors hover:text-foreground/70"
						href={`/dashboard/sites/${site.id}`}
					>
						Edit
					</Link>
					<button
						className="font-mono text-[10px] text-destructive-foreground/60 transition-colors hover:text-destructive-foreground disabled:opacity-50"
						disabled={deleting}
						onClick={handleDelete}
					>
						Delete
					</button>
				</div>
			</div>
		</div>
	);
}

function CreateSiteModal({
	onClose,
	onCreated,
}: {
	onClose: () => void;
	onCreated: () => void;
}) {
	const [name, setName] = useState("");
	const [html, setHtml] = useState(DEFAULT_HTML);
	const [description, setDescription] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		try {
			const res = await fetch("/api/sites", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, html, description }),
			});
			if (res.ok) {
				toast.success("Site deployed!");
				onCreated();
			} else {
				const data = await res.json();
				toast.error(data.error || "Failed to create site");
			}
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			<div
				className="absolute inset-0 bg-background/80 backdrop-blur-sm"
				onClick={onClose}
			/>
			<div className="relative mx-5 max-h-[85vh] w-full max-w-2xl overflow-y-auto border border-foreground/[0.10] bg-background">
				<div className="flex items-center justify-between border-foreground/[0.06] border-b px-5 py-4">
					<h2 className="font-semibold text-sm">Deploy New Site</h2>
					<button
						className="text-foreground/30 transition-colors hover:text-foreground/60"
						onClick={onClose}
					>
						<svg
							fill="none"
							height="16"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							viewBox="0 0 24 24"
							width="16"
						>
							<line x1="18" x2="6" y1="6" y2="18" />
							<line x1="6" x2="18" y1="6" y2="18" />
						</svg>
					</button>
				</div>

				<form className="space-y-4 p-5" onSubmit={handleSubmit}>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="space-y-1.5">
							<label className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
								Site Name
							</label>
							<input
								className="w-full border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2.5 font-mono text-xs outline-none transition-colors placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05]"
								onChange={(e) => setName(e.target.value)}
								placeholder="My Landing Page"
								required
								type="text"
								value={name}
							/>
						</div>
						<div className="space-y-1.5">
							<label className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
								Description
							</label>
							<input
								className="w-full border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2.5 font-mono text-xs outline-none transition-colors placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05]"
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Optional description"
								type="text"
								value={description}
							/>
						</div>
					</div>

					<div className="space-y-1.5">
						<label className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
							HTML Content
						</label>
						<textarea
							className="w-full resize-y border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2.5 font-mono text-xs leading-relaxed outline-none transition-colors placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05]"
							onChange={(e) => setHtml(e.target.value)}
							placeholder="<html>...</html>"
							required
							rows={14}
							value={html}
						/>
					</div>

					<div className="flex items-center justify-end gap-3 pt-2">
						<button
							className="px-4 py-2 font-mono text-foreground/45 text-xs transition-colors hover:text-foreground/70"
							onClick={onClose}
							type="button"
						>
							Cancel
						</button>
						<button
							className="bg-foreground px-5 py-2 font-mono text-background text-xs transition-opacity hover:opacity-90 disabled:opacity-50"
							disabled={loading}
							type="submit"
						>
							{loading ? "Deploying..." : "Deploy Site"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}

function formatTimeAgo(dateStr: string): string {
	const date = new Date(`${dateStr}Z`);
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) {
		return "just now";
	}
	if (mins < 60) {
		return `${mins}m ago`;
	}
	const hours = Math.floor(mins / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.floor(hours / 24);
	if (days < 30) {
		return `${days}d ago`;
	}
	return date.toLocaleDateString();
}

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Site</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fafafa;
      color: #111;
    }
    .container { text-align: center; }
    h1 { font-size: 2rem; font-weight: 600; }
    p { margin-top: 0.5rem; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Hello, World!</h1>
    <p>Deployed with Agent Deploy</p>
  </div>
</body>
</html>`;
