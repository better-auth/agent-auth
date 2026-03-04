"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BetterAuthLogo } from "@/components/icons/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, useSession } from "@/lib/auth/client";

export default function OnboardingPage() {
	const router = useRouter();
	const { data: session, isPending } = useSession();
	const [orgName, setOrgName] = useState("");
	const [orgSlug, setOrgSlug] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		if (!isPending && !session?.user) {
			router.push("/");
		}
	}, [isPending, session, router]);
	if (isPending || !session?.user) {
		return null;
	}
	const handleNameChange = (value: string) => {
		setOrgName(value);
		setOrgSlug(
			value
				.toLowerCase()
				.replace(/[^a-z0-9-]/g, "-")
				.replace(/-+/g, "-")
				.replace(/^-|-$/g, ""),
		);
	};
	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);
		try {
			const result = await authClient.organization.create({
				name: orgName,
				slug: orgSlug,
			});
			if (result.error) {
				setError(result.error.message || "Failed to create organization");
				setIsLoading(false);
				return;
			}
			await authClient.organization.setActive({
				organizationId: result.data!.id,
			});
			router.push(`/dashboard/${orgSlug}`);
		} catch {
			setError("An unexpected error occurred");
			setIsLoading(false);
		}
	};
	return (
		<div className="min-h-dvh flex items-center justify-center bg-background px-4">
			<div className="w-full max-w-md">
				<div className="flex flex-col items-center mb-8">
					<BetterAuthLogo className="h-6 w-auto mb-4" />
					<h1 className="text-xl font-medium tracking-tight">
						Create your organization
					</h1>
					<p className="mt-1.5 text-sm text-muted-foreground text-center max-w-xs">
						Organizations let you manage connections and agents with your team.
					</p>
				</div>
				{error && (
					<div className="mb-4 p-3 border border-destructive/30 bg-destructive/5 rounded-lg">
						<p className="text-sm text-destructive">{error}</p>
					</div>
				)}
				<form onSubmit={handleCreate} className="space-y-4">
					<div>
						<Label htmlFor="org-name" className="text-xs">
							Organization name
						</Label>
						<Input
							id="org-name"
							type="text"
							value={orgName}
							onChange={(e) => handleNameChange(e.target.value)}
							required
							placeholder="Acme Inc"
							disabled={isLoading}
							className="mt-1"
						/>
					</div>
					<div>
						<Label htmlFor="org-slug" className="text-xs">
							URL slug
						</Label>
						<div className="flex items-center mt-1">
							<span className="text-xs text-muted-foreground mr-1.5 font-mono">
								/dashboard/
							</span>
							<Input
								id="org-slug"
								type="text"
								value={orgSlug}
								onChange={(e) =>
									setOrgSlug(
										e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
									)
								}
								required
								placeholder="acme-inc"
								disabled={isLoading}
								pattern="[a-z0-9-]+"
								minLength={2}
							/>
						</div>
					</div>
					<Button type="submit" className="w-full" disabled={isLoading}>
						{isLoading ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Creating...
							</>
						) : (
							"Create Organization"
						)}
					</Button>
				</form>
			</div>
		</div>
	);
}
