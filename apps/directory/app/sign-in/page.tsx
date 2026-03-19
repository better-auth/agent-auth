"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { authClient } from "@/lib/auth-client";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function SignInForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hasOAuthQuery = searchParams.has("sig") || searchParams.has("client_id");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const res = await authClient.signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
        });
        if (res.error) {
          setError(res.error.message ?? "Sign up failed");
          setLoading(false);
          return;
        }
      } else {
        const res = await authClient.signIn.email({
          email,
          password,
        });
        if (res.error) {
          setError(res.error.message ?? "Sign in failed");
          setLoading(false);
          return;
        }
      }

      if (hasOAuthQuery) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("exp");
        params.delete("sig");
        window.location.href = `/api/auth/oauth2/authorize?${params.toString()}`;
      } else {
        window.location.href = "/";
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  async function handleGitHub() {
    setError(null);
    setLoading(true);

    if (hasOAuthQuery) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("exp");
      params.delete("sig");
      const callbackURL = `/api/auth/oauth2/authorize?${params.toString()}`;
      await authClient.signIn.social({
        provider: "github",
        callbackURL,
      });
    } else {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: "/",
      });
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-8 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">
            {isSignUp ? "Create Account" : "Sign In"}
          </h1>
          <p className="text-sm text-foreground/50">
            {hasOAuthQuery
              ? isSignUp
                ? "Create an account to authorize this connection."
                : "Sign in to authorize this connection."
              : isSignUp
                ? "Create your account."
                : "Welcome back."}
          </p>
        </div>

        <button
          type="button"
          onClick={handleGitHub}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 border border-foreground/[0.12] bg-foreground/[0.04] hover:bg-foreground/[0.08] px-4 py-2.5 text-sm font-medium text-foreground/80 disabled:opacity-50 transition-colors"
        >
          <GitHubIcon className="h-4 w-4" />
          Continue with GitHub
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-foreground/[0.08]" />
          <span className="text-[10px] font-mono text-foreground/30 uppercase tracking-wider">
            or
          </span>
          <div className="flex-1 h-px bg-foreground/[0.08]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label htmlFor="name" className="block text-xs font-medium text-foreground/60 mb-1.5">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-foreground/[0.12] bg-foreground/[0.03] px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-foreground/[0.25] focus:outline-none transition-colors"
                placeholder="Your name"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-xs font-medium text-foreground/60 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-foreground/[0.12] bg-foreground/[0.03] px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-foreground/[0.25] focus:outline-none transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-foreground/60 mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full border border-foreground/[0.12] bg-foreground/[0.03] px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-foreground/[0.25] focus:outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-destructive-foreground">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Loading..." : isSignUp ? "Create Account" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs text-foreground/40">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="text-foreground/60 hover:text-foreground underline underline-offset-2"
          >
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-background">
          <p className="text-foreground/40 text-sm">Loading...</p>
        </main>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
