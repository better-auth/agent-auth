"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
	ArrowUp,
	Bot,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	CircleAlert,
	ShieldCheck,
	Terminal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlight } from "sugar-high";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ChatClient({ orgSlug }: { orgSlug: string }) {
	const { messages, sendMessage, status, error } = useChat({
		id: "agent-chat",
	});
	const [input, setInput] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const isLoading = status === "submitted" || status === "streaming";

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const handleSend = useCallback(() => {
		if (!input.trim() || isLoading) return;
		const text = input;
		setInput("");
		sendMessage({ text });
	}, [input, isLoading, sendMessage]);

	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	return (
		<div className="flex flex-col h-[calc(100dvh-2rem)] py-4">
			<div className="flex-1 overflow-y-auto pr-2 -mr-2">
				{messages.length === 0 && <EmptyState />}

				<div className="space-y-5">
					{messages.map((message) => (
						<MessageBubble key={message.id} message={message} />
					))}
				</div>

				{status === "submitted" && <ThinkingIndicator />}

				{error && (
					<div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
						<CircleAlert className="h-4 w-4 mt-0.5 shrink-0" />
						<span>{error.message}</span>
					</div>
				)}

				<div ref={messagesEndRef} className="h-4" />
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					handleSend();
				}}
				className="mt-2 flex items-end gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 shadow-xs focus-within:border-foreground/15 focus-within:shadow-sm transition-all"
			>
				<textarea
					ref={inputRef}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={onKeyDown}
					placeholder="Message the agent..."
					rows={1}
					className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/40 max-h-32 min-h-6 leading-relaxed"
					style={{
						height: "auto",
						overflow: input.split("\n").length > 3 ? "auto" : "hidden",
					}}
					onInput={(e) => {
						const target = e.target as HTMLTextAreaElement;
						target.style.height = "auto";
						target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
					}}
				/>
				<Button
					type="submit"
					size="icon"
					disabled={!input.trim() || isLoading}
					className="h-7 w-7 shrink-0 rounded-md"
				>
					<ArrowUp className="h-3.5 w-3.5" />
				</Button>
			</form>
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-12">
			<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/3 border border-border/50">
				<Bot className="h-5 w-5 text-muted-foreground/50" />
			</div>
			<p className="text-xs text-muted-foreground/50">Ask the agent anything</p>
		</div>
	);
}

function ThinkingIndicator() {
	return (
		<div className="flex items-start gap-2.5 mt-5 animate-fade-in">
			<AgentAvatar pulse />
			<div className="flex items-center gap-1.5 pt-2">
				<span className="chat-dot" />
				<span className="chat-dot [animation-delay:150ms]" />
				<span className="chat-dot [animation-delay:300ms]" />
			</div>
		</div>
	);
}

function AgentAvatar({ pulse }: { pulse?: boolean }) {
	return (
		<div
			className={cn(
				"flex h-6 w-6 items-center justify-center rounded-md bg-foreground/6 border border-border/50 shrink-0",
				pulse && "animate-pulse",
			)}
		>
			<Bot className="h-3 w-3 text-muted-foreground/70" />
		</div>
	);
}

function MessageBubble({ message }: { message: UIMessage }) {
	const isUser = message.role === "user";

	if (isUser) {
		const text = message.parts.find((p) => p.type === "text") as
			| { type: "text"; text: string }
			| undefined;
		return (
			<div className="flex justify-end animate-fade-in">
				<div className="max-w-[80%] rounded-lg bg-foreground text-background px-3.5 py-2 text-sm leading-relaxed">
					{text?.text}
				</div>
			</div>
		);
	}

	return (
		<div className="flex items-start gap-2.5 animate-fade-in">
			<AgentAvatar />
			<div className="flex-1 min-w-0 space-y-2 pt-0.5">
				{message.parts.map((part, i) => {
					if (part.type === "text" && part.text) {
						return (
							<MarkdownContent
								key={`${message.id}-text-${i}`}
								content={part.text}
							/>
						);
					}

					if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
						const toolPart = part as {
							type: string;
							toolName?: string;
							toolCallId?: string;
							state: string;
							input?: unknown;
							output?: unknown;
						};
						const toolName =
							toolPart.toolName ?? part.type.replace(/^tool-/, "");
						return (
							<ToolCard
								key={`${message.id}-tool-${toolPart.toolCallId ?? i}`}
								toolName={toolName}
								state={toolPart.state}
								input={toolPart.input}
								output={toolPart.output}
							/>
						);
					}

					return null;
				})}
			</div>
		</div>
	);
}

