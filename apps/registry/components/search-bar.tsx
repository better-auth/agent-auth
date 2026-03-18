"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBar({
	defaultValue = "",
	size = "default",
	autoFocus = false,
}: {
	defaultValue?: string;
	size?: "default" | "large";
	autoFocus?: boolean;
}) {
	const router = useRouter();
	const [query, setQuery] = useState(defaultValue);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (query.trim()) {
			router.push(`/search?q=${encodeURIComponent(query.trim())}`);
		}
	};

	const isLarge = size === "large";

	return (
		<form onSubmit={handleSubmit} className="w-full">
			<div className="relative group">
				<Search
					className={`absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/30 group-focus-within:text-foreground/50 transition-colors ${
						isLarge ? "h-5 w-5" : "h-4 w-4"
					}`}
				/>
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder='Search by intent (§6.11)... e.g. "deploy websites", "send emails"'
					autoFocus={autoFocus}
					className={`w-full bg-background border border-foreground/[0.08] placeholder:text-foreground/30 text-foreground font-mono focus:outline-none focus:border-foreground/20 transition-all ${
						isLarge ? "pl-12 pr-16 py-3.5 text-sm" : "pl-10 pr-14 py-2.5 text-xs"
					}`}
				/>
				<kbd
					className={`absolute right-3.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-1 border border-foreground/10 bg-foreground/[0.04] px-1.5 py-0.5 font-mono text-foreground/30 ${
						isLarge ? "text-[10px]" : "text-[9px]"
					}`}
				>
					Enter
				</kbd>
			</div>
		</form>
	);
}
