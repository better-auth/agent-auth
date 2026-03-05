"use client";

import { MessageSquare, Sparkles } from "lucide-react";
import { useChatDialog } from "@/components/chat-dialog";

export function OverviewChatDialog() {
	const { openChat } = useChatDialog();

	return (
		<button
			type="button"
			onClick={openChat}
			className="group block w-full text-left border border-border/60 rounded-lg p-4 hover:border-foreground/15 hover:bg-foreground/[0.02] transition-all cursor-pointer"
		>
			<div className="flex items-center gap-3 mb-3">
				<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/[0.06] group-hover:bg-foreground/10 transition-colors">
					<MessageSquare className="h-4 w-4 text-muted-foreground/70 group-hover:text-foreground transition-colors" />
				</div>
				<div className="flex-1 min-w-0">
					<p className="text-[13px] font-medium">Agent Chat</p>
					<p className="text-[10px] text-muted-foreground/60">
						Interactive demo
					</p>
				</div>
				<Sparkles className="h-3.5 w-3.5 text-transparent group-hover:text-muted-foreground/50 transition-colors" />
			</div>
			<p className="text-[11px] text-muted-foreground/70 leading-relaxed">
				Chat with an AI agent that uses your connected tools. Test scopes,
				approvals, and tool calls in real time.
			</p>
		</button>
	);
}
