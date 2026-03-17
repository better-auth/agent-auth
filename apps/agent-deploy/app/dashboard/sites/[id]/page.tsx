"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface SiteDetail {
  id: string;
  name: string;
  slug: string;
  html: string;
  description: string;
  userId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
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
        if (!res.ok) throw new Error("Not found");
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
    if (!confirm(`Delete "${site?.name}"? This cannot be undone.`)) return;
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
      <div className="px-5 sm:px-6 lg:px-8 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="h-8 w-48 bg-foreground/[0.04] animate-pulse" />
          <div className="mt-6 h-96 bg-foreground/[0.02] border border-foreground/[0.06] animate-pulse" />
        </div>
      </div>
    );
  }

  if (!site) return null;

  const siteUrl = `/sites/${site.slug}`;

  return (
    <div className="px-5 sm:px-6 lg:px-8 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6">
          <Link
            href="/dashboard"
            className="text-[11px] font-mono text-foreground/35 hover:text-foreground/60 transition-colors"
          >
            Sites
          </Link>
          <span className="text-[11px] text-foreground/20">/</span>
          <span className="text-[11px] font-mono text-foreground/55">
            {site.name}
          </span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {site.name}
            </h1>
            <div className="mt-1 flex items-center gap-3">
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-mono text-foreground/35 hover:text-foreground/55 transition-colors underline underline-offset-2"
              >
                {site.slug}
              </a>
              <span className="text-[10px] font-mono text-foreground/20">
                Created {new Date(site.createdAt + "Z").toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="px-3 py-1.5 text-[11px] font-mono border border-foreground/[0.10] bg-foreground/[0.03] hover:bg-foreground/[0.06] transition-colors"
            >
              {showPreview ? "Editor" : "Preview"}
            </button>
            <button
              onClick={handleDelete}
              className="px-3 py-1.5 text-[11px] font-mono border border-destructive/20 text-destructive-foreground/70 hover:bg-destructive/5 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        {showPreview ? (
          <div className="border border-foreground/[0.08] bg-white">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-foreground/[0.06] bg-foreground/[0.02]">
              <div className="w-2 h-2 rounded-full bg-foreground/10" />
              <div className="w-2 h-2 rounded-full bg-foreground/10" />
              <div className="w-2 h-2 rounded-full bg-foreground/10" />
              <span className="ml-2 text-[10px] font-mono text-foreground/25">
                Preview
              </span>
            </div>
            <iframe
              srcDoc={html}
              className="w-full h-[600px] border-0"
              sandbox="allow-scripts"
              title="Site Preview"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono text-foreground/40 tracking-wider uppercase">
                  Site Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-foreground/[0.03] border border-foreground/[0.08] placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05] font-mono text-xs outline-none transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-mono text-foreground/40 tracking-wider uppercase">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2.5 bg-foreground/[0.03] border border-foreground/[0.08] placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05] font-mono text-xs outline-none transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-foreground/40 tracking-wider uppercase">
                HTML Content
              </label>
              <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={20}
                className="w-full px-3 py-2.5 bg-foreground/[0.03] border border-foreground/[0.08] placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05] font-mono text-xs outline-none transition-colors resize-y leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <Link
                href="/dashboard"
                className="px-4 py-2 text-xs font-mono text-foreground/45 hover:text-foreground/70 transition-colors"
              >
                Back
              </Link>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 text-xs font-mono bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        )}

        {/* Site info */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "ID", value: site.id },
            { label: "Slug", value: site.slug },
            { label: "Created", value: new Date(site.createdAt + "Z").toLocaleString() },
            { label: "Updated", value: new Date(site.updatedAt + "Z").toLocaleString() },
          ].map((item) => (
            <div
              key={item.label}
              className="p-3 border border-foreground/[0.06] bg-foreground/[0.02]"
            >
              <span className="text-[9px] font-mono text-foreground/30 tracking-wider uppercase">
                {item.label}
              </span>
              <p className="mt-1 text-[11px] font-mono text-foreground/60 truncate">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
