"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import {
	Fingerprint,
	Server,
	Users,
	Shield,
	Activity,
	Plug2,
	Bot,
	Settings2,
	ArrowRight,
	ArrowDown,
	CheckCircle2,
	KeyRound,
	Blocks,
	Zap,
	Lock,
	RefreshCw,
	Eye,
	Plug,
	type LucideIcon,
} from "lucide-react";
import { highlight } from "sugar-high";
import type { ProductView } from "@/components/landing/landing-shell";

/* ─────────────────────────── ANIMATION VARIANTS ─────────────────────────── */

const stagger = {
	hidden: {},
	show: { transition: { staggerChildren: 0.1 } },
};

const staggerFast = {
	hidden: {},
	show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
	hidden: { opacity: 0, y: 10 },
	show: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.4, ease: "easeOut" },
	},
};

const fadeIn = {
	hidden: { opacity: 0 },
	show: { opacity: 1, transition: { duration: 0.35, ease: "easeOut" } },
};

/* ─────────────────────────── SHARED COMPONENTS ─────────────────────────── */

function SectionDivider({ label }: { label: string }) {
	return (
		<div className="flex items-center gap-3 my-8 sm:my-10">
			<span className="text-[10px] text-foreground/55 font-mono tracking-wider uppercase shrink-0">
				{label}
			</span>
			<div className="flex-1 border-t border-foreground/[0.10]" />
		</div>
	);
}

function CodeBlock({
	comment,
	lines,
}: {
	comment?: string;
	lines: string[];
}) {
	const code = lines.join("\n");
	const html = highlight(code);
	return (
		<motion.div
			initial="hidden"
			whileInView="show"
			viewport={{ once: true, margin: "-40px" }}
			variants={fadeUp}
			className="border border-foreground/[0.15] bg-foreground/[0.04] p-4 font-mono text-xs leading-relaxed overflow-x-auto"
		>
			{comment && (
				<div className="text-foreground/40 select-none mb-2">
					{comment}
				</div>
			)}
			<pre className="m-0">
				<code dangerouslySetInnerHTML={{ __html: html }} />
			</pre>
		</motion.div>
	);
}

