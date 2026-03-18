import {
	Check,
	Copy,
	Loader2,
	Monitor,
	Plus,
	Power,
	RefreshCw,
	Terminal,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { createHost, getHost, listHosts, revokeHost } from "@/lib/api";
import type { CreatedHost, Host } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
	active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	pending_enrollment: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
	expired: "bg-muted text-muted-foreground",
	revoked: "bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<string, string> = {
	pending_enrollment: "pending",
};

function HostCard({
	host,
	onRevoked,
}: {
	host: Host;
	onRevoked: (id: string) => void;
}) {
	const [revoking, setRevoking] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleRevoke = async () => {
		setError(null);
		setRevoking(true);
		const res = await revokeHost(host.id);
		if (res.error) {
			setError(res.error);
			setRevoking(false);
		} else {
			onRevoked(host.id);
		}
	};

	const canRevoke = host.status !== "revoked" && host.status !== "rejected";

	return (
		<div className="border border-border rounded-sm overflow-hidden bg-card/50">
			<div className="px-3 py-2.5 flex items-center justify-between">
				<div className="flex items-center gap-2.5 min-w-0 flex-1">
					<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-muted/60">
						<Monitor className="h-3.5 w-3.5 text-muted-foreground" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<p className="font-medium text-xs truncate">
								{host.name || "Unnamed Device"}
							</p>
							<span
								className={cn(
									"text-[9px] font-medium px-1.5 py-0.5 rounded-sm shrink-0 uppercase tracking-wide",
									STATUS_STYLES[host.status] ?? STATUS_STYLES.expired,
								)}
							>
								{STATUS_LABELS[host.status] ?? host.status}
							</span>
						</div>
						<p className="text-[11px] text-muted-foreground">
							{host.scopes.length > 0
								? `${host.scopes.length} scope${host.scopes.length > 1 ? "s" : ""}`
								: "No scopes"}{" "}
							&middot; {formatRelativeTime(host.lastUsedAt)}
						</p>
					</div>
				</div>

				{canRevoke && (
					<Button
						variant="ghost"
						size="xs"
						className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 ml-2"
						onClick={handleRevoke}
						disabled={revoking}
						title="Revoke device"
					>
						{revoking ? (
							<Loader2 className="h-3 w-3 animate-spin" />
						) : (
							<Power className="h-3 w-3" />
						)}
					</Button>
				)}
			</div>

			{host.scopes.length > 0 && (
				<div className="px-3 pb-2.5">
					<div className="flex flex-wrap gap-1">
						{host.scopes.slice(0, 5).map((s) => (
							<span
								key={s}
								className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded-sm text-muted-foreground"
							>
								{s}
							</span>
						))}
						{host.scopes.length > 5 && (
							<span className="text-[10px] text-muted-foreground px-1">
								+{host.scopes.length - 5} more
							</span>
						)}
					</div>
				</div>
			)}

			{error && (
				<div className="mx-3 mb-2.5 p-2 border border-destructive/30 bg-destructive/5 text-[11px] text-destructive rounded-sm">
					{error}
				</div>
			)}
		</div>
	);
}

