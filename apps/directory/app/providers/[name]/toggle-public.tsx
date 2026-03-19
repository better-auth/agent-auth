"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TogglePublicButton({
  providerName,
  initialPublic,
}: {
  providerName: string;
  initialPublic: boolean;
}) {
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/my-providers/${encodeURIComponent(providerName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public: !isPublic }),
      });
      if (res.ok) {
        setIsPublic(!isPublic);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 border border-foreground/[0.08] bg-foreground/[0.03] px-4 py-3 mb-6">
      {isPublic ? (
        <Eye className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
      ) : (
        <EyeOff className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
      )}
      <p className="text-[11px] font-mono text-foreground/45 flex-1">
        {isPublic
          ? "This provider is public and visible to everyone."
          : "This provider is not public. Only you can see this page."}
      </p>
      <button
        onClick={toggle}
        disabled={loading}
        className={`shrink-0 inline-flex items-center gap-1.5 disabled:opacity-40 px-3 py-1.5 transition-all text-[11px] font-mono ${
          isPublic
            ? "border border-foreground/10 text-foreground/45 hover:border-foreground/20 hover:text-foreground/65"
            : "bg-foreground text-background hover:opacity-90"
        }`}
      >
        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
        {isPublic ? "Make private" : "Make public"}
      </button>
    </div>
  );
}
