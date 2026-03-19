import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BetterAuthLogo } from "@/components/icons/logo";
import { Button } from "@/components/ui/button";
import { storage } from "@/lib/storage";
import type { User } from "@/lib/types";

export function SignIn({
  onSuccess,
  onCancel,
}: {
  onSuccess: (user: User) => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<"loading" | "url" | "waiting">("loading");
  const [idpUrl, setIdpUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startPollingStorage = useCallback(() => {
    cleanup();
    pollRef.current = setInterval(async () => {
      const data = await chrome.storage.local.get(["sessionToken", "user", "pendingSignIn"]);
      if (data.pendingSignIn?.completed) {
        cleanup();
        const user = data.pendingSignIn.user ?? data.user;
        await chrome.storage.local.remove("pendingSignIn");
        if (user) onSuccess(user);
        return;
      }
      if (data.sessionToken && data.user && !onCancel) {
        cleanup();
        onSuccess(data.user);
        return;
      }
      if (!data.pendingSignIn) {
        cleanup();
        setStep("url");
      }
    }, 800);
  }, [cleanup, onCancel, onSuccess]);

  useEffect(() => {
    (async () => {
      const data = await chrome.storage.local.get(["pendingSignIn", "sessionToken", "user"]);

      if (data.pendingSignIn?.completed) {
        const user = data.pendingSignIn.user ?? data.user;
        await chrome.storage.local.remove("pendingSignIn");
        if (user) {
          onSuccess(user);
          return;
        }
      }

      if (data.sessionToken && data.user && !onCancel) {
        onSuccess(data.user);
        return;
      }

      if (data.pendingSignIn?.idpUrl) {
        setIdpUrl(data.pendingSignIn.idpUrl);
        setStep("waiting");
        startPollingStorage();
        return;
      }

      const url = await storage.getIdpUrl();
      if (url) setIdpUrl(url);
      setStep("url");
    })();
  }, [onCancel, onSuccess, startPollingStorage]);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = idpUrl.trim().replace(/\/+$/, "");
    if (!trimmed) {
      setError("Enter your server URL");
      return;
    }
    try {
      new URL(trimmed);
    } catch {
      setError("Enter a valid URL (e.g. http://localhost:3000)");
      return;
    }
    setIdpUrl(trimmed);
    setStep("waiting");

    await chrome.storage.local.set({
      pendingSignIn: { idpUrl: trimmed },
    });

    startPollingStorage();
  };

  const handleCancel = async () => {
    cleanup();
    const data = await chrome.storage.local.get("pendingSignIn");
    if (data.pendingSignIn?.tabId) {
      chrome.tabs.remove(data.pendingSignIn.tabId).catch(() => {});
    }
    await chrome.storage.local.remove("pendingSignIn");
    setStep("url");
    setError(null);
  };

  if (step === "loading") {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen px-8 py-10">
      <div className="mb-5 flex flex-col items-center gap-2">
        <BetterAuthLogo className="h-6 w-auto" />
        <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground select-none">
          Better-Auth.
        </span>
      </div>

      {step === "url" ? (
        <>
          <p className="text-xs text-muted-foreground text-center mb-6">
            Connect to your identity provider
          </p>

          {error && (
            <div className="w-full flex items-start gap-2 p-2.5 mb-4 border border-destructive/30 bg-destructive/5 text-[11px] text-destructive rounded-sm">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleUrlSubmit} className="w-full space-y-3">
            <div className="space-y-1.5">
              <label
                htmlFor="idp-url"
                className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider"
              >
                Server URL
              </label>
              <input
                id="idp-url"
                type="url"
                placeholder="http://localhost:3000"
                value={idpUrl}
                onChange={(e) => setIdpUrl(e.target.value)}
                className="flex h-9 w-full rounded-sm border border-input bg-background px-3 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors"
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full">
              <ExternalLink className="h-3.5 w-3.5" />
              {onCancel ? "Add Site" : "Sign in with Browser"}
            </Button>
            {onCancel && (
              <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </form>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground text-center mb-6 max-w-[260px]">
            Sign in on the tab that just opened. We'll connect automatically once you're in.
          </p>

          <div className="flex flex-col items-center gap-3 mb-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-[10px] font-mono text-muted-foreground/60 truncate max-w-[280px]">
              {idpUrl}
            </span>
          </div>

          <div className="w-full space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                chrome.tabs.create({
                  url: idpUrl,
                  active: true,
                });
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Reopen sign-in tab
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