function ConnectDeviceView({
	onDone,
	onCancel,
}: {
	onDone: () => void;
	onCancel: () => void;
}) {
	const [step, setStep] = useState<"form" | "token">("form");
	const [name, setName] = useState("");
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [created, setCreated] = useState<CreatedHost | null>(null);
	const [copied, setCopied] = useState(false);
	const [enrolled, setEnrolled] = useState(false);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		return () => {
			if (pollRef.current) clearInterval(pollRef.current);
		};
	}, []);

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setCreating(true);
		const res = await createHost(name.trim() || undefined);
		setCreating(false);
		if (res.error) {
			setError(res.error);
			return;
		}
		if (!res.data) {
			setError("Unexpected response");
			return;
		}
		setCreated(res.data);
		setStep("token");

		if (res.data.status === "pending_enrollment") {
			pollRef.current = setInterval(async () => {
				const hostRes = await getHost(res.data!.hostId);
				if (hostRes.data?.status === "active") {
					if (pollRef.current) clearInterval(pollRef.current);
					setEnrolled(true);
				}
			}, 2000);
		}
	};

	const handleCopy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {}
	};

	if (enrolled) {
		return (
			<div className="p-4 flex flex-col items-center gap-4 text-center">
				<div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
					<Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
				</div>
				<div>
					<p className="text-sm font-medium">Device Connected</p>
					<p className="text-[11px] text-muted-foreground mt-1">
						{name || "Your device"} has been enrolled successfully.
					</p>
				</div>
				<Button size="sm" onClick={onDone}>
					Done
				</Button>
			</div>
		);
	}

	if (step === "token" && created?.enrollmentToken) {
		return (
			<div className="p-4 space-y-4">
				<div className="text-center">
					<p className="text-sm font-medium">Enroll Your Device</p>
					<p className="text-[11px] text-muted-foreground mt-1">
						Run this command on the device you want to connect. We'll detect it
						automatically.
					</p>
				</div>

				<div className="space-y-2">
					<label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
						Enrollment Token
					</label>
					<div className="flex items-center gap-1.5 p-2 rounded-sm border border-border bg-muted/30">
						<code className="flex-1 text-[11px] font-mono break-all select-all text-foreground">
							{created.enrollmentToken}
						</code>
						<Button
							variant="ghost"
							size="xs"
							className="shrink-0"
							onClick={() => handleCopy(created.enrollmentToken!)}
						>
							{copied ? (
								<Check className="h-3 w-3 text-emerald-500" />
							) : (
								<Copy className="h-3 w-3" />
							)}
						</Button>
					</div>
				</div>

				<div className="space-y-1.5">
					<label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
						CLI Command
					</label>
					<button
						type="button"
						onClick={() =>
							handleCopy(
								`npx @better-auth/agent-auth enroll --token ${created.enrollmentToken}`,
							)
						}
						className="w-full flex items-center gap-2 p-2.5 rounded-sm border border-border bg-muted/30 hover:bg-muted/50 transition-colors text-left cursor-pointer group"
					>
						<Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
						<code className="flex-1 text-[10px] font-mono text-foreground break-all">
							npx @better-auth/agent-auth enroll --token{" "}
							<span className="text-muted-foreground">{"<token>"}</span>
						</code>
						<Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
					</button>
				</div>

				<div className="flex items-center gap-2 justify-center text-[11px] text-muted-foreground">
					<Loader2 className="h-3 w-3 animate-spin" />
					<span>Waiting for device to enroll...</span>
				</div>

				<Button
					variant="ghost"
					size="sm"
					className="w-full text-muted-foreground"
					onClick={onCancel}
				>
					Cancel
				</Button>
			</div>
		);
	}

	if (step === "token" && created && !created.enrollmentToken) {
		return (
			<div className="p-4 flex flex-col items-center gap-4 text-center">
				<div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
					<Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
				</div>
				<div>
					<p className="text-sm font-medium">Device Created</p>
					<p className="text-[11px] text-muted-foreground mt-1">
						Host is active — no enrollment needed.
					</p>
				</div>
				<Button size="sm" onClick={onDone}>
					Done
				</Button>
			</div>
		);
	}

	return (
		<form onSubmit={handleCreate} className="p-4 space-y-4">
			<div className="text-center">
				<p className="text-sm font-medium">Connect a Device</p>
				<p className="text-[11px] text-muted-foreground mt-1">
					Create a host entry and get an enrollment token for your device.
				</p>
			</div>

			{error && (
				<div className="p-2 border border-destructive/30 bg-destructive/5 text-[11px] text-destructive rounded-sm">
					{error}
				</div>
			)}

			<div className="space-y-1.5">
				<label
					htmlFor="device-name"
					className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider"
				>
					Device Name
				</label>
				<input
					id="device-name"
					type="text"
					placeholder="e.g. Cursor on MacBook-Pro"
					value={name}
					onChange={(e) => setName(e.target.value)}
					className="flex h-8 w-full rounded-sm border border-input bg-background px-3 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-colors"
					autoFocus
				/>
			</div>

			<div className="flex gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="flex-1"
					onClick={onCancel}
				>
					Cancel
				</Button>
				<Button type="submit" size="sm" className="flex-1" disabled={creating}>
					{creating ? (
						<Loader2 className="h-3 w-3 animate-spin" />
					) : (
						<Plus className="h-3 w-3" />
					)}
					Create
				</Button>
			</div>
		</form>
	);
}

