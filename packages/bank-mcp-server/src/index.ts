#!/usr/bin/env npx tsx
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
/**
 * Demo "Acme Bank" MCP server over Streamable HTTP.
 * Run: npx tsx demo/bank-mcp-server.ts
 * Endpoint: http://localhost:4100/mcp
 *
 * No real bank — just in-memory fake data for showcasing the custom MCP feature.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod";

// ── Fake data ───────────────────────────────────────────────────────────

const accounts = [
	{
		id: "acct_001",
		name: "Checking",
		type: "checking",
		balance: 4_832.5,
		currency: "USD",
	},
	{
		id: "acct_002",
		name: "Savings",
		type: "savings",
		balance: 21_500.0,
		currency: "USD",
	},
	{
		id: "acct_003",
		name: "Business",
		type: "checking",
		balance: 78_210.33,
		currency: "USD",
	},
];

const transactions: Array<{
	id: string;
	accountId: string;
	date: string;
	description: string;
	amount: number;
	category: string;
}> = [
	{
		id: "tx_001",
		accountId: "acct_001",
		date: "2026-02-20",
		description: "Grocery Store",
		amount: -87.32,
		category: "groceries",
	},
	{
		id: "tx_002",
		accountId: "acct_001",
		date: "2026-02-19",
		description: "Salary Deposit",
		amount: 5_200.0,
		category: "income",
	},
	{
		id: "tx_003",
		accountId: "acct_001",
		date: "2026-02-18",
		description: "Electric Bill",
		amount: -142.5,
		category: "utilities",
	},
	{
		id: "tx_004",
		accountId: "acct_001",
		date: "2026-02-17",
		description: "Coffee Shop",
		amount: -6.75,
		category: "dining",
	},
	{
		id: "tx_005",
		accountId: "acct_001",
		date: "2026-02-15",
		description: "Gas Station",
		amount: -52.1,
		category: "transport",
	},
	{
		id: "tx_006",
		accountId: "acct_002",
		date: "2026-02-01",
		description: "Monthly Transfer",
		amount: 1_000.0,
		category: "transfer",
	},
	{
		id: "tx_007",
		accountId: "acct_002",
		date: "2026-01-15",
		description: "Interest Payment",
		amount: 18.75,
		category: "interest",
	},
	{
		id: "tx_008",
		accountId: "acct_003",
		date: "2026-02-21",
		description: "Client Invoice #1042",
		amount: 12_500.0,
		category: "income",
	},
	{
		id: "tx_009",
		accountId: "acct_003",
		date: "2026-02-20",
		description: "SaaS Subscription",
		amount: -299.0,
		category: "software",
	},
	{
		id: "tx_010",
		accountId: "acct_003",
		date: "2026-02-18",
		description: "Office Supplies",
		amount: -164.2,
		category: "office",
	},
];

const bills = [
	{
		id: "bill_001",
		name: "Rent",
		amount: 2_100.0,
		dueDate: "2026-03-01",
		status: "upcoming",
		accountId: "acct_001",
	},
	{
		id: "bill_002",
		name: "Internet",
		amount: 79.99,
		dueDate: "2026-02-28",
		status: "upcoming",
		accountId: "acct_001",
	},
	{
		id: "bill_003",
		name: "Insurance",
		amount: 340.0,
		dueDate: "2026-03-05",
		status: "upcoming",
		accountId: "acct_001",
	},
	{
		id: "bill_004",
		name: "Electric",
		amount: 142.5,
		dueDate: "2026-02-18",
		status: "paid",
		accountId: "acct_001",
	},
];

let txCounter = transactions.length;

function ok(data: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
	};
}

// ── MCP Server factory ──────────────────────────────────────────────────

function createBankServer(): McpServer {
	const server = new McpServer({ name: "acme-bank", version: "1.0.0" });

	server.tool(
		"list_accounts",
		"List all bank accounts with balances",
		{},
		async () => ok(accounts),
	);

	server.tool(
		"get_account",
		"Get details of a specific bank account",
		{ accountId: z.string().describe("Account ID (e.g. acct_001)") },
		async ({ accountId }) => {
			const acct = accounts.find((a) => a.id === accountId);
			if (!acct)
				return {
					content: [
						{ type: "text" as const, text: `Account ${accountId} not found.` },
					],
					isError: true,
				};
			return ok(acct);
		},
	);

	server.tool(
		"get_balance",
		"Get the balance of a specific account",
		{ accountId: z.string().describe("Account ID") },
		async ({ accountId }) => {
			const acct = accounts.find((a) => a.id === accountId);
			if (!acct)
				return {
					content: [
						{ type: "text" as const, text: `Account ${accountId} not found.` },
					],
					isError: true,
				};
			return ok({
				accountId: acct.id,
				name: acct.name,
				balance: acct.balance,
				currency: acct.currency,
			});
		},
	);

	server.tool(
		"get_total_balance",
		"Get the combined balance across all accounts",
		{},
		async () => {
			const total = accounts.reduce((sum, a) => sum + a.balance, 0);
			return ok({
				totalBalance: total,
				currency: "USD",
				accountCount: accounts.length,
			});
		},
	);

	server.tool(
		"list_transactions",
		"List recent transactions for an account",
		{
			accountId: z.string().describe("Account ID"),
			limit: z
				.number()
				.optional()
				.default(10)
				.describe("Max transactions to return"),
			category: z.string().optional().describe("Filter by category"),
		},
		async ({ accountId, limit, category }) => {
			let txs = transactions.filter((t) => t.accountId === accountId);
			if (category) txs = txs.filter((t) => t.category === category);
			return ok(txs.slice(0, limit));
		},
	);

	server.tool(
		"search_transactions",
		"Search transactions across all accounts",
		{
			query: z
				.string()
				.describe("Search term (matches description or category)"),
			minAmount: z.number().optional().describe("Minimum amount"),
			maxAmount: z.number().optional().describe("Maximum amount"),
		},
		async ({ query, minAmount, maxAmount }) => {
			const q = query.toLowerCase();
			let results = transactions.filter(
				(t) =>
					t.description.toLowerCase().includes(q) ||
					t.category.toLowerCase().includes(q),
			);
			if (minAmount !== undefined)
				results = results.filter((t) => t.amount >= minAmount);
			if (maxAmount !== undefined)
				results = results.filter((t) => t.amount <= maxAmount);
			return ok(results);
		},
	);

	server.tool(
		"transfer_money",
		"Transfer money between accounts",
		{
			fromAccountId: z.string().describe("Source account ID"),
			toAccountId: z.string().describe("Destination account ID"),
			amount: z.number().positive().describe("Amount to transfer"),
			description: z.string().optional().describe("Transfer description"),
		},
		async ({ fromAccountId, toAccountId, amount, description }) => {
			const from = accounts.find((a) => a.id === fromAccountId);
			const to = accounts.find((a) => a.id === toAccountId);
			if (!from)
				return {
					content: [
						{
							type: "text" as const,
							text: `Source account ${fromAccountId} not found.`,
						},
					],
					isError: true,
				};
			if (!to)
				return {
					content: [
						{
							type: "text" as const,
							text: `Destination account ${toAccountId} not found.`,
						},
					],
					isError: true,
				};
			if (from.balance < amount)
				return {
					content: [
						{
							type: "text" as const,
							text: `Insufficient funds. Balance: $${from.balance.toFixed(2)}`,
						},
					],
					isError: true,
				};

			from.balance -= amount;
			to.balance += amount;
			const desc = description || `Transfer to ${to.name}`;
			const txId = `tx_${String(++txCounter).padStart(3, "0")}`;
			const date = new Date().toISOString().split("T")[0];
			transactions.unshift(
				{
					id: txId,
					accountId: fromAccountId,
					date,
					description: desc,
					amount: -amount,
					category: "transfer",
				},
				{
					id: `tx_${String(++txCounter).padStart(3, "0")}`,
					accountId: toAccountId,
					date,
					description: `Transfer from ${from.name}`,
					amount,
					category: "transfer",
				},
			);
			return ok({
				success: true,
				transactionId: txId,
				fromBalance: from.balance,
				toBalance: to.balance,
			});
		},
	);

	server.tool(
		"get_spending_summary",
		"Get a spending summary grouped by category for an account",
		{
			accountId: z.string().describe("Account ID"),
		},
		async ({ accountId }) => {
			const txs = transactions.filter(
				(t) => t.accountId === accountId && t.amount < 0,
			);
			const byCategory: Record<string, { total: number; count: number }> = {};
			for (const t of txs) {
				if (!byCategory[t.category])
					byCategory[t.category] = { total: 0, count: 0 };
				byCategory[t.category].total += Math.abs(t.amount);
				byCategory[t.category].count++;
			}
			const summary = Object.entries(byCategory)
				.map(([category, data]) => ({
					category,
					totalSpent: data.total,
					transactionCount: data.count,
				}))
				.sort((a, b) => b.totalSpent - a.totalSpent);
			return ok(summary);
		},
	);

	server.tool(
		"list_upcoming_bills",
		"List upcoming and recent bills",
		{
			status: z
				.enum(["upcoming", "paid", "all"])
				.optional()
				.default("all")
				.describe("Filter by status"),
		},
		async ({ status }) => {
			const filtered =
				status === "all" ? bills : bills.filter((b) => b.status === status);
			return ok(filtered);
		},
	);

	server.tool(
		"pay_bill",
		"Pay an upcoming bill",
		{ billId: z.string().describe("Bill ID") },
		async ({ billId }) => {
			const bill = bills.find((b) => b.id === billId);
			if (!bill)
				return {
					content: [
						{ type: "text" as const, text: `Bill ${billId} not found.` },
					],
					isError: true,
				};
			if (bill.status === "paid")
				return {
					content: [
						{
							type: "text" as const,
							text: `Bill "${bill.name}" is already paid.`,
						},
					],
					isError: true,
				};

			const acct = accounts.find((a) => a.id === bill.accountId);
			if (!acct || acct.balance < bill.amount) {
				return {
					content: [{ type: "text" as const, text: "Insufficient funds." }],
					isError: true,
				};
			}

			acct.balance -= bill.amount;
			bill.status = "paid";
			const txId = `tx_${String(++txCounter).padStart(3, "0")}`;
			transactions.unshift({
				id: txId,
				accountId: bill.accountId,
				date: new Date().toISOString().split("T")[0],
				description: `Bill Payment: ${bill.name}`,
				amount: -bill.amount,
				category: "bills",
			});
			return ok({
				success: true,
				bill: bill.name,
				amountPaid: bill.amount,
				remainingBalance: acct.balance,
			});
		},
	);

	return server;
}

// ── HTTP server (Streamable HTTP transport) ─────────────────────────────

const PORT = 4100;
const sessions = new Map<string, StreamableHTTPServerTransport>();

const httpServer = createServer(
	async (req: IncomingMessage, res: ServerResponse) => {
		if (req.url !== "/mcp") {
			res.writeHead(404);
			res.end("Not found");
			return;
		}

		if (req.method === "POST") {
			const sessionId = req.headers["mcp-session-id"] as string | undefined;

			if (sessionId && sessions.has(sessionId)) {
				const transport = sessions.get(sessionId)!;
				await transport.handleRequest(req, res);
				return;
			}

			let capturedId: string | undefined;
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => {
					capturedId = crypto.randomUUID();
					return capturedId;
				},
			});

			transport.onclose = () => {
				if (capturedId) sessions.delete(capturedId);
			};

			const srv = createBankServer();
			await srv.connect(transport);
			await transport.handleRequest(req, res);

			if (capturedId) sessions.set(capturedId, transport);
		} else {
			res.writeHead(405);
			res.end("Method not allowed");
		}
	},
);

httpServer.listen(PORT, () => {
	console.log(
		`🏦 Acme Bank MCP Server running at http://localhost:${PORT}/mcp`,
	);
	console.log("   Add it as a custom MCP server in the dashboard.");
	console.log("   Auth: None");
});
