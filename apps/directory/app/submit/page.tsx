"use client";

import { AlertCircle, ArrowLeft, CheckCircle, Globe, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { useSession } from "@/lib/auth-client";

interface SubmitResult {
  id: string;
  name: string;
  config: {
    provider_name: string;
    description?: string;
    issuer: string;
    modes: string[];
    approval_methods: string[];
  };
}

export default function SubmitPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [url, setUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [categories, setCategories] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          displayName: displayName.trim() || undefined,
          categories: categories
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? `Failed to register (${res.status})`);
        return;
      }

      setResult(data as SubmitResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const isSignedOut = !isPending && !session;

  useEffect(() => {
    if (isSignedOut) {
      router.replace("/sign-in");
    }
  }, [isSignedOut, router]);

  return (
    <div className="min-h-dvh flex flex-col">
      <Nav />

      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-lg mx-auto w-full">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[11px] font-mono text-foreground/40 hover:text-foreground/60 transition-colors mb-8"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </Link>

        <div className="space-y-2 mb-8">
          <h1 className="text-lg font-semibold text-foreground">Submit a Provider</h1>
          <p className="text-xs text-foreground/45 leading-relaxed">
            Enter the URL of an Agent Auth-capable service. We'll auto-discover its configuration
            from{" "}
            <code className="text-[10px] font-mono text-foreground/55">
              /.well-known/agent-configuration
            </code>
          </p>
        </div>

        {isPending || isSignedOut ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-foreground/30" />
          </div>
        ) : result ? (
          <div className="space-y-6">
            <div className="border border-success/20 bg-success/5 p-5 space-y-3">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Provider submitted</span>
              </div>
              <p className="text-[11px] text-foreground/45">
                Your submission is pending review. It will appear in the public directory once
                approved.
              </p>
              <div className="space-y-1.5">
                <p className="text-xs font-mono text-foreground/60">
                  Name: {result.config.provider_name}
                </p>
                {result.config.description && (
                  <p className="text-xs text-foreground/50">{result.config.description}</p>
                )}
                <p className="text-xs font-mono text-foreground/40">
                  Issuer: {result.config.issuer}
                </p>
                <p className="text-xs font-mono text-foreground/40">
                  Modes: {result.config.modes.join(", ")}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() =>
                  router.push(`/providers/${encodeURIComponent(result.config.provider_name)}`)
                }
                className="flex-1 border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] hover:border-foreground/[0.20] px-4 py-2.5 transition-all text-xs font-mono text-foreground/60 text-center"
              >
                View Provider
              </button>
              <button
                onClick={() => {
                  setResult(null);
                  setUrl("");
                  setDisplayName("");
                  setCategories("");
                }}
                className="flex-1 border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] hover:border-foreground/[0.20] px-4 py-2.5 transition-all text-xs font-mono text-foreground/60 text-center"
              >
                Submit Another
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[11px] font-mono uppercase tracking-wider text-foreground/40">
                Service URL *
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/25" />
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://myservice.com"
                  className="w-full bg-foreground/[0.03] border border-foreground/[0.08] placeholder:text-foreground/25 text-foreground font-mono text-xs focus:outline-none focus:border-foreground/20 focus:bg-foreground/[0.05] transition-all pl-10 pr-4 py-2.5"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono uppercase tracking-wider text-foreground/40">
                Display Name <span className="text-foreground/25">(optional)</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="My Service"
                className="w-full bg-foreground/[0.03] border border-foreground/[0.08] placeholder:text-foreground/25 text-foreground font-mono text-xs focus:outline-none focus:border-foreground/20 focus:bg-foreground/[0.05] transition-all px-4 py-2.5"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-mono uppercase tracking-wider text-foreground/40">
                Categories <span className="text-foreground/25">(comma-separated)</span>
              </label>
              <input
                type="text"
                value={categories}
                onChange={(e) => setCategories(e.target.value)}
                placeholder="deployment, hosting, devops"
                className="w-full bg-foreground/[0.03] border border-foreground/[0.08] placeholder:text-foreground/25 text-foreground font-mono text-xs focus:outline-none focus:border-foreground/20 focus:bg-foreground/[0.05] transition-all px-4 py-2.5"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-destructive-foreground text-xs border border-destructive/20 bg-destructive/5 p-3">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="w-full flex items-center justify-center gap-2 bg-foreground text-background hover:opacity-90 disabled:opacity-40 px-4 py-2.5 transition-opacity text-xs font-mono uppercase tracking-wider"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Discovering...
                </>
              ) : (
                "Discover & Register"
              )}
            </button>

            <p className="text-[10px] font-mono text-foreground/25 text-center">
              We'll fetch the{" "}
              <code className="text-foreground/35">/.well-known/agent-configuration</code> endpoint
              to verify and populate provider details.
              <br />
              Submissions are not public by default and will be reviewed before appearing in the
              directory.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