export function Devices() {
	const [hosts, setHosts] = useState<Host[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<"active" | "all">("active");
	const [showConnect, setShowConnect] = useState(false);

	const fetchHosts = useCallback(async (showLoading = false) => {
		if (showLoading) setLoading(true);
		setError(null);
		try {
			const res = await listHosts();
			if (res.error) {
				setError(res.error);
			} else {
				setHosts(res.data ?? []);
			}
		} catch {
			setError("Failed to load devices");
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		void fetchHosts(true);
	}, [fetchHosts]);

	const handleRevoked = (id: string) => {
		setHosts((prev) =>
			prev.map((h) => (h.id === id ? { ...h, status: "revoked" } : h)),
		);
	};

	if (showConnect) {
		return (
			<ConnectDeviceView
				onDone={() => {
					setShowConnect(false);
					fetchHosts(false);
				}}
				onCancel={() => setShowConnect(false)}
			/>
		);
	}

	const filtered =
		filter === "active"
			? hosts.filter(
					(h) => h.status === "active" || h.status === "pending_enrollment",
				)
			: hosts;

	return (
		<div className="p-3 space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex gap-0.5 p-0.5 bg-muted/50 rounded-sm">
					{(["active", "all"] as const).map((f) => (
						<button
							key={f}
							onClick={() => setFilter(f)}
							className={cn(
								"px-2.5 py-1 text-[11px] font-medium rounded-sm transition-all capitalize cursor-pointer",
								filter === f
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{f}{" "}
							{f === "active" && (
								<span className="text-muted-foreground ml-0.5">
									{
										hosts.filter(
											(h) =>
												h.status === "active" ||
												h.status === "pending_enrollment",
										).length
									}
								</span>
							)}
						</button>
					))}
				</div>
				<div className="flex items-center gap-1">
					<Button variant="ghost" size="xs" onClick={() => fetchHosts(false)}>
						<RefreshCw className="h-3 w-3" />
					</Button>
					<Button size="xs" onClick={() => setShowConnect(true)}>
						<Plus className="h-3 w-3" />
						Connect
					</Button>
				</div>
			</div>

			{error && (
				<div className="p-2 border border-destructive/30 bg-destructive/5 text-[11px] text-destructive rounded-sm">
					{error}
				</div>
			)}

			{loading ? (
				<div className="flex items-center justify-center py-10">
					<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
				</div>
			) : filtered.length === 0 ? (
				<div className="border border-dashed border-border rounded-sm py-10 text-center">
					<Monitor className="h-5 w-5 mx-auto mb-2 text-muted-foreground/30" />
					<p className="text-xs text-muted-foreground mb-3">
						{filter === "active" ? "No connected devices" : "No devices found"}
					</p>
					<Button
						size="xs"
						variant="outline"
						onClick={() => setShowConnect(true)}
					>
						<Plus className="h-3 w-3" />
						Connect a Device
					</Button>
				</div>
			) : (
				<div className="space-y-2">
					{filtered.map((host) => (
						<HostCard key={host.id} host={host} onRevoked={handleRevoked} />
					))}
				</div>
			)}
		</div>
	);
}
