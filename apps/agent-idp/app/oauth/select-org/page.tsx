"use client";

import { Building2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";

interface Org {
	id: string;
	name: string;
	slug: string | null;
}

export default function SelectOrgPage() {
	const [orgs, setOrgs] = useState<Org[]>([]);
	const [loading, setLoading] = useState(true);
	const [selecting, setSelecting] = useState<string | null>(null);

	useEffect(() => {
		authClient.organization
			.list()
			.then(({ data }) => {
				setOrgs((data as Org[]) ?? []);
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	const handleSelect = async (orgId: string) => {
		setSelecting(orgId);
		await authClient.organization.setActive({ organizationId: orgId });
		await authClient.oauth2.continue({ postLogin: true });
	};

	if (loading) {
		return (
			<div className="flex min-h-dvh items-center justify-center p-4">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="flex min-h-dvh items-center justify-center p-4">
			<div className="w-full max-w-md border border-border bg-card">
				<div className="p-6 pb-4 text-center border-b border-border/50">
					<h1 className="text-lg font-medium tracking-tight">
						Select Organization
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Choose which organization to authorize for this connection.
					</p>
				</div>
				<div className="p-4 space-y-1.5">
					{orgs.map((org) => (
						<button
							key={org.id}
							type="button"
							onClick={() => handleSelect(org.id)}
							disabled={selecting !== null}
							className="flex items-center gap-3 w-full rounded-md border border-border/50 px-4 py-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
						>
							<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
								<Building2 className="h-4 w-4 text-muted-foreground" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium truncate">{org.name}</p>
								{org.slug && (
									<p className="text-xs text-muted-foreground truncate">
										{org.slug}
									</p>
								)}
							</div>
							{selecting === org.id && (
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							)}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
