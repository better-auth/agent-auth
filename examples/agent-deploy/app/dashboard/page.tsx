"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";

interface Site {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  createdAt: string;
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
    <div className="px-5 sm:px-6 lg:px-8 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Sites</h1>
            <p className="mt-1 text-[11px] font-mono text-foreground/35">
              {loading
                ? "Loading..."
                : `${total} site${total !== 1 ? "s" : ""} deployed`}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-mono bg-foreground text-background hover:opacity-90 transition-opacity"
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
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-36 border border-foreground/[0.06] bg-foreground/[0.02] animate-pulse"
              />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="text-foreground/15">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mx-auto"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground/50">
                No sites yet
              </p>
              <p className="mt-1 text-xs text-foreground/30">
                Deploy your first HTML site or let an AI agent do it for you
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center px-4 py-2 text-xs font-mono border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] hover:border-foreground/[0.20] transition-colors"
            >
              Create your first site
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sites.map((site) => (
              <SiteCard key={site.id} site={site} onDeleted={fetchSites} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SiteCard({
  site,
  onDeleted,
}: {
  site: Site;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete "${site.name}"? This cannot be undone.`)) return;
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
    <div className="group p-5 border border-foreground/[0.08] bg-foreground/[0.02] hover:bg-foreground/[0.04] hover:border-foreground/[0.14] transition-colors space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/dashboard/sites/${site.id}`}
            className="text-sm font-medium hover:underline underline-offset-2 truncate block"
          >
            {site.name}
          </Link>
          {site.description && (
            <p className="mt-1 text-[11px] text-foreground/40 line-clamp-2">
              {site.description}
            </p>
          )}
        </div>
        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-success mt-2" />
      </div>

      <div className="flex items-center gap-2">
        <a
          href={siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-mono text-foreground/30 hover:text-foreground/50 transition-colors truncate"
        >
          {site.slug}
        </a>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-foreground/[0.06]">
        <span className="text-[10px] font-mono text-foreground/25">
          {timeAgo}
        </span>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link
            href={`/dashboard/sites/${site.id}`}
            className="text-[10px] font-mono text-foreground/40 hover:text-foreground/70 transition-colors"
          >
            Edit
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-[10px] font-mono text-destructive-foreground/60 hover:text-destructive-foreground transition-colors disabled:opacity-50"
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
      <div className="relative w-full max-w-2xl mx-5 border border-foreground/[0.10] bg-background max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/[0.06]">
          <h2 className="text-sm font-semibold">Deploy New Site</h2>
          <button
            onClick={onClose}
            className="text-foreground/30 hover:text-foreground/60 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-foreground/40 tracking-wider uppercase">
                Site Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-foreground/[0.03] border border-foreground/[0.08] placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05] font-mono text-xs outline-none transition-colors"
                placeholder="My Landing Page"
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
                placeholder="Optional description"
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
              required
              rows={14}
              className="w-full px-3 py-2.5 bg-foreground/[0.03] border border-foreground/[0.08] placeholder:text-foreground/25 focus:border-foreground/20 focus:bg-foreground/[0.05] font-mono text-xs outline-none transition-colors resize-y leading-relaxed"
              placeholder="<html>...</html>"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-mono text-foreground/45 hover:text-foreground/70 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-mono bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"
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
  const date = new Date(dateStr + "Z");
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
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
