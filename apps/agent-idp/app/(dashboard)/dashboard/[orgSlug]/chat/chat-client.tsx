"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
	ArrowUp,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	CircleAlert,
	RotateCcw,
	ShieldCheck,
	Square,
	Terminal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { highlight } from "sugar-high";
import { AgentBotIcon } from "@/components/icons/agent-bot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ChatClient({
	orgSlug,
	className,
	visible = true,
}: {
	orgSlug: string;
	className?: string;
	visible?: boolean;
}) {
	const sessionIdRef = useRef(crypto.randomUUID());
	const {
		messages,
		setMessages,
		sendMessage,
		status,
		error,
		stop,
		clearError,
	} = useChat({
		id: "agent-chat",
		onError: (err) => {
			console.error("[ChatClient] Stream error:", err.message);
		},
	});
	const [input, setInput] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const isLoading = status === "submitted" || status === "streaming";

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, status]);

	useEffect(() => {
		if (visible) {
			inputRef.current?.focus();
		}
	}, [visible]);

	const handleSend = useCallback(() => {
		if (!input.trim() || isLoading) return;
		if (error) clearError();
		const text = input;
		setInput("");
		sendMessage({ text }, { body: { sessionId: sessionIdRef.current } });
	}, [input, isLoading, sendMessage, error, clearError]);

	const handleClear = useCallback(() => {
		setMessages([]);
		sessionIdRef.current = crypto.randomUUID();
		if (error) clearError();
		inputRef.current?.focus();
	}, [setMessages, error, clearError]);

	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	return (
		<div className={cn("flex flex-col h-[calc(100dvh-2rem)] py-4", className)}>
			<div className="flex-1 overflow-y-auto no-scrollbar">
				{messages.length === 0 && <EmptyState />}

				<div className="space-y-4">
					{messages.map((message) => (
						<MessageBubble key={message.id} message={message} />
					))}
				</div>

				{(status === "submitted" || status === "streaming") &&
					messages[messages.length - 1]?.role !== "assistant" && (
						<ThinkingIndicator />
					)}

				{status === "error" && error && (
					<div className="mt-4 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">
						<CircleAlert className="h-4 w-4 mt-0.5 shrink-0" />
						<div className="min-w-0">
							<p className="font-medium text-[13px]">
								{error.message || "Something went wrong"}
							</p>
							<p className="text-xs text-destructive/60 mt-1">
								Try again or check that the AI provider API key is configured.
							</p>
						</div>
					</div>
				)}

				<div ref={messagesEndRef} className="h-4" />
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (isLoading) {
						stop();
					} else {
						handleSend();
					}
				}}
				className="mt-3 shrink-0 rounded-xl border border-border/50 bg-muted/30 focus-within:bg-muted/50 focus-within:border-foreground/10 transition-all"
			>
				<div className="px-4 pt-3 pb-2">
					<textarea
						ref={inputRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={onKeyDown}
						placeholder="Message the agent..."
						rows={1}
						className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/40 max-h-32 min-h-6 leading-relaxed"
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
				</div>
				<div className="flex items-center justify-between px-3 pb-2.5">
					<div className="flex items-center gap-2">
						{messages.length > 0 && !isLoading && (
							<button
								type="button"
								onClick={handleClear}
								className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors pl-1"
							>
								<RotateCcw className="h-3 w-3" />
								New chat
							</button>
						)}
						{messages.length === 0 && (
							<p className="text-[10px] text-muted-foreground/40 pl-1">
								Enter to send
							</p>
						)}
						{isLoading && (
							<p className="text-[10px] text-muted-foreground/40 pl-1">
								Generating...
							</p>
						)}
					</div>
					{isLoading ? (
						<Button
							type="button"
							size="icon"
							variant="outline"
							onClick={stop}
							className="h-7 w-7 shrink-0 rounded-lg"
						>
							<Square className="h-3 w-3 fill-current" />
						</Button>
					) : (
						<Button
							type="submit"
							size="icon"
							disabled={!input.trim()}
							className="h-7 w-7 shrink-0 rounded-lg"
						>
							<ArrowUp className="h-3.5 w-3.5" />
						</Button>
					)}
				</div>
			</form>
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center h-full text-center gap-4 pb-16">
			<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-b from-foreground/[0.06] to-foreground/[0.02] border border-border/40 shadow-sm">
				<AgentBotIcon className="h-6 w-6 text-muted-foreground/40" />
			</div>
			<div className="space-y-1">
				<p className="text-sm font-medium text-muted-foreground/60">
					Ask the agent anything
				</p>
				<p className="text-xs text-muted-foreground/35 max-w-[220px] mx-auto leading-relaxed">
					Connected tools require scope approval before use
				</p>
			</div>
		</div>
	);
}

