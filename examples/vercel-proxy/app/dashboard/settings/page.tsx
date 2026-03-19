"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

type ApprovalMethod = "device_authorization" | "ciba";

interface Settings {
  freshSessionEnabled: boolean;
  freshSessionWindow: number;
  preferredApprovalMethod: ApprovalMethod;
  webauthnEnabled: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  const save = async (patch: Partial<Settings>) => {
    const next = { ...settings!, ...patch };
    setSettings(next);
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <div className="h-6 w-32 animate-pulse rounded bg-surface" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-lg font-semibold text-white">Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Configure security and approval settings for Agent Auth.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
            Session Security
          </h2>
          <div className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <div className="flex-1 pr-4">
                <p className="text-sm font-medium text-white">
                  Require fresh session for approvals
                </p>
                <p className="mt-1 text-xs text-muted">
                  When enabled, users must have signed in recently to approve agent capability
                  requests. Helps prevent stale session hijacking.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.freshSessionEnabled}
                onClick={() =>
                  save({
                    freshSessionEnabled: !settings.freshSessionEnabled,
                  })
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  settings.freshSessionEnabled ? "bg-white" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full shadow-lg transition-transform ${
                    settings.freshSessionEnabled
                      ? "translate-x-5 bg-black"
                      : "translate-x-0 bg-zinc-400"
                  }`}
                />
              </button>
            </div>

            {settings.freshSessionEnabled && (
              <div className="flex items-center justify-between px-4 py-4">
                <div className="flex-1 pr-4">
                  <p className="text-sm font-medium text-white">Session window</p>
                  <p className="mt-1 text-xs text-muted">
                    Maximum age (in seconds) of the session at time of approval.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={30}
                    max={86400}
                    value={settings.freshSessionWindow}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s!,
                        freshSessionWindow: parseInt(e.target.value, 10) || 300,
                      }))
                    }
                    onBlur={() =>
                      save({
                        freshSessionWindow: settings.freshSessionWindow,
                      })
                    }
                    className="w-24 rounded-md border border-border bg-background px-3 py-1.5 text-right text-sm text-white outline-none focus:border-white/30"
                  />
                  <span className="text-xs text-muted">sec</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
            Approval Method
          </h2>
          <div className="rounded-lg border border-border bg-surface">
            <div className="px-4 py-4">
              <p className="text-sm font-medium text-white">Preferred approval method</p>
              <p className="mt-1 text-xs text-muted">
                Choose how agents request user approval for capabilities. The agent can still
                request a specific method, but this sets the server default.
              </p>
              <div className="mt-3 flex gap-3">
                {(
                  [
                    {
                      value: "device_authorization",
                      label: "Device Authorization",
                      desc: "User enters a code on a verification page",
                    },
                    {
                      value: "ciba",
                      label: "CIBA (Backchannel)",
                      desc: "Server pushes approval request to the user",
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      save({
                        preferredApprovalMethod: opt.value,
                      })
                    }
                    className={`flex flex-1 flex-col rounded-lg border px-4 py-3 text-left transition-colors ${
                      settings.preferredApprovalMethod === opt.value
                        ? "border-white bg-white/5"
                        : "border-border hover:border-white/20"
                    }`}
                  >
                    <span
                      className={`text-sm font-medium ${
                        settings.preferredApprovalMethod === opt.value
                          ? "text-white"
                          : "text-zinc-400"
                      }`}
                    >
                      {opt.label}
                    </span>
                    <span className="mt-0.5 text-xs text-muted">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
            Proof of Presence (WebAuthn)
          </h2>
          <div className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-4">
              <div className="flex-1 pr-4">
                <p className="text-sm font-medium text-white">
                  Require biometric verification for sensitive actions
                </p>
                <p className="mt-1 text-xs text-muted">
                  When enabled, capabilities marked with{" "}
                  <code className="rounded bg-white/10 px-1 py-0.5 text-[11px]">
                    approvalStrength: &quot;webauthn&quot;
                  </code>{" "}
                  will require a passkey (fingerprint / Face ID) to approve. This prevents AI agents
                  with browser access from self-approving.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.webauthnEnabled}
                onClick={() =>
                  save({
                    webauthnEnabled: !settings.webauthnEnabled,
                  })
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  settings.webauthnEnabled ? "bg-white" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full shadow-lg transition-transform ${
                    settings.webauthnEnabled
                      ? "translate-x-5 bg-black"
                      : "translate-x-0 bg-zinc-400"
                  }`}
                />
              </button>
            </div>

            {settings.webauthnEnabled && <PasskeyManager />}
          </div>
        </div>

        {(saving || saved) && (
          <p className="text-xs text-muted">{saving ? "Saving…" : "Settings saved."}</p>
        )}
      </div>
    </div>
  );
}

function PasskeyManager() {
  const [passkeys, setPasskeys] = useState<
    { id: string; name?: string | null; createdAt?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPasskeys = async () => {
    try {
      const res = await fetch("/api/auth/passkey/list-user-passkeys");
      if (res.ok) {
        const data = await res.json();
        setPasskeys(Array.isArray(data) ? data : []);
      }
    } catch {
      // passkey table might not exist yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPasskeys();
  }, []);

  const handleRegister = async () => {
    setRegistering(true);
    setError(null);
    try {
      const res = await authClient.passkey.addPasskey({
        name: `Agent Auth Key ${new Date().toLocaleDateString()}`,
      });
      if (res?.error) {
        setError(res.error.message ?? "Registration failed");
      } else {
        await fetchPasskeys();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Passkey registration cancelled or failed";
      if (!msg.includes("cancelled") && !msg.includes("abort")) {
        setError(msg);
      }
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">Your passkeys</p>
          <p className="mt-1 text-xs text-muted">
            Register at least one passkey to enable biometric approvals.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRegister}
          disabled={registering}
          className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {registering ? "Registering…" : "+ Add Passkey"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {loading ? (
        <div className="mt-3 h-8 w-full animate-pulse rounded bg-white/5" />
      ) : passkeys.length === 0 ? (
        <p className="mt-3 text-xs text-yellow-400/80">
          No passkeys registered. WebAuthn approvals will fail until you add one.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {passkeys.map((pk) => (
            <li key={pk.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm text-white">{pk.name ?? "Unnamed passkey"}</p>
                {pk.createdAt && (
                  <p className="text-[11px] text-muted">
                    Added {new Date(pk.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-muted">FIDO2</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
