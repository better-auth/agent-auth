"use client";

import { LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "@/lib/auth/client";

export default function UserProfile({ orgSlug }: { orgSlug: string }) {
	const [isMounted, setIsMounted] = useState(false);
	const { data: session } = useSession();
	const router = useRouter();

	useEffect(() => {
		setIsMounted(true);
	}, []);

	if (!isMounted || !session?.user) return null;

	const user = session.user;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="px-3 py-2 flex items-center gap-2 hover:bg-accent/50 transition-colors rounded-md">
				<Avatar className="cursor-pointer size-6">
					<AvatarImage
						src={user.image || undefined}
						alt={user.name || user.email}
					/>
					<AvatarFallback className="text-[10px] bg-foreground/[0.06]">
						{user.name
							? user.name
									.split(" ")
									.map((n) => n[0])
									.join("")
									.toUpperCase()
							: user.email[0].toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<span className="text-sm max-w-[120px] truncate hidden sm:inline">
					{user.name || user.email}
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuItem
					className="cursor-pointer"
					onClick={() => router.push(`/dashboard/${orgSlug}/settings`)}
				>
					<Settings className="mr-2 h-3.5 w-3.5" />
					<span className="text-sm">Settings</span>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="cursor-pointer"
					onClick={async () => {
						await signOut({
							fetchOptions: {
								onSuccess: () => {
									router.push("/");
									router.refresh();
								},
							},
						});
					}}
				>
					<LogOut className="mr-2 h-3.5 w-3.5" />
					<span className="text-sm">Sign out</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