function ThinkingIndicator() {
	return (
		<div className="flex items-start gap-3 mt-4 animate-fade-in">
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
				"flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-b from-foreground/[0.06] to-foreground/[0.03] border border-border/40 shrink-0",
				pulse && "animate-pulse",
			)}
		>
			<AgentBotIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
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
				<div className="max-w-[80%] rounded-2xl rounded-br-md bg-foreground text-background px-4 py-2.5 text-[13px] leading-relaxed">
					{text?.text}
				</div>
			</div>
		);
	}

	return (
		<div className="flex items-start gap-3 animate-fade-in">
			<AgentAvatar />
			<div className="flex-1 min-w-0 space-y-2.5 pt-0.5">
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
		<div className="prose-chat text-[13px] leading-relaxed text-foreground/90">
			<Markdown
				remarkPlugins={[remarkGfm]}
				components={{
					p: ({ children }) => (
						<p className="mb-2.5 last:mb-0">{children}</p>
					),
					strong: ({ children }) => (
						<strong className="font-semibold text-foreground">
							{children}
						</strong>
					),
					em: ({ children }) => <em className="italic">{children}</em>,
					h1: ({ children }) => (
						<h3 className="text-base font-semibold mt-4 mb-2 text-foreground">
							{children}
						</h3>
					),
					h2: ({ children }) => (
						<h4 className="text-sm font-semibold mt-3 mb-1.5 text-foreground">
							{children}
						</h4>
					),
					h3: ({ children }) => (
						<h5 className="text-sm font-medium mt-2.5 mb-1 text-foreground">
							{children}
						</h5>
					),
					ul: ({ children }) => (
						<ul className="list-disc pl-4 mb-2.5 space-y-1">{children}</ul>
					),
					ol: ({ children }) => (
						<ol className="list-decimal pl-4 mb-2.5 space-y-1">{children}</ol>
					),
					li: ({ children }) => (
						<li className="text-[13px] leading-relaxed">{children}</li>
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
						<blockquote className="border-l-2 border-border pl-3 my-2.5 text-muted-foreground italic">
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
							<code className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[12px] font-mono text-foreground/80">
								{children}
							</code>
						);
					},
					pre: ({ children }) => <>{children}</>,
					table: ({ children }) => (
						<div className="my-2.5 overflow-x-auto rounded-lg border border-border/50">
							<table className="w-full text-xs">{children}</table>
						</div>
					),
					thead: ({ children }) => (
						<thead className="bg-muted/40 border-b border-border/50">
							{children}
						</thead>
					),
					th: ({ children }) => (
						<th className="px-3 py-2 text-left font-medium text-muted-foreground text-[11px] uppercase tracking-wider">
							{children}
						</th>
					),
					td: ({ children }) => (
						<td className="px-3 py-2 border-t border-border/30 text-[12px]">
							{children}
						</td>
					),
					hr: () => <hr className="my-4 border-border/30" />,
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
		<div className="my-2.5 rounded-lg border border-border/40 bg-card/80 overflow-hidden">
			{language && (
				<div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/30 text-[10px] text-muted-foreground/50 font-mono uppercase tracking-wider">
					<Terminal className="h-3 w-3" />
					{language}
				</div>
			)}
			<pre className="p-3.5 overflow-x-auto text-[12px] leading-relaxed">
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
				"rounded-lg border text-xs overflow-hidden transition-all",
				isRunning
					? "border-foreground/8 bg-foreground/[0.02] tool-running"
					: isError
						? "border-destructive/15 bg-destructive/[0.02]"
						: "border-border/40 bg-card/50",
			)}
		>
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-foreground/[0.02] transition-colors text-left"
			>
				<div
					className={cn(
						"flex h-5 w-5 items-center justify-center rounded-md shrink-0",
						isRunning
							? "bg-foreground/8"
							: isError
								? "bg-destructive/8"
								: isScopeTool
									? "bg-amber-500/8"
									: "bg-emerald-500/8",
					)}
				>
					{isRunning ? (
						<div className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-pulse" />
					) : isError ? (
						<CircleAlert className="h-3 w-3 text-destructive/70" />
					) : isScopeTool ? (
						<ShieldCheck className="h-3 w-3 text-amber-600 dark:text-amber-400" />
					) : (
						<CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
					)}
				</div>

				<div className="flex-1 min-w-0">
					<span className="font-mono text-[11px] text-foreground/70 font-medium">
						{displayName}
					</span>
					{isRunning && (
						<span className="ml-2 text-[10px] text-muted-foreground/40 animate-pulse">
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
							<div className="px-3 py-2.5">
								<p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-1.5">
									Input
								</p>
								<pre className="text-[11px] font-mono text-muted-foreground/70 leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
									{JSON.stringify(input, null, 2)}
								</pre>
							</div>
						)}
					{output != null && (
						<div className="px-3 py-2.5">
							<p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-1.5">
								Output
							</p>
							<pre className="text-[11px] font-mono text-muted-foreground/70 leading-relaxed overflow-x-auto whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
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