function DiagramNode({
	icon: Icon,
	label,
	sub,
	highlight,
}: {
	icon: LucideIcon;
	label: string;
	sub?: string;
	highlight?: boolean;
}) {
	return (
		<div className="flex flex-col items-center gap-1.5 flex-1">
			<div
				className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center border bg-background ${
					highlight
						? "border-foreground/[0.25]"
						: "border-foreground/[0.15]"
				}`}
			>
				<Icon
					className={`h-4 w-4 sm:h-5 sm:w-5 ${
						highlight
							? "text-foreground/65"
							: "text-foreground/45"
					}`}
					strokeWidth={1.5}
				/>
			</div>
			<div className="text-[11px] sm:text-xs font-medium text-foreground/80 text-center font-mono">
				{label}
			</div>
			{sub && (
				<div className="text-[9px] sm:text-[10px] text-foreground/40 text-center font-mono">
					{sub}
				</div>
			)}
		</div>
	);
}

function DiagramArrow({ label }: { label?: string }) {
	return (
		<div className="flex flex-col items-center px-1 gap-0.5">
			<div className="flex items-center">
				<div className="w-6 sm:w-10 h-px bg-foreground/10" />
				<ArrowRight
					className="h-3 w-3 text-foreground/25 -ml-1"
					strokeWidth={1.5}
				/>
			</div>
			{label && (
				<div className="text-[8px] sm:text-[9px] text-foreground/35 font-mono whitespace-nowrap">
					{label}
				</div>
			)}
		</div>
	);
}

function SequenceStep({
	num,
	from,
	to,
	label,
	detail,
	code,
}: {
	num: string;
	from: string;
	to: string;
	label: string;
	detail?: string;
	code?: string;
}) {
	return (
		<motion.div variants={fadeUp} className="flex gap-3 items-start">
			<div className="text-[10px] font-mono text-foreground/35 mt-0.5 shrink-0 w-5 text-right">
				{num}
			</div>
			<div className="flex-1 border border-foreground/[0.15] bg-foreground/[0.04] p-3">
				<div className="flex items-center gap-1.5 mb-1">
					<span className="text-[10px] font-mono text-foreground/45">
						{from}
					</span>
					<ArrowRight
						className="h-2.5 w-2.5 text-foreground/25"
						strokeWidth={1.5}
					/>
					<span className="text-[10px] font-mono text-foreground/45">
						{to}
					</span>
				</div>
				<div className="text-[13px] text-foreground/80 font-medium">
					{label}
				</div>
				{detail && (
					<div className="text-[11px] text-foreground/55 mt-1 leading-relaxed">
						{detail}
					</div>
				)}
				{code && (
					<div className="text-[10px] font-mono text-foreground/40 mt-2 bg-foreground/[0.05] px-2 py-1.5 border border-foreground/[0.10]">
						{code}
					</div>
				)}
			</div>
		</motion.div>
	);
}

/* ─────────────────────────── AGENT AUTH DIAGRAMS ─────────────────────────── */

function KeypairDiagram() {
	return (
		<motion.div
			className="border border-foreground/[0.15] bg-foreground/[0.03] p-5 sm:p-6 mb-4"
			initial="hidden"
			whileInView="show"
			viewport={{ once: true, margin: "-60px" }}
			variants={stagger}
		>
			<motion.div variants={fadeIn} className="text-[10px] font-mono text-foreground/40 mb-4 uppercase tracking-wider">
				Ed25519 keypair — asymmetric authentication
			</motion.div>
			<motion.div variants={stagger} className="flex items-start justify-center gap-4 sm:gap-8 min-w-[300px]">
				{/* Agent side */}
				<motion.div variants={fadeUp} className="flex-1 max-w-[200px]">
					<div className="border border-foreground/20 bg-background p-3 text-center mb-2">
						<Bot
							className="h-4 w-4 text-foreground/55 mx-auto mb-1.5"
							strokeWidth={1.5}
						/>
						<div className="text-[11px] font-mono text-foreground/75">
							Runtime
						</div>
					</div>
					<div className="space-y-1.5">
						<div className="border border-foreground/[0.15] bg-foreground/[0.05] px-2.5 py-1.5 text-[10px] font-mono text-foreground/55">
							<Lock
								className="h-3 w-3 inline mr-1.5 text-foreground/40"
								strokeWidth={1.5}
							/>
							private key
						</div>
						<div className="border border-foreground/[0.15] bg-foreground/[0.05] px-2.5 py-1.5 text-[10px] font-mono text-foreground/55">
							<KeyRound
								className="h-3 w-3 inline mr-1.5 text-foreground/40"
								strokeWidth={1.5}
							/>
							public key
						</div>
					</div>
					<div className="text-[9px] text-foreground/35 text-center mt-2 font-mono">
						signs JWTs with private key
					</div>
				</motion.div>

				{/* Arrow */}
				<motion.div variants={fadeUp} className="flex flex-col items-center pt-8 gap-1">
					<div className="text-[9px] font-mono text-foreground/35">
						registers
					</div>
					<ArrowRight
						className="h-4 w-4 text-foreground/25"
						strokeWidth={1}
					/>
					<div className="text-[9px] font-mono text-foreground/35">
						public key
					</div>
				</motion.div>

				{/* Server side */}
				<motion.div variants={fadeUp} className="flex-1 max-w-[200px]">
					<div className="border border-foreground/20 bg-background p-3 text-center mb-2">
						<Server
							className="h-4 w-4 text-foreground/55 mx-auto mb-1.5"
							strokeWidth={1.5}
						/>
						<div className="text-[11px] font-mono text-foreground/75">
							Server
						</div>
					</div>
					<div className="space-y-1.5">
						<div className="border border-foreground/[0.15] bg-foreground/[0.05] px-2.5 py-1.5 text-[10px] font-mono text-foreground/55">
							<KeyRound
								className="h-3 w-3 inline mr-1.5 text-foreground/40"
								strokeWidth={1.5}
							/>
							public key (stored)
						</div>
						<div className="border border-dashed border-foreground/[0.15] px-2.5 py-1.5 text-[10px] font-mono text-foreground/35">
							<Lock
								className="h-3 w-3 inline mr-1.5 text-foreground/20"
								strokeWidth={1.5}
							/>
							no private key
						</div>
					</div>
					<div className="text-[9px] text-foreground/35 text-center mt-2 font-mono">
						verifies JWTs with public key
					</div>
				</motion.div>
			</motion.div>
		</motion.div>
	);
}

function DeviceFlowSequence() {
	return (
		<motion.div
			className="space-y-2 mb-4"
			initial="hidden"
			whileInView="show"
			viewport={{ once: true, margin: "-60px" }}
			variants={stagger}
		>
			<motion.div variants={fadeIn} className="text-[10px] font-mono text-foreground/40 mb-3 uppercase tracking-wider">
				First-time flow — unknown host
			</motion.div>
			<SequenceStep
				num="1"
				from="host"
				to="server"
				label="Host sends agent creation request"
				detail="Host includes its own public key and the agent's public key. Server detects an unknown host."
				code="POST /agent/create  {publicKey, hostKey, name, scopes}"
			/>
			<SequenceStep
				num="2"
				from="server"
				to="host"
				label="Server triggers device authorization flow"
				detail="Returns a verification URL and device code. The user must approve before the agent is created."
				code='→ {device_code, user_code, verification_uri}'
			/>
			<SequenceStep
				num="3"
				from="user"
				to="server"
				label="User approves host and agent"
				detail='User sees: "A new host wants to create agents on your behalf." They can trust the host (auto-approve future agents) or approve this agent only.'
			/>
			<SequenceStep
				num="4"
				from="host"
				to="server"
				label="Host polls, receives agent ID"
				detail="Host is registered and agent is created in one flow. On subsequent requests, the host is recognized — agents are created silently via host JWT."
				code="→ {agentId, hostId, permissions: [...]}"
			/>
		</motion.div>
	);
}

function RequestSigningDiagram() {
	return (
		<motion.div
			className="border border-foreground/[0.15] bg-foreground/[0.03] p-5 sm:p-6 mb-4"
			initial="hidden"
			whileInView="show"
			viewport={{ once: true, margin: "-60px" }}
			variants={stagger}
		>
			<motion.div variants={fadeIn} className="text-[10px] font-mono text-foreground/40 mb-4 uppercase tracking-wider">
				Request authentication — proof-of-possession with request binding
			</motion.div>
			<div className="space-y-3">
				<motion.div variants={fadeUp} className="flex gap-3 items-start">
					<div className="text-[10px] font-mono text-foreground/35 mt-1 shrink-0 w-4 text-right">
						1
					</div>
					<div className="flex-1">
						<div className="text-[11px] text-foreground/65 mb-1">
							Agent creates a short-lived JWT (60s TTL) bound to this request
						</div>
						<div className="font-mono text-[10px] text-foreground/45 bg-foreground/[0.05] border border-foreground/[0.10] px-2.5 py-1.5">
							{"{"} sub: agentId, iat, exp, jti,
							htm: &quot;POST&quot;, htu: &quot;/api/reports&quot;,
							ath: sha256(body) {"}"} → sign(privateKey)
						</div>
					</div>
				</motion.div>
				<motion.div variants={fadeUp} className="flex gap-3 items-start">
					<div className="text-[10px] font-mono text-foreground/35 mt-1 shrink-0 w-4 text-right">
						2
					</div>
					<div className="flex-1">
						<div className="text-[11px] text-foreground/65 mb-1">
							Sends request with JWT in Authorization header
						</div>
						<div className="font-mono text-[10px] text-foreground/45 bg-foreground/[0.05] border border-foreground/[0.10] px-2.5 py-1.5">
							Authorization: Bearer eyJhbGciOi...
						</div>
					</div>
				</motion.div>
				<motion.div variants={fadeUp} className="flex gap-3 items-start">
					<div className="text-[10px] font-mono text-foreground/35 mt-1 shrink-0 w-4 text-right">
						3
					</div>
					<div className="flex-1">
						<div className="text-[11px] text-foreground/65 mb-1">
							Server verifies signature, request binding, and resolves permissions
						</div>
						<div className="font-mono text-[10px] text-foreground/45 bg-foreground/[0.05] border border-foreground/[0.10] px-2.5 py-1.5">
							verify(jwt, publicKey) → check htm/htu/ath
							→ agentSession {"{"} agent, permissions, user {"}"}
						</div>
					</div>
				</motion.div>
			</div>
			<motion.div variants={fadeUp} className="mt-3 pt-3 border-t border-foreground/[0.10]">
				<div className="text-[10px] text-foreground/45 leading-relaxed">
					DPoP-style request binding (RFC 9449): a stolen JWT can only authorize the
					exact request it was signed for. The Agent SDK includes binding automatically.
				</div>
			</motion.div>
		</motion.div>
	);
}

function ScopeEscalationDiagram() {
	return (
		<motion.div
			className="space-y-2 mb-4"
			initial="hidden"
			whileInView="show"
			viewport={{ once: true, margin: "-60px" }}
			variants={stagger}
		>
			<motion.div variants={fadeIn} className="text-[10px] font-mono text-foreground/40 mb-3 uppercase tracking-wider">
				Runtime permission escalation
			</motion.div>
			<SequenceStep
				num="1"
				from="agent"
				to="server"
				label="Agent requests additional permissions"
				detail='Server creates "pending" permission rows in the agentPermission table.'
				code='POST /agent/request-scope  {scopes: ["github.push", "slack.send"]}'
			/>
			<SequenceStep
				num="2"
				from="server"
				to="agent"
				label="Returns verification URL"
				detail="The agent polls until the user resolves the pending permissions."
				code='→ {requestId, pendingPermissionIds, verificationUrl, status: "pending"}'
			/>
			<SequenceStep
				num="3"
				from="user"
				to="server"
				label="User approves or denies"
				detail='Approved permissions flip to "active". Denied ones flip to "denied". Each permission is independent — different users can grant different scopes to the same agent.'
				code='POST /agent/approve-scope  {requestId, action: "approve", scopes: ["github.push"]}'
			/>
		</motion.div>
	);
}

function RuntimeDiagram() {
	return (
		<motion.div
			className="border border-foreground/[0.15] bg-foreground/[0.03] p-5 sm:p-6 mb-4"
			initial="hidden"
			whileInView="show"
			viewport={{ once: true, margin: "-60px" }}
			variants={stagger}
		>
			<motion.div
				variants={fadeIn}
				className="text-[10px] font-mono text-foreground/40 mb-4 uppercase tracking-wider"
			>
				Agent → Host → Server
			</motion.div>
			<motion.div variants={stagger} className="space-y-2">
				<motion.div
					variants={fadeUp}
					className="flex gap-3 items-center"
				>
					<div className="w-10 h-10 border border-foreground/[0.25] bg-background flex items-center justify-center shrink-0">
						<Bot
							className="h-4 w-4 text-foreground/65"
							strokeWidth={1.5}
						/>
					</div>
					<div>
						<div className="text-[11px] font-mono text-foreground/75">
							Agent
						</div>
						<div className="text-[10px] text-foreground/45">
							The AI identity. Holds an Ed25519 keypair,
							signs every request. Authenticates directly
							with the server.
						</div>
					</div>
				</motion.div>

				<motion.div
					variants={fadeUp}
					className="flex gap-3 items-center"
				>
					<div className="w-10 h-10 border border-foreground/20 bg-background flex items-center justify-center shrink-0">
						<Settings2
							className="h-4 w-4 text-foreground/55"
							strokeWidth={1.5}
						/>
					</div>
					<div>
						<div className="text-[11px] font-mono text-foreground/75">
							Host{" "}
							<span className="text-foreground/35">
								(Cursor, Claude Code, MCP server, CLI)
							</span>
						</div>
						<div className="text-[10px] text-foreground/45">
							The client runtime agents run inside.
							Has its own keypair and a pre-authorized
							scope budget. Holds agent keys and signs
							requests, but server attributes them to
							the agent.
						</div>
					</div>
				</motion.div>

				<motion.div
					variants={fadeUp}
					className="flex gap-3 items-center"
				>
					<div className="w-10 h-10 border border-foreground/20 bg-background flex items-center justify-center shrink-0">
						<Server
							className="h-4 w-4 text-foreground/55"
							strokeWidth={1.5}
						/>
					</div>
					<div>
						<div className="text-[11px] font-mono text-foreground/75">
							Server
						</div>
						<div className="text-[10px] text-foreground/45">
							Your app&apos;s auth backend. Verifies
							signatures, resolves permissions, builds
							sessions. Always knows which agent did what.
						</div>
					</div>
				</motion.div>

				<motion.div
					variants={fadeUp}
					className="flex gap-3 items-center"
				>
					<div className="w-10 h-10 border border-dashed border-foreground/[0.15] bg-background flex items-center justify-center shrink-0">
						<Users
							className="h-4 w-4 text-foreground/35"
							strokeWidth={1.5}
						/>
					</div>
					<div>
						<div className="text-[11px] font-mono text-foreground/75">
							User
						</div>
						<div className="text-[10px] text-foreground/45">
							Registers hosts, approves agents, grants
							permissions. Multiple users can grant
							different permissions to the same agent.
						</div>
					</div>
				</motion.div>
			</motion.div>

			<motion.div
				variants={fadeUp}
				className="mt-4 pt-3 border-t border-foreground/[0.10] flex gap-4"
			>
				<div className="flex-1">
					<div className="text-[9px] sm:text-[10px] font-mono text-foreground/35 mb-0.5">
						Registration
					</div>
					<div className="text-[10px] sm:text-[11px] text-foreground/55 leading-snug">
						Host authenticates with its own key →
						creates the agent on the server.
					</div>
				</div>
				<div className="flex-1">
					<div className="text-[9px] sm:text-[10px] font-mono text-foreground/35 mb-0.5">
						Request time
					</div>
					<div className="text-[10px] sm:text-[11px] text-foreground/55 leading-snug">
						Host signs with the agent&apos;s key →
						server attributes request to the agent.
					</div>
				</div>
			</motion.div>
		</motion.div>
	);
}

/* ─────────────────────────── IDP DIAGRAMS ─────────────────────────── */

function IDPArchitectureDiagram() {
	return (
		<motion.div
			className="border border-foreground/[0.15] bg-foreground/[0.03] p-5 sm:p-6 mb-4"
			initial="hidden"
			whileInView="show"
			viewport={{ once: true, margin: "-60px" }}
			variants={stagger}
		>
			<motion.div variants={fadeIn} className="text-[10px] font-mono text-foreground/40 mb-4 uppercase tracking-wider">
				IDP architecture — centralized agent management
			</motion.div>

			{/* Three-column layout */}
			<motion.div variants={stagger} className="flex items-start justify-center gap-2 sm:gap-3 min-w-[400px] overflow-x-auto">
				{/* Agents column */}
				<motion.div variants={fadeUp} className="flex-1 max-w-[140px]">
					<div className="text-[9px] font-mono text-foreground/35 text-center mb-2 uppercase">
						Agents
					</div>
					<div className="space-y-1.5">
						{["Cursor", "Claude Code", "Custom"].map(
							(name) => (
								<div
									key={name}
									className="border border-foreground/[0.15] bg-background px-2.5 py-2 text-center"
								>
									<Bot
										className="h-3 w-3 text-foreground/40 mx-auto mb-1"
										strokeWidth={1.5}
									/>
									<div className="text-[9px] font-mono text-foreground/55">
										{name}
									</div>
								</div>
							),
						)}
					</div>
				</motion.div>

				{/* Arrows left */}
				<motion.div variants={fadeUp} className="flex flex-col items-center pt-12 gap-1">
					<ArrowRight
						className="h-3.5 w-3.5 text-foreground/25"
						strokeWidth={1}
					/>
					<div className="text-[8px] font-mono text-foreground/25 [writing-mode:vertical-lr]">
						signed JWTs
					</div>
				</motion.div>

				{/* IDP center */}
				<motion.div variants={fadeUp} className="flex-1 max-w-[160px]">
					<div className="text-[9px] font-mono text-foreground/35 text-center mb-2 uppercase">
						Agent Auth IDP
					</div>
					<div className="border border-foreground/[0.25] bg-background p-3 space-y-1.5">
						{[
							"Identity",
							"Scopes",
							"Audit log",
							"Token mgmt",
						].map((item) => (
							<div
								key={item}
								className="bg-foreground/[0.06] px-2 py-1 text-[9px] font-mono text-foreground/50 text-center"
							>
								{item}
							</div>
						))}
					</div>
				</motion.div>

				{/* Arrows right */}
				<motion.div variants={fadeUp} className="flex flex-col items-center pt-12 gap-1">
					<ArrowRight
						className="h-3.5 w-3.5 text-foreground/25"
						strokeWidth={1}
					/>
					<div className="text-[8px] font-mono text-foreground/25 [writing-mode:vertical-lr]">
						proxied calls
					</div>
				</motion.div>

				{/* Services column */}
				<motion.div variants={fadeUp} className="flex-1 max-w-[140px]">
					<div className="text-[9px] font-mono text-foreground/35 text-center mb-2 uppercase">
						Services
					</div>
					<div className="space-y-1.5">
						{["GitHub", "MCP Server", "Your API"].map((name) => (
							<div
								key={name}
								className="border border-foreground/[0.15] bg-background px-2.5 py-2 text-center"
							>
							<Plug2
								className="h-3 w-3 text-foreground/40 mx-auto mb-1"
								strokeWidth={1.5}
								/>
								<div className="text-[9px] font-mono text-foreground/55">
									{name}
								</div>
							</div>
						))}
					</div>
				</motion.div>
			</motion.div>

			{/* Description */}
			<motion.div variants={fadeUp} className="flex justify-between mt-4 pt-3 border-t border-foreground/[0.10]">
				{[
					{
						num: "01",
						text: "Agents authenticate with signed JWTs",
					},
					{
						num: "02",
						text: "IDP verifies identity & enforces scopes",
					},
					{
						num: "03",
						text: "IDP proxies to services (OAuth, API keys, Agent Auth)",
					},
				].map((step) => (
					<div
						key={step.num}
						className="flex-1 text-center px-1"
					>
						<div className="text-[9px] sm:text-[10px] font-mono text-foreground/35 mb-0.5">
							{step.num}
						</div>
						<div className="text-[10px] sm:text-[11px] text-foreground/55 leading-snug">
							{step.text}
						</div>
					</div>
				))}
			</motion.div>
		</motion.div>
	);
}

function ToolCallDiagram() {
	return (
		<motion.div
			className="border border-foreground/[0.15] bg-foreground/[0.03] p-5 sm:p-6 mb-4"
			initial="hidden"
			whileInView="show"
			viewport={{ once: true, margin: "-60px" }}
			variants={stagger}
		>
			<motion.div variants={fadeIn} className="text-[10px] font-mono text-foreground/40 mb-4 uppercase tracking-wider">
				MCP tool call routing
			</motion.div>
			<div className="space-y-2">
				{[
					{
						label: "Agent calls tool",
						code: "github.create_issue({title, body})",
						color: "text-foreground/55",
					},
					{
						label: "IDP checks scopes",
						code: 'agent.scopes.includes("github.create_issue") → pass',
						color: "text-foreground/50",
					},
					{
						label: "IDP logs activity",
						code: "{agentId, method, path, status, ip, timestamp}",
						color: "text-foreground/45",
					},
					{
						label: "IDP proxies to service",
						code: "POST github.com/api → using stored credentials",
						color: "text-foreground/40",
					},
				].map((step, i) => (
					<motion.div key={i} variants={fadeUp}>
						{i > 0 && (
							<div className="flex justify-center py-0.5">
								<ArrowDown
									className="h-3 w-3 text-foreground/20"
									strokeWidth={1.5}
								/>
							</div>
						)}
						<div className="flex gap-2 items-start">
							<div className="text-[9px] font-mono text-foreground/25 mt-1 shrink-0 w-3 text-right">
								{i + 1}
							</div>
							<div className="flex-1 bg-foreground/[0.05] border border-foreground/[0.10] px-3 py-2">
								<div
									className={`text-[11px] font-medium ${step.color}`}
								>
									{step.label}
								</div>
								<div className="text-[10px] font-mono text-foreground/35 mt-0.5">
									{step.code}
								</div>
							</div>
						</div>
					</motion.div>
				))}
			</div>
		</motion.div>
	);
}

/* ─────────────────────────── PLUGIN CONTENT ─────────────────────────── */

function PluginContent() {
	const [implPath, setImplPath] = useState<"better-auth" | "protocol">(
		"better-auth",
	);

	return (
		<>
			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				What is Agent Auth?
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-4">
				<p>
					AI agents act on behalf of users — reading
					emails, creating issues, managing calendars.
					The current approach is to share the user&apos;s
					OAuth token or API key with the agent. This
					creates three problems: no per-agent identity
					(all agents using the same client look identical),
					over-privileged access (the shared token has all
					the user&apos;s permissions), and no per-agent
					control (you can&apos;t revoke one agent without
					invalidating the token for all of them).
				</p>
				<p>
					Agent Auth gives each agent its own cryptographic
					identity (Ed25519 keypair) and manages permissions
					separately from the user&apos;s session. The
					server always knows exactly which agent performed
					an action, what permissions it had, and who
					authorized each permission.
				</p>
				<p>
					The protocol defines three actors:{" "}
					<span className="text-foreground/90">
						Agents
					</span>{" "}
					(the AI identity),{" "}
					<span className="text-foreground/90">
						Hosts
					</span>{" "}
					(the client runtime — Cursor, Claude Desktop,
					an MCP server), and{" "}
					<span className="text-foreground/90">
						Servers
					</span>{" "}
					(your app&apos;s auth backend). The agent&apos;s
					keypair lives inside the host, but the server
					always attributes requests to the specific agent
					— not the host.
				</p>
			</div>

			<RuntimeDiagram />

			<SectionDivider label="The Runtime" />

			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				The CLI is a ready-made host
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-5">
				<p>
					The Better Auth CLI acts as an agent host — it
					generates keypairs, runs the device authorization
					flow, registers with the server, and signs every
					request with the agent&apos;s private key.
					It&apos;s a pre-built host you can use out of
					the box.
				</p>
				<p>
					The CLI exposes an MCP server on stdio. Editors
					like Cursor and Claude Code connect to it as an
					MCP client. When the model decides to call a
					tool, the editor sends the call to the CLI, the
					CLI signs a request-bound JWT (locked to the
					exact method, path, and body), and forwards it
					to your app.
				</p>
			</div>

			<CodeBlock
				comment="# connect to an app"
				lines={[
					"$ npx auth ai connect https://your-app.com",
					"",
					"  Verification URL: https://your-app.com/device",
					"  User code: ABCD-1234",
					"",
					"  Waiting for approval...",
					"  Connected as agent agt_k7x9m2 with 3 scopes",
				]}
			/>

			<div className="h-4" />

			<CodeBlock
				comment="# or add to your editor directly"
				lines={[
					"$ npx auth ai --cursor",
					"$ npx auth ai --claude-code",
				]}
			/>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mt-5 mb-4">
				<p>
					The CLI stores the keypair and connections in{" "}
					<span className="font-mono text-foreground/75 text-xs">
						~/.better-auth/agents/
					</span>
					. Or you can build your own host — the protocol
					is open and the SDK exports everything you need.
				</p>
			</div>

			<SectionDivider label="Server-Side" />

			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				Two ways to implement
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-5">
				<p>
					The CLI handles the host side. On the server, you
					need to verify agent requests, manage permissions,
					and handle host registration. If you use Better
					Auth, the plugin handles everything. If you
					don&apos;t, the protocol is three tables and some
					JWT verification.
				</p>
			</div>

			{/* Path toggle */}
			<div className="flex border border-foreground/[0.15] overflow-hidden mb-6">
				{(
					[
						{
							key: "better-auth" as const,
							label: "With Better Auth",
						},
						{
							key: "protocol" as const,
							label: "Raw Protocol",
						},
					]
				).map((tab) => (
					<button
						key={tab.key}
						onClick={() => setImplPath(tab.key)}
						className={`flex-1 px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
							implPath === tab.key
								? "bg-foreground text-background"
								: "text-foreground/45 hover:text-foreground/65 hover:bg-foreground/[0.05]"
						}`}
					>
						{tab.label}
					</button>
				))}
			</div>

			<AnimatePresence mode="wait">
				<motion.div
					key={implPath}
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -4 }}
					transition={{ duration: 0.25 }}
				>
					{implPath === "better-auth" ? (
						<>
							<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
								Add the plugin
							</h2>

							<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] mb-5">
								<p>
									Add the Agent Auth plugin to your
									Better Auth config. Define roles and
									their scopes if you want role-based
									defaults.
								</p>
							</div>

							<CodeBlock
								lines={[
									'import { betterAuth } from "better-auth"',
									'import { agentAuth } from "@better-auth/agent-auth"',
									"",
									"export const auth = betterAuth({",
									"  plugins: [",
									"    agentAuth({",
									"      roles: {",
									'        reader: ["reports.read", "data.read"],',
									'        writer: ["reports.read", "reports.write"],',
									"      },",
									"    }),",
									"  ],",
									"})",
								]}
							/>

							<div className="h-5" />

							<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
								Verify agent requests
							</h2>

							<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-5">
								<p>
									Use{" "}
									<span className="font-mono text-foreground/75 text-xs">
										getAgentSession()
									</span>{" "}
									in any route handler. If it returns a
									session, the request is from an
									agent — check its permissions and
									handle accordingly. Otherwise, fall
									back to regular user auth.
								</p>
							</div>

							<CodeBlock
								lines={[
									"export async function GET(request: Request) {",
									"  const agentSession = await auth.api.getAgentSession({",
									"    headers: request.headers,",
									"  })",
									"",
									"  if (agentSession) {",
									"    const { agent, user } = agentSession",
									"    const hasScope = agent.permissions.some(",
									'      (p) => p.scope === "reports.read"',
									"    )",
									"    if (!hasScope) {",
									'      return Response.json({ error: "insufficient scope" }, { status: 403 })',
									"    }",
									"    return Response.json({ reports: await getReports(user.id) })",
									"  }",
									"",
									"  // fallback to regular session auth",
									"  const session = await auth.api.getSession({",
									"    headers: request.headers,",
									"  })",
									"  if (!session) {",
									'    return Response.json({ error: "unauthorized" }, { status: 401 })',
									"  }",
									"  return Response.json({ reports: await getReports(session.user.id) })",
									"}",
								]}
							/>

							<div className="h-5" />

							{/* AgentSession shape */}
							<motion.div
								className="border border-foreground/[0.15] bg-foreground/[0.03] p-5 sm:p-6 mb-4"
								initial="hidden"
								whileInView="show"
								viewport={{ once: true, margin: "-40px" }}
								variants={staggerFast}
							>
								<motion.div variants={fadeIn} className="text-[10px] font-mono text-foreground/40 mb-3 uppercase tracking-wider">
									AgentSession shape
								</motion.div>
								<div className="font-mono text-[11px] leading-[1.8] text-foreground/55 space-y-0.5">
									<div>{"{"}</div>
									<div className="pl-4">
										<span className="text-foreground/65">
											agent
										</span>
										: {"{"}
									</div>
									<div className="pl-8">
										id:{" "}
										<span className="text-foreground/40">
											&quot;agt_k7x9m2...&quot;
										</span>
									</div>
									<div className="pl-8">
										name:{" "}
										<span className="text-foreground/40">
											&quot;Claude Code&quot;
										</span>
									</div>
									<div className="pl-8">
										hostId:{" "}
										<span className="text-foreground/40">
											&quot;host_abc&quot;
										</span>
									</div>
									<div className="pl-8">
										permissions: [
									</div>
									<div className="pl-12">
										{"{"} scope:{" "}
										<span className="text-foreground/40">
											&quot;github.read&quot;
										</span>
										, grantedBy:{" "}
										<span className="text-foreground/40">
											&quot;user_xyz&quot;
										</span>
										{" }"}
									</div>
									<div className="pl-12">
										{"{"} scope:{" "}
										<span className="text-foreground/40">
											&quot;issues.write&quot;
										</span>
										, grantedBy:{" "}
										<span className="text-foreground/40">
											&quot;user_xyz&quot;
										</span>
										{" }"}
									</div>
									<div className="pl-8">]</div>
									<div className="pl-4">{"}"}</div>
									<div className="pl-4">
										<span className="text-foreground/65">
											user
										</span>
										: {"{"}
									</div>
									<div className="pl-8">
										id:{" "}
										<span className="text-foreground/40">
											&quot;user_xyz&quot;
										</span>
										<span className="text-foreground/35">
											{" "}
											// who this agent acts for
										</span>
									</div>
									<div className="pl-8">
										name:{" "}
										<span className="text-foreground/40">
											&quot;Alice&quot;
										</span>
									</div>
									<div className="pl-4">{"}"}</div>
									<div>{"}"}</div>
								</div>
							</motion.div>
						</>
					) : (
						<>
							<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
								The protocol
							</h2>

							<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-5">
								<p>
									Agent Auth is an open protocol. No
									dependency on Better Auth required.
									Three entities — hosts, agents, and
									permissions — three tables.
								</p>
							</div>

							<motion.div
								className="border border-foreground/[0.15] bg-foreground/[0.03] p-5 sm:p-6 mb-4"
								initial="hidden"
								whileInView="show"
								viewport={{ once: true, margin: "-40px" }}
								variants={staggerFast}
							>
								<motion.div variants={fadeIn} className="text-[10px] font-mono text-foreground/40 mb-4 uppercase tracking-wider">
									Host / Agent side
								</motion.div>
								<div className="space-y-2">
									{[
										"1. Host generates Ed25519 keypair, registers with server",
										"2. Agent generates its own keypair",
										"3. Host signs a JWT (sub=hostId) and sends agent creation request",
										"4. Server creates agent + permission rows from host's scope budget",
										"5. For each request: agent creates JWT (sub=agentId, htm, htu, ath, exp=60s)",
										"6. Send as Authorization: Bearer <jwt>",
									].map((line) => (
										<motion.div
											key={line}
											variants={fadeUp}
											className="text-[11px] font-mono text-foreground/55 leading-relaxed"
										>
											{line}
										</motion.div>
									))}
								</div>
							</motion.div>

							<motion.div
								className="border border-foreground/[0.15] bg-foreground/[0.03] p-5 sm:p-6 mb-4"
								initial="hidden"
								whileInView="show"
								viewport={{ once: true, margin: "-40px" }}
								variants={staggerFast}
							>
								<motion.div variants={fadeIn} className="text-[10px] font-mono text-foreground/40 mb-4 uppercase tracking-wider">
									Server side
								</motion.div>
								<div className="space-y-2">
									{[
										"1. Implement device auth flow (RFC 8628) for first-time host approval",
										"2. Store three tables: agentHost, agent (identity only), agentPermission",
										"3. On request: extract JWT from Authorization header",
										"4. Look up agent by sub claim, verify signature with stored public key",
										"5. Verify request binding (htm/htu/ath) if present",
										"6. Check JTI replay, expiry, three-state lifecycle",
										"7. Resolve active permissions from agentPermission table",
										"8. Return AgentSession { agent, permissions, user }",
									].map((line) => (
										<motion.div
											key={line}
											variants={fadeUp}
											className="text-[11px] font-mono text-foreground/55 leading-relaxed"
										>
											{line}
										</motion.div>
									))}
								</div>
							</motion.div>

							<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-4">
								<p>
									Identity is separated from
									authorization. The agent table is
									pure identity (keypair + lifecycle).
									Permissions are a separate table
									with their own lifecycle — each
									row is a scope grant from a specific
									user, independently revocable.
								</p>
								<p>
									<Link
										href="/spec"
										className="text-foreground/80 underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/50 transition-colors"
									>
										Read the full protocol
										specification
									</Link>
									.
								</p>
							</div>
						</>
					)}
				</motion.div>
			</AnimatePresence>

			<SectionDivider label="Keypair Authentication" />

			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				Ed25519 asymmetric authentication
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] mb-5">
				<p>
					Each agent generates an Ed25519 keypair. The
					private key never leaves the agent. The server
					stores only the public key. Every request carries a
					short-lived JWT (60s TTL) signed with the
					agent&apos;s private key, verified server-side
					against the stored public key.
				</p>
			</div>

			<KeypairDiagram />

			<SectionDivider label="Device Flow" />

			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				How agents connect
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-5">
				<p>
					The first time a host tries to create an agent,
					the server triggers a device authorization flow
					(RFC 8628). The user approves in their browser,
					the host is registered, and the agent is created
					— all in one step.
				</p>
				<p>
					Once a host is trusted, future agents are created
					silently via a signed host JWT — no user
					interaction needed, as long as the requested scopes
					are within the host&apos;s pre-authorized budget.
				</p>
			</div>

			<DeviceFlowSequence />

			<SectionDivider label="Request Signing" />

			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				Every request is cryptographically signed
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] mb-5">
				<p>
					Each request carries a fresh JWT (60s TTL) signed
					with the agent&apos;s private key. The JWT can
					optionally include DPoP-style request binding —
					the HTTP method, path, and body hash are baked
					into the token. A stolen JWT can only authorize
					the exact request it was signed for.
				</p>
			</div>

			<RequestSigningDiagram />

			<SectionDivider label="Scope Escalation" />

			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				Agents can request more permissions at runtime
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] mb-5">
				<p>
					Permissions live in a separate table from agent
					identity. When an agent needs access beyond its
					current permissions, it creates &quot;pending&quot;
					permission rows. The user approves or denies each
					one independently — and different users can grant
					different permissions to the same agent.
				</p>
			</div>

			<ScopeEscalationDiagram />


			<SectionDivider label="Lifecycle" />

			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				Three-state lifecycle
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] mb-5">
				<p>
					Both agents and hosts follow a three-state lifecycle:
					active → expired → revoked. Three independent
					clocks (sliding TTL, max lifetime, absolute
					lifetime) govern transitions. Expired agents can
					be transparently reactivated on a valid JWT —
					permissions decay to the host&apos;s scope budget.
					Revocation is permanent (public key wiped). Revoking
					a host cascades to all its agents.
				</p>
			</div>

			<CodeBlock
				comment="# agent lifecycle endpoints"
				lines={[
					"POST /agent/rotate-key   # invalidate old key, register new one",
					"POST /agent/revoke       # revoke agent, wipe public key",
					"GET  /agent/activity     # query agent activity log",
					"POST /agent/cleanup      # batch-revoke expired agents",
				]}
			/>

			<SectionDivider label="FAQ" />

			<div className="space-y-4 mb-4">
				{[
					{
						q: "How is this different from MCP?",
						a: "MCP defines how agents talk to tools. Agent Auth defines how agents prove who they are and what they\u2019re allowed to do. With MCP alone, agents use the user\u2019s OAuth tokens \u2014 there\u2019s no per-agent identity or permission control. Agent Auth gives each agent its own cryptographic identity, individually-granted permissions, and a complete audit trail. You can use both together.",
					},
					{
						q: "What\u2019s the difference between a host and an agent?",
						a: "A host is the client runtime (Cursor, an MCP server, a CLI tool). An agent is the AI identity that authenticates. Hosts facilitate agent creation and have a pre-authorized scope budget. Agents authenticate directly with the server \u2014 the host is not in the request path. One host can create many agents.",
					},
					{
						q: "What if I want a centralized solution for all my MCP servers?",
						a: "The Agent Auth IDP provides a centralized identity provider with built-in support for all MCP servers, OAuth provider management, org-wide audit logging, and a gateway that handles tool call routing across all your connected services.",
						link: true,
					},
					{
						q: "Do I need Better Auth to use Agent Auth?",
						a: "No. Agent Auth is an open protocol \u2014 Ed25519 keypairs, device authorization flow, signed JWTs, three tables. Better Auth ships a reference plugin that handles everything out of the box, but the protocol is simple enough to implement in any language. Read the full spec for implementation details.",
					},
				].map((item) => (
					<details
						key={item.q}
						className="group border border-foreground/[0.15] bg-foreground/[0.03]"
					>
						<summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none">
							<span className="text-[13px] sm:text-sm font-medium text-foreground/80">
								{item.q}
							</span>
							<span className="text-foreground/35 text-xs font-mono ml-3 shrink-0 group-open:rotate-45 transition-transform">
								+
							</span>
						</summary>
						<div className="px-4 pb-3 text-[13px] sm:text-sm text-foreground/60 leading-[1.85]">
							{item.a}
							{item.link && (
								<>
									{" "}
									<Link
										href="#"
										className="text-foreground/80 underline decoration-foreground/20 underline-offset-2 hover:decoration-foreground/50 transition-colors"
										onClick={(e) => {
											e.preventDefault();
											const tabBtn = document.querySelector(
												'[data-tab="gateway"]',
											) as HTMLButtonElement;
											tabBtn?.click();
										}}
									>
										Learn more about the IDP
									</Link>
									.
								</>
							)}
						</div>
					</details>
				))}
			</div>

			<SectionDivider label="Get Started" />

			<div className="flex flex-wrap items-center gap-3 mb-8">
				<Link
					href="https://www.better-auth.com/docs"
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-foreground text-background text-xs sm:text-sm font-medium hover:opacity-90 transition-opacity"
				>
					Read the docs
					<ArrowRight className="h-3.5 w-3.5" />
				</Link>
				<Link
					href="/spec"
					className="inline-flex items-center gap-1.5 px-5 py-2.5 text-foreground/65 text-xs sm:text-sm font-medium hover:text-foreground/90 transition-colors"
				>
					Full Protocol Spec
				</Link>
				<Link
					href="https://github.com/better-auth/better-auth"
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1.5 px-5 py-2.5 text-foreground/65 text-xs sm:text-sm font-medium hover:text-foreground/90 transition-colors"
				>
					View on GitHub
				</Link>
			</div>
		</>
	);
}

/* ─────────────────────────── IDP CONTENT ─────────────────────────── */

function AudienceToggle({
	audience,
	setAudience,
}: {
	audience: "individual" | "org";
	setAudience: (v: "individual" | "org") => void;
}) {
	return (
		<div className="flex border border-foreground/[0.15] overflow-hidden mb-6">
			{(
				[
					{ key: "org", label: "For Organizations" },
					{ key: "individual", label: "For Individuals" },
				] as const
			).map((tab) => (
				<button
					key={tab.key}
					onClick={() => setAudience(tab.key)}
					className={`flex-1 px-4 py-2.5 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
						audience === tab.key
							? "bg-foreground text-background"
							: "text-foreground/45 hover:text-foreground/65 hover:bg-foreground/[0.05]"
					}`}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}

function GatewayContent() {
	const [audience, setAudience] = useState<"individual" | "org">(
		"org",
	);

	return (
		<>
			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				Agent Auth IDP
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-5">
				<p>
					A centralized identity provider for AI agents.
					Connect your services — OAuth providers, MCP
					servers, or any API — to the IDP once. Agents
					authenticate through the IDP using Agent Auth,
					and the IDP handles identity verification, scope
					enforcement, credential management, and activity
					logging.
				</p>
				<p>
					Instead of giving each agent direct access to
					your services, the IDP sits in between. Agents
					never see raw credentials. Every tool call is
					authenticated, scoped, logged, and proxied.
				</p>
			</div>

			<IDPArchitectureDiagram />

			<div className="flex justify-end mt-5 mb-4">
				<Link
					href="/sign-in"
					className="inline-flex items-center gap-1.5 px-5 py-2.5 text-foreground/65 text-xs sm:text-sm font-medium hover:text-foreground/90 transition-colors"
				>
					Get Started
					<ArrowRight className="h-3.5 w-3.5" />
				</Link>
			</div>

			<SectionDivider label="Connections" />

			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				Connect once, use everywhere
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-5">
				<p>
					The IDP supports three types of connections.
					Built-in OAuth providers like GitHub and Google
					are auto-configured — link your account and
					the IDP creates the provider and stores
					credentials automatically. Custom HTTP
					endpoints let you connect any REST API or
					remote MCP server. Stdio transports let you
					run local MCP servers as subprocesses.
				</p>
				<p>
					All connections are org-scoped. When a team
					member links their GitHub account, every
					authorized agent in the org can access it
					through the gateway — scoped to whatever
					tools you allow.
				</p>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
				{[
					{
						icon: Plug2,
						title: "OAuth providers",
						desc: "GitHub, Google, and more. Link once, auto-synced to your org.",
					},
					{
						icon: Server,
						title: "HTTP / MCP servers",
						desc: "Any remote MCP endpoint or REST API with bearer/API key auth.",
					},
					{
						icon: Blocks,
						title: "Stdio transports",
						desc: "Run local MCP servers as subprocesses. npx, docker, custom binaries.",
					},
				].map((item) => (
					<div
						key={item.title}
						className="border border-foreground/[0.15] bg-foreground/[0.04] p-3"
					>
						<item.icon
							className="h-4 w-4 text-foreground/40 mb-2"
							strokeWidth={1.5}
						/>
						<div className="text-[12px] font-medium text-foreground/75 mb-1">
							{item.title}
						</div>
						<div className="text-[11px] text-foreground/50 leading-relaxed">
							{item.desc}
						</div>
					</div>
				))}
			</div>

			<SectionDivider label="Tool Call Routing" />

			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				What happens on every tool call
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] mb-5">
				<p>
					When an agent calls a tool through the MCP
					gateway, the IDP runs the request through a
					pipeline: verify the agent&apos;s JWT, check
					the requested tool against the agent&apos;s
					granted scopes, log the call with full
					attribution, then proxy to the target service
					using stored credentials. The agent never
					touches the underlying token.
				</p>
			</div>

			<ToolCallDiagram />

			<SectionDivider label="Scopes" />

			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				Granular scope control
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-5">
				<p>
					Scopes follow a{" "}
					<span className="font-mono text-foreground/75 text-xs">
						provider.tool
					</span>{" "}
					format. You can grant access to a specific
					tool like{" "}
					<span className="font-mono text-foreground/75 text-xs">
						github.create_issue
					</span>
					, use wildcards like{" "}
					<span className="font-mono text-foreground/75 text-xs">
						github.*
					</span>{" "}
					for all tools from a provider, or{" "}
					<span className="font-mono text-foreground/75 text-xs">
						*
					</span>{" "}
					for full access. Scopes are set during the
					device flow approval and can be escalated at
					runtime.
				</p>
			</div>

			{/* Scope format examples */}
			<div className="border border-foreground/[0.15] bg-foreground/[0.03] p-5 sm:p-6 mb-4">
				<div className="text-[10px] font-mono text-foreground/40 mb-3 uppercase tracking-wider">
					Scope format
				</div>
				<div className="space-y-1.5">
					{[
						{
							scope: "github.create_issue",
							desc: "One tool from one provider",
						},
						{
							scope: "github.*",
							desc: "All tools from GitHub",
						},
						{
							scope: "myapp.read_reports  myapp.list_users",
							desc: "Multiple specific tools",
						},
						{
							scope: "*",
							desc: "Full access to all providers",
						},
					].map((item) => (
						<div
							key={item.scope}
							className="flex items-center gap-3"
						>
							<div className="font-mono text-[10px] text-foreground/55 bg-foreground/[0.05] border border-foreground/[0.10] px-2 py-1 shrink-0">
								{item.scope}
							</div>
							<div className="text-[10px] text-foreground/40">
								{item.desc}
							</div>
						</div>
					))}
				</div>
			</div>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-4">
				<p>
					When an agent needs access to something outside
					its current scopes, it requests escalation. The
					IDP creates a 5-minute verification URL, the user
					approves in their browser, and the new scopes are
					merged into the agent&apos;s grant. The agent
					polls until the request resolves.
				</p>
			</div>

			<SectionDivider label="Device Flow" />

			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				Browser-based approval
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-5">
				<p>
					Agents connect through the OAuth 2.0 device
					authorization flow. The agent runs{" "}
					<span className="font-mono text-foreground/75 text-xs">
						npx auth ai
					</span>{" "}
					and gets a device code. The user opens the
					verification URL in their browser, sees the
					full list of available tools from all connected
					providers, and selects exactly which ones to
					grant — per tool or per provider.
				</p>
				<p>
					The approval page pulls the live tool catalog
					from the IDP, so users always see the actual
					tools available. They can toggle between
					granting all tools from a provider or
					cherry-picking individual ones.
				</p>
			</div>

			<CodeBlock
				comment="# agent side — one command to connect"
				lines={[
					"$ npx auth ai",
					"",
					"\u2192 Enter your device code at: https://your-app.com/device",
					"\u2192 Code: ABCD-1234",
					"\u2192 Waiting for approval...",
					"\u2192 Approved. Agent registered with 4 tools.",
				]}
			/>

			<SectionDivider label="Discovery" />

			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				Agents discover tools automatically
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-5">
				<p>
					The gateway exposes a tools endpoint that returns
					only the tools the agent has scope for. If an
					agent has{" "}
					<span className="font-mono text-foreground/75 text-xs">
						github.*
					</span>{" "}
					it sees all GitHub tools. If it has{" "}
					<span className="font-mono text-foreground/75 text-xs">
						github.create_issue
					</span>{" "}
					it sees only that one. Tools from disconnected
					providers are excluded with a warning.
				</p>
				<p>
					There&apos;s also an unauthenticated discovery
					endpoint that returns the full tool catalog for
					an org — used by agents before they authenticate
					so they know what scopes to request.
				</p>
			</div>

			<SectionDivider label="Activity" />

			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				Every tool call is logged
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-5">
				<p>
					The IDP logs every tool call with the agent ID,
					user ID, org, provider, tool name, arguments
					(truncated), response summary, duration in
					milliseconds, status code, IP, and user agent.
					Scope approvals and denials are logged too.
				</p>
				<p>
					You can query the activity log per agent or
					across the org. Every entry shows exactly what
					the agent did, on whose behalf, and how long
					it took — so you can audit, debug, and
					understand agent behavior.
				</p>
			</div>

			{/* Activity log shape */}
			<div className="border border-foreground/[0.15] bg-foreground/[0.03] p-5 sm:p-6 mb-4">
				<div className="text-[10px] font-mono text-foreground/40 mb-3 uppercase tracking-wider">
					Activity log entry
				</div>
				<div className="font-mono text-[11px] leading-[1.8] text-foreground/55 space-y-0.5">
					<div>{"{"}</div>
					<div className="pl-4">
						agent:{" "}
						<span className="text-foreground/40">
							&quot;Claude Code&quot;
						</span>
					</div>
					<div className="pl-4">
						tool:{" "}
						<span className="text-foreground/40">
							&quot;github.create_issue&quot;
						</span>
					</div>
					<div className="pl-4">
						user:{" "}
						<span className="text-foreground/40">
							&quot;alice@company.com&quot;
						</span>
					</div>
					<div className="pl-4">
						status:{" "}
						<span className="text-foreground/40">
							200
						</span>
						<span className="text-foreground/35">
							{" "}
							// or 403, 502, etc.
						</span>
					</div>
					<div className="pl-4">
						duration:{" "}
						<span className="text-foreground/40">
							342ms
						</span>
					</div>
					<div className="pl-4">
						timestamp:{" "}
						<span className="text-foreground/40">
							2025-01-15T09:23:41Z
						</span>
					</div>
					<div>{"}"}</div>
				</div>
			</div>

			<SectionDivider label="Who It's For" />

			<AudienceToggle
				audience={audience}
				setAudience={setAudience}
			/>

			<AnimatePresence mode="wait">
				<motion.div
					key={audience}
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -4 }}
					transition={{ duration: 0.25 }}
				>
					{audience === "individual" ? (
						<>
							<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
								Centralized connections for individual
								developers
							</h2>

							<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-5">
								<p>
									You use multiple agents (Cursor,
									Claude Code, custom tools). Each
									one needs access to GitHub, Google,
									and other services. Without the
									IDP, you connect them individually
									— different tokens, different
									setups, different revocation flows
									for each one.
								</p>
								<p>
									The IDP centralizes this. You
									connect your services once. Agents
									authenticate through the IDP and
									access those services through the
									gateway. You see every agent, what
									it can access, and what it did —
									in one place.
								</p>
							</div>

							{/* Individual architecture */}
							<div className="border border-foreground/[0.15] bg-foreground/[0.03] p-5 sm:p-6 mb-4">
								<div className="text-[10px] font-mono text-foreground/40 mb-4 uppercase tracking-wider">
									Without IDP vs With IDP
								</div>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
									<div>
										<div className="text-[10px] font-mono text-foreground/45 mb-2">
											Without
										</div>
										<div className="space-y-1">
											{[
												"Cursor \u2192 GitHub token",
												"Cursor \u2192 Google token",
												"Claude \u2192 GitHub token",
												"Claude \u2192 Google token",
												"Custom \u2192 GitHub token",
											].map((line) => (
												<div
													key={line}
													className="text-[10px] font-mono text-foreground/40 bg-foreground/[0.05] px-2 py-1 border border-foreground/[0.10]"
												>
													{line}
												</div>
											))}
										</div>
										<div className="text-[9px] text-foreground/35 mt-2 font-mono">
											5 connections to manage
										</div>
									</div>
									<div>
										<div className="text-[10px] font-mono text-foreground/45 mb-2">
											With IDP
										</div>
										<div className="space-y-1">
											{[
												"Cursor \u2192 IDP",
												"Claude \u2192 IDP",
												"Custom \u2192 IDP",
												"IDP \u2192 GitHub",
												"IDP \u2192 Google",
											].map((line) => (
												<div
													key={line}
													className="text-[10px] font-mono text-foreground/40 bg-foreground/[0.05] px-2 py-1 border border-foreground/[0.10]"
												>
													{line}
												</div>
											))}
										</div>
										<div className="text-[9px] text-foreground/35 mt-2 font-mono">
											agents connect to IDP,
											services connected once
										</div>
									</div>
								</div>
							</div>
						</>
					) : (
						<>
							<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
								Organization-wide agent management
							</h2>

							<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-5">
								<p>
									Each organization gets its own IDP
									workspace. Team members connect
									their service accounts. Agents
									authenticate through the org&apos;s
									IDP and access services using the
									org&apos;s shared connections. All
									agent activity is logged at the org
									level — you can see exactly which
									agent called which tool, on whose
									behalf, and when.
								</p>
							</div>

							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
								{[
									{
										icon: Users,
										title: "Member management",
										desc: "Invite members with roles. Members connect their own service accounts to the org.",
									},
									{
										icon: Plug,
										title: "Shared connections",
										desc: "Credentials are org-scoped. Any authorized agent in the org can access them through the gateway.",
									},
									{
										icon: Shield,
										title: "Scoped agent policies",
										desc: "Define what tools each agent can access. Scope escalation requires member approval in browser.",
									},
									{
										icon: Eye,
										title: "Org-wide audit log",
										desc: "Every tool call across every agent and member. Agent, tool, args, result, duration, timestamp.",
									},
									{
										icon: Server,
										title: "Service registry",
										desc: "Register OAuth providers, MCP servers, and custom APIs. Agents discover tools through the gateway.",
									},
									{
										icon: Lock,
										title: "Instant revocation",
										desc: "Revoke any agent immediately. Public key is wiped — all future requests from that agent fail.",
									},
								].map((item) => (
									<div
										key={item.title}
										className="border border-foreground/[0.15] bg-foreground/[0.04] p-3"
									>
										<item.icon
											className="h-3.5 w-3.5 text-foreground/40 mb-1.5"
											strokeWidth={1.5}
										/>
										<div className="text-[12px] font-medium text-foreground/75 mb-1">
											{item.title}
										</div>
										<div className="text-[11px] text-foreground/50 leading-relaxed">
											{item.desc}
										</div>
									</div>
								))}
							</div>
						</>
					)}
				</motion.div>
			</AnimatePresence>

			<SectionDivider label="Integrations" />

			<h2 className="text-base sm:text-lg font-medium text-foreground mb-4 tracking-tight">
				Works with any MCP-compatible agent
			</h2>

			<div className="text-[13px] sm:text-sm text-foreground/70 leading-[1.85] space-y-4 mb-5">
				<p>
					Any agent that speaks MCP can connect to the IDP.
					Run{" "}
					<span className="font-mono text-foreground/75 text-xs">
						npx auth ai
					</span>{" "}
					to add the IDP as an MCP server to your editor.
					It handles the device flow, scope selection, and
					JWT signing automatically.
				</p>
			</div>

			<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
				{["Cursor", "Claude Code", "Windsurf", "Custom Agents"].map(
					(agent) => (
						<div
							key={agent}
							className="border border-foreground/[0.15] bg-foreground/[0.04] px-3 py-2.5 text-center text-xs font-mono text-foreground/55"
						>
							{agent}
						</div>
					),
				)}
			</div>

			<CodeBlock
				comment="# connect your editor to the IDP"
				lines={[
					"$ npx auth ai --cursor",
					"$ npx auth ai --claude-code",
					"$ npx auth ai --windsurf",
				]}
			/>

			<SectionDivider label="Get Started" />

			<div className="flex items-center gap-3 mb-8">
				<Link
					href="/sign-in"
					className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-foreground text-background text-xs sm:text-sm font-medium hover:opacity-90 transition-opacity"
				>
					Get Started
					<ArrowRight className="h-3.5 w-3.5" />
				</Link>
				<Link
					href="https://www.better-auth.com/docs"
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1.5 px-5 py-2.5 text-foreground/65 text-xs sm:text-sm font-medium hover:text-foreground/90 transition-colors"
				>
					Read the docs
				</Link>
			</div>
		</>
	);
}
/* ─────────────────────────── MAIN EXPORT ─────────────────────────── */

export function LandingReadme({
	activeProduct,
}: {
	activeProduct: ProductView;
}) {
	return (
		<div className="relative max-w-3xl mx-auto px-5 sm:px-6 lg:px-8 py-8 sm:py-10">
			<AnimatePresence mode="wait">
				<motion.article
					key={activeProduct}
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -4 }}
					transition={{ duration: 0.3 }}
				>
					{activeProduct === "plugin" ? (
						<PluginContent />
					) : (
						<GatewayContent />
					)}
				</motion.article>
			</AnimatePresence>
		</div>
	);
}
