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
		<form className="w-full" onSubmit={handleSubmit}>
			<div className="group relative">
				<Search
					className={`absolute top-1/2 left-3.5 -translate-y-1/2 text-foreground/30 transition-colors group-focus-within:text-foreground/50 ${
						isLarge ? "h-5 w-5" : "h-4 w-4"
					}`}
				/>
				<input
					autoFocus={autoFocus}
					className={`w-full border border-foreground/[0.08] bg-foreground/[0.03] font-mono text-foreground transition-all placeholder:text-foreground/30 focus:border-foreground/20 focus:bg-foreground/[0.05] focus:outline-none ${
						isLarge
							? "py-3.5 pr-16 pl-12 text-sm"
							: "py-2.5 pr-14 pl-10 text-xs"
					}`}
					onChange={(e) => setQuery(e.target.value)}
					placeholder='Search by intent... e.g. "deploy websites", "send emails"'
					type="text"
					value={query}
				/>
				<kbd
					className={`absolute top-1/2 right-3.5 hidden -translate-y-1/2 items-center gap-1 border border-foreground/10 bg-foreground/[0.04] px-1.5 py-0.5 font-mono text-foreground/30 sm:inline-flex ${
						isLarge ? "text-[10px]" : "text-[9px]"
					}`}
				>
					Enter
				</kbd>
			</div>
		</form>
	);
}
