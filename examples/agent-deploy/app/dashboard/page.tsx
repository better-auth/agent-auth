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
    <div className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Sites</h1>
          <p className="mt-0.5 text-[13px] text-foreground/40">
            {loading ? "Loading..." : `${total} site${total !== 1 ? "s" : ""} deployed`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-lg bg-foreground text-background hover:opacity-90 transition-all active:scale-[0.98] cursor-pointer"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Site
        </button>
      </div>

      {showCreate && (
        <CreateSiteModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchSites();
          }}
        />
      )}

      {loading ? (
        <div className="rounded-lg border border-border overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={`flex items-center gap-4 px-4 py-4 ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              <div className="h-3 w-40 bg-foreground/[0.06] rounded animate-pulse" />
              <div className="h-3 w-24 bg-foreground/[0.04] rounded animate-pulse ml-auto" />
            </div>
          ))}
        </div>
      ) : sites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 border border-border rounded-lg border-dashed">
          <div className="h-10 w-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center mb-4">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-foreground/25"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <h3 className="text-[13px] font-medium text-foreground/60">No sites yet</h3>
          <p className="mt-1 text-[12px] text-foreground/35 max-w-xs text-center">
            Deploy your first HTML site or let an AI agent do it for you.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex items-center px-3 py-2 text-[13px] font-medium rounded-lg border border-border hover:bg-foreground/[0.03] transition-colors cursor-pointer"
          >
            Create your first site
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {sites.map((site, idx) => (
            <SiteRow key={site.id} site={site} isFirst={idx === 0} onDeleted={fetchSites} />
          ))}
        </div>
      )}
    </div>
  );
}

function SiteRow({
  site,
  isFirst,
  onDeleted,
}: {
  site: Site;
  isFirst: boolean;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
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

  const timeAgo = formatTimeAgo(site.updatedAt);

  return (
    <Link
      href={`/dashboard/sites/${site.id}`}
      className={`group flex items-center gap-4 px-4 py-3.5 hover:bg-foreground/[0.02] transition-colors ${
        !isFirst ? "border-t border-border" : ""
      }`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex items-center justify-center h-8 w-8 rounded-md bg-foreground/[0.04] border border-border shrink-0">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-foreground/30"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium truncate">{site.name}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          </div>
          <span className="text-[12px] text-foreground/35 font-mono truncate block">
            {site.slug}
          </span>
        </div>
      </div>

      {site.description && (
        <span className="hidden md:block text-[12px] text-foreground/30 truncate max-w-[200px]">
          {site.description}
        </span>
      )}

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[12px] text-foreground/30 tabular-nums">{timeAgo}</span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="px-2 py-1 text-[11px] text-foreground/40 hover:text-foreground hover:bg-foreground/[0.06] rounded transition-colors">
            Edit
          </span>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-2 py-1 text-[11px] text-foreground/40 hover:text-red-500 hover:bg-red-500/[0.06] rounded transition-colors disabled:opacity-50 cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </Link>
  );
}

function CreateSiteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl mx-5 rounded-lg border border-border bg-card shadow-xl max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-[14px] font-semibold">Deploy New Site</h2>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-md flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-foreground/[0.06] transition-colors cursor-pointer"
          >
            <svg
              width="14"
              height="14"
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

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(85vh-55px)]">
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-foreground/50 uppercase tracking-wider">
                  Site Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-md bg-background border border-border placeholder:text-foreground/25 focus:border-foreground/20 focus:ring-1 focus:ring-foreground/[0.08] text-[13px] outline-none transition-all"
                  placeholder="My Landing Page"
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
                  placeholder="Optional description"
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
                required
                rows={14}
                className="w-full px-3 py-2 rounded-md bg-background border border-border placeholder:text-foreground/25 focus:border-foreground/20 focus:ring-1 focus:ring-foreground/[0.08] font-mono text-[12px] outline-none transition-all resize-y leading-relaxed"
                placeholder="<html>...</html>"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border bg-foreground/[0.02]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-[13px] font-medium text-foreground/50 hover:text-foreground rounded-md hover:bg-foreground/[0.05] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-[13px] font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-all disabled:opacity-50 active:scale-[0.98] cursor-pointer"
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
  const date = new Date(dateStr);
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
