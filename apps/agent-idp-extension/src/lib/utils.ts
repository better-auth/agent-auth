import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatRelativeTime(d: string | Date | null): string {
	if (!d) return "Never";
	const date = d instanceof Date ? d : new Date(d);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	if (diffSec < 60) return "Just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHour < 24) return `${diffHour}h ago`;
	return date.toLocaleDateString();
}

export function formatTimeLeft(seconds: number): string {
	if (seconds <= 0) return "Expired";
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}
