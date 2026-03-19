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

export default function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="h-5 w-40 bg-foreground/[0.06] rounded animate-pulse" />
        <div className="mt-5 h-80 bg-foreground/[0.03] border border-border rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!site) return null;

  const siteUrl = `/sites/${site.slug}`;

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-center gap-1.5 mb-5 text-[13px]">
        <Link
          href="/dashboard"
          className="text-foreground/35 hover:text-foreground transition-colors"
        >
          Sites
        </Link>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-foreground/15"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="text-foreground/60 font-medium">{site.name}</span>
      </div>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{site.name}</h1>
          <div className="mt-1.5 flex items-center gap-3">
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-foreground/35 hover:text-foreground/60 transition-colors flex items-center gap-1 font-mono"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              {site.slug}
            </a>
            <span className="text-[11px] text-foreground/20 font-mono">
              Created {new Date(site.createdAt + "Z").toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-3 py-2 text-[13px] font-medium rounded-md border border-border hover:bg-foreground/[0.03] transition-colors cursor-pointer"
          >
            {showPreview ? "Editor" : "Preview"}
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-[13px] font-medium rounded-md border border-red-200 dark:border-red-900/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>

      {showPreview ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border bg-foreground/[0.02]">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-foreground/[0.08]" />
              <div className="w-2.5 h-2.5 rounded-full bg-foreground/[0.08]" />
              <div className="w-2.5 h-2.5 rounded-full bg-foreground/[0.08]" />
            </div>
            <span className="ml-2 text-[11px] text-foreground/25 font-mono">Preview</span>
          </div>
          <iframe
            srcDoc={html}
            className="w-full h-[600px] border-0 bg-white"
            sandbox="allow-scripts"
            title="Site Preview"
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground/50 uppercase tracking-wider">
                Site Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-background border border-border placeholder:text-foreground/25 focus:border-foreground/20 focus:ring-1 focus:ring-foreground/[0.08] text-[13px] outline-none transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground/50 uppercase tracking-wider">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-background border border-border placeholder:text-foreground/25 focus:border-foreground/20 focus:ring-1 focus:ring-foreground/[0.08] text-[13px] outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-foreground/50 uppercase tracking-wider">
              HTML Content
            </label>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={20}
              className="w-full px-3 py-2 rounded-md bg-background border border-border placeholder:text-foreground/25 focus:border-foreground/20 focus:ring-1 focus:ring-foreground/[0.08] font-mono text-[11px] outline-none transition-all resize-y leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Link
              href="/dashboard"
              className="px-3 py-2 text-[13px] font-medium text-foreground/40 hover:text-foreground rounded-md hover:bg-foreground/[0.05] transition-colors"
            >
              Back
            </Link>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-[13px] font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-all disabled:opacity-50 active:scale-[0.98] cursor-pointer"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "ID", value: site.id },
          { label: "Slug", value: site.slug },
          {
            label: "Created",
            value: new Date(site.createdAt + "Z").toLocaleString(),
          },
          {
            label: "Updated",
            value: new Date(site.updatedAt + "Z").toLocaleString(),
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-md p-3 border border-border bg-foreground/[0.02]"
          >
            <span className="text-[9px] font-semibold text-foreground/30 tracking-wider uppercase">
              {item.label}
            </span>
            <p className="mt-1 text-[11px] font-mono text-foreground/50 truncate">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