function MarkdownContent({ content }: { content: string }) {
	return (
		<div className="prose-chat text-sm leading-relaxed">
			<Markdown
				remarkPlugins={[remarkGfm]}
				components={{
					p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
					strong: ({ children }) => (
						<strong className="font-semibold">{children}</strong>
					),
					em: ({ children }) => <em className="italic">{children}</em>,
					h1: ({ children }) => (
						<h3 className="text-base font-semibold mt-4 mb-2">{children}</h3>
					),
					h2: ({ children }) => (
						<h4 className="text-sm font-semibold mt-3 mb-1.5">{children}</h4>
					),
					h3: ({ children }) => (
						<h5 className="text-sm font-medium mt-2.5 mb-1">{children}</h5>
					),
					ul: ({ children }) => (
						<ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>
					),
					ol: ({ children }) => (
						<ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>
					),
					li: ({ children }) => (
						<li className="text-sm leading-relaxed">{children}</li>
					),
					a: ({ href, children }) => (
						<a
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							className="text-foreground underline underline-offset-2 decoration-foreground/30 hover:decoration-foreground/60 transition-colors"
						>
							{children}
						</a>
					),
					blockquote: ({ children }) => (
						<blockquote className="border-l-2 border-border pl-3 my-2 text-muted-foreground italic">
							{children}
						</blockquote>
					),
					code: ({ className, children }) => {
						const isBlock = className?.includes("language-");
						if (isBlock) {
							const lang = className?.replace("language-", "") ?? "";
							return (
								<CodeBlock language={lang}>
									{String(children).replace(/\n$/, "")}
								</CodeBlock>
							);
						}
						return (
							<code className="rounded-sm bg-foreground/6 px-1.5 py-0.5 text-[13px] font-mono">
								{children}
							</code>
						);
					},
					pre: ({ children }) => <>{children}</>,
					table: ({ children }) => (
						<div className="my-2 overflow-x-auto rounded-md border border-border/50">
							<table className="w-full text-xs">{children}</table>
						</div>
					),
					thead: ({ children }) => (
						<thead className="bg-muted/40 border-b border-border/50">
							{children}
						</thead>
					),
					th: ({ children }) => (
						<th className="px-3 py-1.5 text-left font-medium text-muted-foreground">
							{children}
						</th>
					),
					td: ({ children }) => (
						<td className="px-3 py-1.5 border-t border-border/30">
							{children}
						</td>
					),
					hr: () => <hr className="my-3 border-border/40" />,
				}}
			>
				{content}
			</Markdown>
		</div>
	);
}

function CodeBlock({
	children,
	language,
}: {
	children: string;
	language: string;
}) {
	const html = useMemo(() => highlight(children), [children]);
	return (
		<div className="my-2 rounded-md border border-border/40 bg-card overflow-hidden">
			{language && (
				<div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/30 text-[10px] text-muted-foreground/60 font-mono uppercase tracking-wider">
					<Terminal className="h-3 w-3" />
					{language}
				</div>
			)}
			<pre className="p-3 overflow-x-auto text-[13px] leading-relaxed">
				<code dangerouslySetInnerHTML={{ __html: html }} />
			</pre>
		</div>
	);
}

function ToolCard({
	toolName,
	state,
	input,
	output,
}: {
	toolName: string;
	state: string;
	input?: unknown;
	output?: unknown;
}) {
	const [expanded, setExpanded] = useState(false);
	const displayName = toolName.replace(/__/g, ".");

	const isComplete =
		state === "output-available" ||
		state === "result" ||
		state === "error" ||
		state === "output-denied";
	const isError = state === "error" || state === "output-denied";
	const isRunning = !isComplete;

	const isScopeTool =
		displayName === "request_scope" || displayName === "check_scope_status";

	return (
		<div
			className={cn(
				"rounded-md border text-xs overflow-hidden transition-all",
				isRunning
					? "border-foreground/10 bg-foreground/2 tool-running"
					: isError
						? "border-destructive/20 bg-destructive/2"
						: "border-border/40 bg-card",
			)}
		>
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex items-center gap-2 w-full px-2.5 py-1.5 hover:bg-foreground/2 transition-colors text-left"
			>
				<div
					className={cn(
						"flex h-4.5 w-4.5 items-center justify-center rounded shrink-0",
						isRunning
							? "bg-foreground/10"
							: isError
								? "bg-destructive/10"
								: isScopeTool
									? "bg-amber-500/10"
									: "bg-emerald-500/10",
					)}
				>
					{isRunning ? (
						<div className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-pulse" />
					) : isError ? (
						<CircleAlert className="h-2.5 w-2.5 text-destructive" />
					) : isScopeTool ? (
						<ShieldCheck className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />
					) : (
						<CheckCircle2 className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
					)}
				</div>

				<div className="flex-1 min-w-0">
					<span className="font-mono text-[11px] text-foreground/60">
						{displayName}
					</span>
					{isRunning && (
						<span className="ml-2 text-[10px] text-muted-foreground/40">
							running
						</span>
					)}
				</div>

				{isComplete &&
					(expanded ? (
						<ChevronDown className="h-3 w-3 text-muted-foreground/30 shrink-0" />
					) : (
						<ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
					))}
			</button>

			{expanded && isComplete && (
				<div className="border-t border-border/30 divide-y divide-border/20">
					{input != null &&
						typeof input === "object" &&
						Object.keys(input as object).length > 0 && (
							<div className="px-2.5 py-2">
								<p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-1">
									Input
								</p>
								<pre className="text-[11px] font-mono text-muted-foreground leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
									{JSON.stringify(input, null, 2)}
								</pre>
							</div>
						)}
					{output != null && (
						<div className="px-2.5 py-2">
							<p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-1">
								Output
							</p>
							<pre className="text-[11px] font-mono text-muted-foreground leading-relaxed overflow-x-auto whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
								{formatOutput(output)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function formatOutput(output: unknown): string {
	if (typeof output === "string") {
		try {
			return JSON.stringify(JSON.parse(output), null, 2);
		} catch {
			return output;
		}
	}
	return JSON.stringify(output, null, 2);
}
