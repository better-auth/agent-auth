import { CheckCircle, ExternalLink, Shield } from "lucide-react";
import Link from "next/link";

interface ProviderCardProps {
  name: string;
  displayName: string;
  description: string;
  categories: string[];
  verified: boolean;
  modes: string[];
  url: string;
}

export function ProviderCard({
  name,
  displayName,
  description,
  categories,
  verified,
  modes,
  url,
}: ProviderCardProps) {
  const providerPath = `/providers/${encodeURIComponent(name)}`;

  return (
    <Link
      href={providerPath}
      className="group block border border-foreground/[0.08] bg-foreground/[0.02] hover:bg-foreground/[0.04] hover:border-foreground/[0.14] transition-all"
    >
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-foreground truncate">{displayName}</h3>
              {verified && <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />}
            </div>
            <p className="text-[11px] font-mono text-foreground/40 mt-0.5">{name}</p>
          </div>
          <ExternalLink className="h-3.5 w-3.5 text-foreground/20 group-hover:text-foreground/40 transition-colors shrink-0 mt-0.5" />
        </div>

        <p className="text-xs text-foreground/55 leading-relaxed line-clamp-2">{description}</p>

        <div className="flex items-center gap-2 flex-wrap">
          {modes.map((mode) => (
            <span
              key={mode}
              className="inline-flex items-center gap-1 text-[10px] font-mono text-foreground/35 border border-foreground/[0.06] px-1.5 py-0.5"
            >
              <Shield className="h-2.5 w-2.5" />
              {mode}
            </span>
          ))}
          {categories.slice(0, 3).map((cat) => (
            <span
              key={cat}
              className="text-[10px] font-mono text-foreground/35 border border-foreground/[0.06] px-1.5 py-0.5"
            >
              {cat}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-foreground/[0.06] px-5 py-2.5">
        <span className="text-[10px] font-mono text-foreground/30 truncate block">{url}</span>
      </div>
    </Link>
  );
}
