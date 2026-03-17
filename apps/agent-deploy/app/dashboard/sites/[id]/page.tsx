"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";

interface SiteDetail {
	createdAt: string;
	description: string;
	html: string;
	id: string;
	name: string;
	slug: string;
	status: string;
	updatedAt: string;
	userId: string;
}

export default function SiteDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const router = useRouter();
	const [site, setSite] = useState<SiteDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [name, setName] = useState("");
	const [html, setHtml] = useState("");
	const [description, setDescription] = useState("");
	const [showPreview, setShowPreview] = useState(false);

	useEffect(() => {
		fetch(`/api/sites/${id}`)
			.then((res) => {
				if (!res.ok) {
					throw new Error("Not found");
				}
				return res.json();
			})
			.then((data) => {
				setSite(data);
				setName(data.name);
				setHtml(data.html);
				setDescription(data.description);
			})
			.catch(() => router.push("/dashboard"))
			.finally(() => setLoading(false));
	}, [id, router]);

	async function handleSave() {
		setSaving(true);
		try {
			const res = await fetch(`/api/sites/${id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, html, description }),
			});
			if (res.ok) {
				const updated = await res.json();
				setSite(updated);
				toast.success("Site updated");
			} else {
				toast.error("Failed to save");
			}
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete() {
		if (!confirm(`Delete "${site?.name}"? This cannot be undone.`)) {
			return;
		}
		const res = await fetch(`/api/sites/${id}`, { method: "DELETE" });
		if (res.ok) {
			toast.success("Site deleted");
			router.push("/dashboard");
		} else {
			toast.error("Failed to delete");
		}
	}

	if (loading) {
		return (
			<div className="px-5 py-8 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-5xl">
					<div className="h-8 w-48 animate-pulse bg-foreground/[0.04]" />
					<div className="mt-6 h-96 animate-pulse border border-foreground/[0.06] bg-foreground/[0.02]" />
				</div>
			</div>
		);
	}

	if (!site) {
		return null;
	}

	const siteUrl = `/sites/${site.slug}`;

	return (
		<div className="px-5 py-8 sm:px-6 lg:px-8">
			<div className="mx-auto max-w-5xl">
				{/* Breadcrumb */}
				<div className="mb-6 flex items-center gap-2">
					<Link
						className="font-mono text-[11px] text-foreground/35 transition-colors hover:text-foreground/60"
						href="/dashboard"
					>
						Sites
					</Link>
					<span className="text-[11px] text-foreground/20">/</span>
					<span className="font-mono text-[11px] text-foreground/55">
						{site.name}
					</span>
				</div>

				{/* Header */}
				<div className="mb-6 flex items-start justify-between">
					<div>
						<h1 className="font-semibold text-lg tracking-tight">
							{site.name}
						</h1>
						<div className="mt-1 flex items-center gap-3">
							<a
								className="font-mono text-[11px] text-foreground/35 underline underline-offset-2 transition-colors hover:text-foreground/55"
								href={siteUrl}
								rel="noopener noreferrer"
								target="_blank"
							>
								{site.slug}
							</a>
							<span className="font-mono text-[10px] text-foreground/20">
								Created {new Date(`${site.createdAt}Z`).toLocaleDateString()}
							</span>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<button
							className="border border-foreground/[0.10] bg-foreground/[0.03] px-3 py-1.5 font-mono text-[11px] transition-colors hover:bg-foreground/[0.06]"
							onClick={() => setShowPreview(!showPreview)}
						>
							{showPreview ? "Editor" : "Preview"}
						</button>
						<button
							className="border border-destructive/20 px-3 py-1.5 font-mono text-[11px] text-destructive-foreground/70 transition-colors hover:bg-destructive/5"
							onClick={handleDelete}
						>
							Delete
						</button>
					</div>
				</div>

				{showPreview ? (
					<div className="border border-foreground/[0.08] bg-white">
						<div className="flex items-center gap-2 border-foreground/[0.06] border-b bg-foreground/[0.02] px-4 py-2">
							<div className="h-2 w-2 rounded-full bg-foreground/10" />
							<div className="h-2 w-2 rounded-full bg-foreground/10" />
							<div className="h-2 w-2 rounded-full bg-foreground/10" />
							<span className="ml-2 font-mono text-[10px] text-foreground/25">
								Preview
							</span>
						</div>
						<iframe
							className="h-[600px] w-full border-0"
							sandbox="allow-scripts"
							srcDoc={html}
							title="Site Preview"
						/>
					</div>
				) : (
					<div className="space-y-4">
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div className="space-y-1.5">
								<label className="font-mono text-[11px] text-foreground/40 uppercase tracking-wider">
									Site Name
								</label>
								<input
									className="w-full border border-foreground/[0.08] bg-foreground/[0.03] px-3 py-2.5 font-mono text-xs outline-none transition-colors placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05]"
									onChange={(e) => setName(e.target.value)}
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
								rows={20}
								value={html}
							/>
						</div>

						<div className="flex items-center justify-end gap-3">
							<Link
								className="px-4 py-2 font-mono text-foreground/45 text-xs transition-colors hover:text-foreground/70"
								href="/dashboard"
							>
								Back
							</Link>
							<button
								className="bg-foreground px-5 py-2 font-mono text-background text-xs transition-opacity hover:opacity-90 disabled:opacity-50"
								disabled={saving}
								onClick={handleSave}
							>
								{saving ? "Saving..." : "Save Changes"}
							</button>
						</div>
					</div>
				)}

				{/* Site info */}
				<div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
					{[
						{ label: "ID", value: site.id },
						{ label: "Slug", value: site.slug },
						{
							label: "Created",
							value: new Date(`${site.createdAt}Z`).toLocaleString(),
						},
						{
							label: "Updated",
							value: new Date(`${site.updatedAt}Z`).toLocaleString(),
						},
					].map((item) => (
						<div
							className="border border-foreground/[0.06] bg-foreground/[0.02] p-3"
							key={item.label}
						>
							<span className="font-mono text-[9px] text-foreground/30 uppercase tracking-wider">
								{item.label}
							</span>
							<p className="mt-1 truncate font-mono text-[11px] text-foreground/60">
								{item.value}
							</p>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
