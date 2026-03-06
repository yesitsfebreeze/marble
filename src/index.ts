#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import d from "./db.js";
import { configureLlm, isLlmConfigured } from "./llm.js";
import { gatherCloud, evaluateCloud, applyEvaluation, evaluateAll } from "./evaluate.js";
import type { TicketStatus } from "./types.js";

// Resolve the marble workspace root — defaults to CWD, overridable via env
const MARBLE_ROOT = process.env.MARBLE_ROOT || process.cwd();
d.init(MARBLE_ROOT);

// ── LLM auto-config from env + README ───────────────────────────────

async function autoConfigureLlm(): Promise<void> {
	const apiKey = process.env.LLM_API_KEY;
	if (!apiKey) return;

	let provider: "anthropic" | "openai" = "anthropic";
	let model = "claude-sonnet-4-20250514";

	try {
		const readme = await fs.readFile(path.resolve(MARBLE_ROOT, "README.md"), "utf-8");
		const providerMatch = readme.match(/^PROVIDER:\s*(\S+)/m);
		const modelMatch = readme.match(/^MODEL:\s*(\S+)/m);
		if (providerMatch?.[1] === "openai") provider = "openai";
		if (modelMatch?.[1]) model = modelMatch[1];
	} catch { /* README not found, use defaults */ }

	configureLlm({ provider, model, apiKey });
}

function resolve(...segments: string[]): string {
	return path.resolve(MARBLE_ROOT, ...segments);
}

async function readIfExists(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(resolve(filePath), "utf-8");
	} catch {
		return null;
	}
}

async function ensureDir(dirPath: string): Promise<void> {
	await fs.mkdir(resolve(dirPath), { recursive: true });
}

// ── Server ──────────────────────────────────────────────────────────

const server = new McpServer({
	name: "marble",
	version: "1.0.0",
});

// ── Resources ───────────────────────────────────────────────────────

server.registerResource("mind", "marble://mind", { mimeType: "text/markdown" }, async (uri) => {
	const content = await readIfExists("mind.md");
	return {
		contents: [
			{
				uri: uri.href,
				mimeType: "text/markdown",
				text: content ?? "_mind.md not found — run @setup first._",
			},
		],
	};
});

server.registerResource("todos", "marble://todos", { mimeType: "text/markdown" }, async (uri) => {
	const content = await readIfExists("todos.md");
	return {
		contents: [
			{
				uri: uri.href,
				mimeType: "text/markdown",
				text: content ?? "_todos.md not found — run @setup first._",
			},
		],
	};
});

server.registerResource("cortex", "marble://cortex", { mimeType: "text/markdown" }, async (uri) => {
	const content = await readIfExists("cortex.md");
	return {
		contents: [
			{
				uri: uri.href,
				mimeType: "text/markdown",
				text: content ?? "_cortex.md not found — run @setup first._",
			},
		],
	};
});

// ── Tools ───────────────────────────────────────────────────────────

server.tool("setup", "Bootstrap Marble — creates runtime files, mind.md, todos.md, directories, and the GitHub Action.", {}, async () => {
	const results: string[] = [];

	// cortex.md
	try {
		await fs.access(resolve("cortex.md"));
	} catch {
		await fs.writeFile(resolve("cortex.md"), "", "utf-8");
		results.push("Created cortex.md");
	}

	// .gitignore — ensure memory/ and .marble_state are listed
	const gitignorePath = resolve(".gitignore");
	let gitignore = "";
	try {
		gitignore = await fs.readFile(gitignorePath, "utf-8");
	} catch { /* doesn't exist yet */ }
	const additions: string[] = [];
	if (!gitignore.includes("memory/")) additions.push("memory/");
	if (!gitignore.includes(".marble_state")) additions.push(".marble_state");
	if (!gitignore.includes(".marble.db")) additions.push(".marble.db");
	if (additions.length) {
		await fs.writeFile(gitignorePath, gitignore.trimEnd() + "\n" + additions.join("\n") + "\n", "utf-8");
		results.push(`.gitignore updated (added ${additions.join(", ")})`);
	}

	// mind.md
	try {
		await fs.access(resolve("mind.md"));
	} catch {
		const mindTemplate = `
███ MIND
│
│ Global index of all tracked files. Max 256 entries. Sorted descending.
│
│
██ SECTION A - Category Scores
│
█ Category █ SCORE █ 
│          │       │
│
│
██ SECTION B - Master File List
│
█ SCORE  █ Category █ HASH █ PATH
│        │          │      │
│
│
██ SECTION C - Open Todos (sorted by category activity)
│
█ # █ Category █ TODO █
│   │          │      │
│
`.trimStart();
		await fs.writeFile(resolve("mind.md"), mindTemplate, "utf-8");
		results.push("Created mind.md");
	}

	// todos.md
	try {
		await fs.access(resolve("todos.md"));
	} catch {
		const todosTemplate = `
███ TODOS
│
│ Central todo list. Managed by @todo.
│
│
█ #  █ STATUS  █ Category █ DATE       █ TODO
│    │         │          │            │
│
`.trimStart();
		await fs.writeFile(resolve("todos.md"), todosTemplate, "utf-8");
		results.push("Created todos.md");
	}

	// Directories
	for (const dir of ["input", "output", "memory", "tools", "peer"]) {
		await ensureDir(dir);
		results.push(`Ensured ${dir}/`);
	}

	// .marble_state
	let mtime: number;
	try {
		const stat = await fs.stat(resolve("README.md"));
		mtime = stat.mtimeMs;
	} catch {
		mtime = Date.now();
	}
	await fs.writeFile(resolve(".marble_state"), `README_MTIME: ${mtime}\n`, "utf-8");
	results.push("Wrote .marble_state");

	// GitHub Action
	const readme = await readIfExists("README.md");
	if (readme) {
		const providerMatch = readme.match(/^PROVIDER:\s*(\S+)/m);
		const modelMatch = readme.match(/^MODEL:\s*(\S+)/m);
		const sourceMatch = readme.match(/^SOURCE:\s*(\S+)/m);
		const provider = providerMatch?.[1] ?? "anthropic";
		const model = modelMatch?.[1] ?? "claude-sonnet-4-20250514";
		const source = sourceMatch?.[1] ?? "marble";

		// Extract workflow template from README
		const workflowStart = readme.indexOf("❚ Workflow template");
		if (workflowStart !== -1) {
			const yamlBlockStart = readme.indexOf("```yaml", workflowStart);
			const yamlBlockEnd = readme.indexOf("```", yamlBlockStart + 7);
			if (yamlBlockStart !== -1 && yamlBlockEnd !== -1) {
				let workflow = readme.slice(yamlBlockStart + 7, yamlBlockEnd).trim();
				workflow = workflow
					.replaceAll("{{PROVIDER}}", provider)
					.replaceAll("{{MODEL}}", model)
					.replaceAll("{{SOURCE}}", source);
				await ensureDir(".github/workflows");
				await fs.writeFile(resolve(".github/workflows/marble.yml"), workflow + "\n", "utf-8");
				results.push("Generated .github/workflows/marble.yml");
			}
		}
	}

	return {
		content: [{ type: "text", text: `[SETUP COMPLETE]\n${results.join("\n")}` }],
	};
});

server.tool(
	"marble",
	"Process the next pending note in input/. Scans, picks one file, routes it to the appropriate command, marks done, and copies to output/.",
	{},
	async () => {
		const inputDir = resolve("input");
		let files: string[];
		try {
			files = (await fs.readdir(inputDir)).filter((f) => f.endsWith(".md"));
		} catch {
			return { content: [{ type: "text", text: "Nothing to process — input/ does not exist. Run @setup first." }] };
		}

		// Filter to pending notes (no STATUS: done)
		const pending: { name: string; mtime: number }[] = [];
		for (const f of files) {
			const text = await fs.readFile(path.join(inputDir, f), "utf-8");
			if (!text.includes("STATUS: done") && !text.includes("STATUS: in-progress")) {
				const stat = await fs.stat(path.join(inputDir, f));
				pending.push({ name: f, mtime: stat.mtimeMs });
			}
		}

		if (!pending.length) {
			return { content: [{ type: "text", text: "[INTAKE] Nothing to process." }] };
		}

		// Oldest first
		pending.sort((a, b) => a.mtime - b.mtime);
		const pick = pending[0];
		const filePath = path.join(inputDir, pick.name);
		let text = await fs.readFile(filePath, "utf-8");

		// Detect source
		const isAI = text.includes("@elbram");
		const source = isAI ? "ai-generated" : "user";

		// Mark in-progress
		text = text.trimEnd() + "\nSTATUS: in-progress\n";
		await fs.writeFile(filePath, text, "utf-8");

		// Detect mode hint
		const modes = ["@reason", "@remember", "@reflect", "@relearn", "@todo"];
		let mode = "infer";
		for (const m of modes) {
			if (text.includes(m)) {
				mode = m;
				break;
			}
		}

		// Mark done
		const now = new Date().toISOString();
		text = text.replace("STATUS: in-progress", "STATUS: done") + `PROCESSED: ${now}\n`;
		await fs.writeFile(filePath, text, "utf-8");

		// Copy to output/
		await ensureDir("output");
		await fs.writeFile(resolve("output", pick.name), text, "utf-8");

		return {
			content: [
				{
					type: "text",
					text: [
						`[INTAKE] Processed: ${pick.name}`,
						`  Mode: ${mode}`,
						`  Source: ${source}`,
						`  Content:\n${text}`,
					].join("\n"),
				},
			],
		};
	}
);

server.tool(
	"reason",
	"Load relevant memory and synthesise context for a query. Auto-runs at start of every message.",
	{ query: z.string().describe("The question or topic to gather context for") },
	async ({ query }) => {
		const mind = await readIfExists("mind.md");
		if (!mind) {
			return { content: [{ type: "text", text: "[CONTEXT FROM MEMORY]\nNo mind.md found — run @setup first.\n[CONFIDENCE: 0.0]" }] };
		}

		// Parse Section B for file paths
		const lines = mind.split("\n");
		const sectionBStart = lines.findIndex((l) => l.includes("SECTION B"));
		if (sectionBStart === -1) {
			return { content: [{ type: "text", text: "[CONTEXT FROM MEMORY]\nmind.md has no Section B.\n[CONFIDENCE: 0.0]" }] };
		}

		const fileRows: { score: number; category: string; hash: string; path: string }[] = [];
		for (let i = sectionBStart + 1; i < lines.length; i++) {
			const line = lines[i];
			if (line.includes("SECTION C")) break;
			const match = line.match(/│\s*(\d+)\s*│\s*(\S+)\s*│\s*(\S+)\s*│\s*(.+?)\s*│?$/);
			if (match) {
				fileRows.push({ score: parseInt(match[1]), category: match[2], hash: match[3], path: match[4].trim() });
			}
		}

		if (!fileRows.length) {
			return { content: [{ type: "text", text: "[CONTEXT FROM MEMORY]\nNo tracked files in mind.md.\n[CONFIDENCE: 0.0]" }] };
		}

		// Simple lexical relevance: score files by keyword overlap with query
		const queryWords = query.toLowerCase().split(/\s+/);
		const scored = fileRows.map((row) => {
			const text = `${row.category} ${row.path}`.toLowerCase();
			const hits = queryWords.filter((w) => text.includes(w)).length;
			return { ...row, taskScore: row.score * (1 + hits) };
		});
		scored.sort((a, b) => b.taskScore - a.taskScore);

		// Read top 10 files
		const sources: string[] = [];
		const facts: string[] = [];
		for (const entry of scored.slice(0, 10)) {
			const content = await readIfExists(entry.path);
			if (content) {
				sources.push(`${entry.hash} │ ${entry.path}`);
				facts.push(`── ${entry.path} (score: ${entry.score}) ──\n${content.slice(0, 500)}`);
			}
		}

		const confidence = facts.length > 0 ? Math.min(0.3 + facts.length * 0.07, 1.0).toFixed(1) : "0.0";
		return {
			content: [
				{
					type: "text",
					text: [
						"[CONTEXT FROM MEMORY]",
						`Sources: ${sources.join(", ") || "none"}`,
						"",
						...facts,
						"",
						`[CONFIDENCE: ${confidence}]`,
					].join("\n"),
				},
			],
		};
	}
);

server.tool(
	"remember",
	"Save one important fact to permanent scored memory. Must stand alone with zero prior context.",
	{ fact: z.string().describe("The fact to remember — should be self-contained and useful in a future session") },
	async ({ fact }) => {
		await ensureDir("memory");

		// Generate hash
		const now = Date.now();
		const category = "general"; // simplified — full implementation would use Section A matching
		const filePath = `memory/${category}/${now.toString(16).slice(-8)}.md`;
		const { createHash } = await import("node:crypto");
		const hash = createHash("sha1").update(`${now}│${filePath}`).digest("hex").slice(0, 8);
		const fullPath = resolve(filePath);

		await ensureDir(`memory/${category}`);

		const header = [
			`- HASH:      ${hash}`,
			`- DATE:      ${new Date(now).toISOString()}`,
			`- CATEGORY:  ${category}`,
			`- SCORE:     750`,
			`- INVARIANT: FALSE`,
			`- NOTE:      ${fact.slice(0, 250)}`,
			`- WHY:       Stored via MCP @remember`,
			`- LINKS:     []`,
			"",
			fact,
		].join("\n");

		await fs.writeFile(fullPath, header, "utf-8");

		// Update mind.md section B
		const mindPath = resolve("mind.md");
		let mind: string;
		try {
			mind = await fs.readFile(mindPath, "utf-8");
		} catch {
			return {
				content: [{ type: "text", text: `[REMEMBER] Saved to ${filePath} (hash: ${hash}) but mind.md not found — run @setup.` }],
			};
		}

		// Insert row into Section B
		const insertMarker = "█ SCORE  █ Category █ HASH █ PATH";
		const insertIdx = mind.indexOf(insertMarker);
		if (insertIdx !== -1) {
			const afterMarker = mind.indexOf("\n", insertIdx) + 1;
			// Skip the separator line (│ │ │ │)
			const afterSep = mind.indexOf("\n", afterMarker) + 1;
			const newRow = `│ 750    │ ${category.padEnd(8)} │ ${hash} │ ${filePath}\n`;
			mind = mind.slice(0, afterSep) + newRow + mind.slice(afterSep);
			await fs.writeFile(mindPath, mind, "utf-8");
		}

		return {
			content: [{ type: "text", text: `[REMEMBERED]\nHash: ${hash}\nPath: ${filePath}\nFact: ${fact}` }],
		};
	}
);

server.tool(
	"todo",
	"Add an action item to todos.md and index it in mind.md Section C.",
	{ description: z.string().describe("Actionable todo text (max 80 chars, starts with a verb)") },
	async ({ description }) => {
		const todosPath = resolve("todos.md");
		let todos: string;
		try {
			todos = await fs.readFile(todosPath, "utf-8");
		} catch {
			return { content: [{ type: "text", text: "todos.md not found — run @setup first." }] };
		}

		// Find next sequential number
		const nums = [...todos.matchAll(/│\s*(\d+)\s*│/g)].map((m) => parseInt(m[1]));
		const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
		const date = new Date().toISOString().slice(0, 10);
		const category = "general";

		const newRow = `│ ${nextNum}  │ pending │ ${category.padEnd(8)} │ ${date} │ ${description} │\n`;

		// Insert at end of table
		const trimmed = todos.trimEnd();
		await fs.writeFile(todosPath, trimmed + "\n" + newRow, "utf-8");

		// Update mind.md Section C
		const mindPath = resolve("mind.md");
		try {
			let mind = await fs.readFile(mindPath, "utf-8");
			const sectionC = "█ # █ Category █ TODO █";
			const idx = mind.indexOf(sectionC);
			if (idx !== -1) {
				const afterMarker = mind.indexOf("\n", idx) + 1;
				const afterSep = mind.indexOf("\n", afterMarker) + 1;
				const cRow = `│ ${nextNum} │ ${category.padEnd(8)} │ ${description} │\n`;
				mind = mind.slice(0, afterSep) + cRow + mind.slice(afterSep);
				await fs.writeFile(mindPath, mind, "utf-8");
			}
		} catch { /* mind.md missing, skip */ }

		return {
			content: [{ type: "text", text: `[TODO ADDED]\n#${nextNum} [${category}]: ${description}` }],
		};
	}
);

server.tool(
	"reflect",
	"Audit Marble's definition files (README.md, cortex.md, mind.md, todos.md) and identify the single highest-impact fix.",
	{ focus: z.string().optional().describe("Optional focus area for the audit") },
	async ({ focus }) => {
		const files = ["README.md", "cortex.md", "mind.md", "todos.md"];
		const contents: Record<string, string | null> = {};
		for (const f of files) {
			contents[f] = await readIfExists(f);
		}

		const missing = files.filter((f) => !contents[f]);
		const report: string[] = ["[REFLECT]"];

		if (missing.length) {
			report.push(`Missing files: ${missing.join(", ")} — run @setup`);
		}

		// Basic checks
		if (contents["mind.md"]) {
			if (!contents["mind.md"].includes("SECTION A")) report.push("mind.md: Missing Section A");
			if (!contents["mind.md"].includes("SECTION B")) report.push("mind.md: Missing Section B");
			if (!contents["mind.md"].includes("SECTION C")) report.push("mind.md: Missing Section C");
		}

		if (contents["todos.md"]) {
			const pendingCount = (contents["todos.md"].match(/│\s*pending\s*│/g) || []).length;
			report.push(`todos.md: ${pendingCount} pending items`);
		}

		if (focus) report.push(`Focus: ${focus}`);
		report.push("\nFull audit requires LLM evaluation. Use this output as context for your review.");

		return {
			content: [{ type: "text", text: report.join("\n") }],
		};
	}
);

server.tool(
	"work",
	"Pick the highest-rated pending todo from mind.md Section C and return it for execution.",
	{},
	async () => {
		const mind = await readIfExists("mind.md");
		if (!mind) {
			return { content: [{ type: "text", text: "[WORK] No mind.md found — run @setup first." }] };
		}

		const lines = mind.split("\n");
		const sectionCStart = lines.findIndex((l) => l.includes("SECTION C"));
		if (sectionCStart === -1) {
			return { content: [{ type: "text", text: "[WORK] No Section C in mind.md." }] };
		}

		// Find first todo row
		for (let i = sectionCStart + 1; i < lines.length; i++) {
			const match = lines[i].match(/│\s*(\d+)\s*│\s*(\S+)\s*│\s*(.+?)\s*│/);
			if (match) {
				return {
					content: [{ type: "text", text: `[WORK] Pick: #${match[1]} [${match[2]}]: ${match[3].trim()}` }],
				};
			}
		}

		return { content: [{ type: "text", text: "[WORK] No pending todos." }] };
	}
);

server.tool(
	"relearn",
	"Compare actual codebase against memory; correct stale or wrong entries.",
	{ path: z.string().optional().describe("Optional file or directory path to restrict the check") },
	async ({ path: targetPath }) => {
		const mind = await readIfExists("mind.md");
		if (!mind) {
			return { content: [{ type: "text", text: "[RELEARN] No mind.md — run @setup first." }] };
		}

		// Parse Section B
		const lines = mind.split("\n");
		const sectionBStart = lines.findIndex((l) => l.includes("SECTION B"));
		if (sectionBStart === -1) {
			return { content: [{ type: "text", text: "[RELEARN] No Section B in mind.md." }] };
		}

		const entries: { score: number; category: string; hash: string; path: string }[] = [];
		for (let i = sectionBStart + 1; i < lines.length; i++) {
			if (lines[i].includes("SECTION C")) break;
			const match = lines[i].match(/│\s*(\d+)\s*│\s*(\S+)\s*│\s*(\S+)\s*│\s*(.+?)\s*│?$/);
			if (match) {
				const entry = { score: parseInt(match[1]), category: match[2], hash: match[3], path: match[4].trim() };
				if (!targetPath || entry.path.startsWith(targetPath)) {
					entries.push(entry);
				}
			}
		}

		// Check which files still exist
		const stale: string[] = [];
		const valid: string[] = [];
		for (const entry of entries.slice(0, 20)) {
			try {
				await fs.access(resolve(entry.path));
				valid.push(entry.path);
			} catch {
				stale.push(entry.path);
			}
		}

		return {
			content: [
				{
					type: "text",
					text: [
						"[RELEARN REPORT]",
						`Checked: ${entries.length} entries`,
						`Valid: ${valid.length}`,
						`Stale (file missing): ${stale.length}${stale.length ? "\n  " + stale.join("\n  ") : ""}`,
						"",
						"Full correction requires LLM evaluation. Use this report as context.",
					].join("\n"),
				},
			],
		};
	}
);

// ── Crawl & Ticket Tools ────────────────────────────────────────────

server.tool(
	"crawl",
	"Scan input/ and memory/ directories, index everything into the local DB, and create cross-links between related items.",
	{},
	async () => {
		const results: string[] = ["[CRAWL]"];
		let notesAdded = 0;
		let memAdded = 0;
		let linksAdded = 0;

		// 1. Crawl input/
		const inputDir = resolve("input");
		try {
			const files = (await fs.readdir(inputDir)).filter(f => f.endsWith(".md"));
			for (const f of files) {
				const filePath = path.join(inputDir, f);
				const content = await fs.readFile(filePath, "utf-8");
				const hash = createHash("sha1").update(content).digest("hex").slice(0, 8);
			const source = content.includes("@elbram") ? "ai" : "user";
				d.notes.create(`input/${f}`, hash, content, source);
				notesAdded++;
			}
		} catch { /* input/ doesn't exist yet */ }

		// 2. Crawl memory/
		async function walkMemory(dir: string): Promise<void> {
			let entries: string[];
			try {
				entries = await fs.readdir(resolve(dir));
			} catch { return; }
			for (const entry of entries) {
				const rel = `${dir}/${entry}`;
				const abs = resolve(rel);
				const stat = await fs.stat(abs);
				if (stat.isDirectory()) {
					await walkMemory(rel);
				} else if (entry.endsWith(".md")) {
					const content = await fs.readFile(abs, "utf-8");
					const hashMatch = content.match(/HASH:\s+(\S+)/);
					const scoreMatch = content.match(/SCORE:\s+(\d+)/);
					const catMatch = content.match(/CATEGORY:\s+(\S+)/);
					const hash = hashMatch?.[1] ?? createHash("sha1").update(content).digest("hex").slice(0, 8);
					const score = scoreMatch ? parseInt(scoreMatch[1]) : 750;
					const category = catMatch?.[1] ?? "general";
					d.memory.create(hash, rel, category, score, content);
					memAdded++;
				}
			}
		}
		await walkMemory("memory");

		// 3. Crawl peer/ for inbound cluster data
		async function walkPeer(dir: string): Promise<void> {
			let entries: string[];
			try {
				entries = await fs.readdir(resolve(dir));
			} catch { return; }
			for (const entry of entries) {
				const rel = `${dir}/${entry}`;
				const abs = resolve(rel);
				const stat = await fs.stat(abs);
				if (stat.isDirectory()) {
					await walkPeer(rel);
				} else if (entry.endsWith(".md")) {
					const content = await fs.readFile(abs, "utf-8");
					const hash = createHash("sha1").update(content).digest("hex").slice(0, 8);
					const peerName = dir.split("/")[1] ?? "peer";
					d.notes.create(rel, hash, content, peerName);
					notesAdded++;
				}
			}
		}
		await walkPeer("peer");

		// 4. Cross-link: notes that share keywords with tickets or memory
		const unprocessed = d.notes.list_unprocessed();
		const tickets = d.ticket.list();

		for (const note of unprocessed) {
			const words = note.content.toLowerCase().split(/\s+/).filter(w => w.length > 3);
			// Link notes to tickets by keyword overlap in title/description
			for (const ticket of tickets) {
				const ticketWords = `${ticket.title} ${ticket.description}`.toLowerCase().split(/\s+/);
				const overlap = words.filter(w => ticketWords.includes(w));
				if (overlap.length >= 2) {
					d.links.create("note", note.id, "ticket", ticket.id, "references");
					linksAdded++;
				}
			}
			d.notes.set_processed(note.id);
		}

		// 5. LLM evaluation pass on newly indexed memory (if configured)
		let evalReport = "";
		if (isLlmConfigured() && memAdded > 0) {
			const allMem = d.getDb().prepare(
				`SELECT * FROM memory ORDER BY created_at DESC LIMIT ?`
			).all(memAdded) as { id: number }[];

			let evalUpdated = 0;
			let evalPruned = 0;
			let evalLinks = 0;
			for (const m of allMem) {
				try {
					const cloud = gatherCloud("memory", m.id);
					const result = await evaluateCloud(cloud);
					const r = applyEvaluation(result);
					evalUpdated += r.updated;
					evalPruned += r.pruned;
					evalLinks += r.linksCreated;
				} catch { /* LLM call failed, skip */ }
			}
			evalReport = `\nLLM eval: ${evalUpdated} scored, ${evalPruned} pruned, ${evalLinks} links discovered`;
		}

		results.push(`Notes indexed: ${notesAdded}`);
		results.push(`Memory indexed: ${memAdded}`);
		results.push(`Links created: ${linksAdded}`);
		results.push(`Unprocessed notes scanned: ${unprocessed.length}`);
		if (evalReport) results.push(evalReport);

		return { content: [{ type: "text", text: results.join("\n") }] };
	}
);

server.tool(
	"ticket",
	"Create a new ticket. Returns the ticket ID. Todos can be attached to it.",
	{
		title: z.string().describe("Short ticket title"),
		description: z.string().optional().describe("Longer description of the work"),
		initiator: z.string().optional().describe("Who or what created this ticket"),
	},
	async ({ title, description, initiator }) => {
		const ticket = d.ticket.create(title, description ?? "", initiator);
		return {
			content: [{ type: "text", text: `[TICKET CREATED]\nID: ${ticket.id}\nTitle: ${ticket.title}\nStatus: ${ticket.status}` }],
		};
	}
);

server.tool(
	"ticket_todo",
	"Add a todo to an existing ticket.",
	{
		ticket_id: z.number().describe("Ticket ID to attach the todo to"),
		description: z.string().describe("Actionable todo (starts with a verb)"),
		category: z.string().optional().describe("Category tag"),
	},
	async ({ ticket_id, description, category }) => {
		const ticket = d.ticket.get(ticket_id);
		if (!ticket) {
			return { content: [{ type: "text", text: `[ERROR] Ticket #${ticket_id} not found.` }] };
		}
		const todo = d.todo.create(description, ticket_id, category);
		// Move ticket to in_progress if it was open
		if (ticket.status === "open") {
			d.ticket.update_status(ticket_id, "in_progress");
		}
		return {
			content: [{ type: "text", text: `[TODO ADDED TO TICKET #${ticket_id}]\nTodo #${todo.id}: ${description}` }],
		};
	}
);

server.tool(
	"complete_todo",
	"Mark a todo as done. If all todos for its ticket are done, the ticket moves to outgoing.",
	{
		todo_id: z.number().describe("The todo ID to mark done"),
	},
	async ({ todo_id }) => {
		d.todo.complete(todo_id);

		// Check if this todo belongs to a ticket and if all are done
		const todoRow = d.getDb().prepare(`SELECT * FROM todos WHERE id = ?`).get(todo_id) as { ticket_id: number | null } | undefined;
		const report: string[] = [`[TODO #${todo_id} DONE]`];

		if (todoRow?.ticket_id) {
			const ticketId = todoRow.ticket_id;
			if (d.todo.all_done(ticketId)) {
				d.ticket.update_status(ticketId, "outgoing");
				report.push(`All todos for ticket #${ticketId} complete — status → outgoing`);

				// Auto-generate outgoing artifact
				const ctx = d.ticket.get_context(ticketId);
				if (ctx.ticket) {
					const artifact = [
						`███ TICKET #${ticketId} — ${ctx.ticket.title}`,
						`│ Status: outgoing`,
						`│ Initiator: ${ctx.ticket.initiator ?? "local"}`,
						`│ Created: ${ctx.ticket.created_at}`,
						`│`,
						`██ DESCRIPTION`,
						ctx.ticket.description,
						``,
						`██ COMPLETED TODOS`,
						...ctx.todos.map(t => `│ [x] #${t.id} ${t.description} (${t.completed_at})`),
						``,
						`██ LINKED NOTES`,
						...ctx.linkedNotes.map(n => `│ ${n.path} (${n.creator})`),
						``,
						`██ LINKED MEMORY`,
						...ctx.linkedMemory.map(m => `│ [${m.score}] ${m.path}`),
					].join("\n");

					await ensureDir("output");
					const outFile = `output/ticket-${ticketId}.md`;
					await fs.writeFile(resolve(outFile), artifact, "utf-8");
					report.push(`Artifact written: ${outFile}`);
				}
			} else {
				const remaining = d.todo.list_for_ticket(ticketId).filter(t => t.status !== "done");
				report.push(`Ticket #${ticketId}: ${remaining.length} todo(s) remaining`);
			}
		}

		return { content: [{ type: "text", text: report.join("\n") }] };
	}
);

server.tool(
	"push_outgoing",
	"Push all outgoing tickets to connected peer repos. Enriches each with implementation context before sending.",
	{},
	async () => {
		const outgoing = d.ticket.list("outgoing");
		if (!outgoing.length) {
			return { content: [{ type: "text", text: "[PUSH] No outgoing tickets." }] };
		}

		const report: string[] = ["[PUSH]"];

		// Read peer config from README
		const readme = await readIfExists("README.md");
		const peers: { name: string; url: string; output: boolean }[] = [];
		if (readme) {
			const peerLines = readme.match(/│\s*(\S+)\s*│\s*(\S+)\s*│\s*(yes|no)\s*│\s*(yes|no)\s*/g);
			if (peerLines) {
				for (const line of peerLines) {
					const m = line.match(/│\s*(\S+)\s*│\s*(\S+)\s*│\s*(yes|no)\s*│\s*(yes|no)\s*/);
					if (m && m[4] === "yes") {
						peers.push({ name: m[1], url: m[2], output: true });
					}
				}
			}
		}

		for (const ticket of outgoing) {
			const outFile = `output/ticket-${ticket.id}.md`;
			const exists = await readIfExists(outFile);

			if (!exists) {
				// Generate if missing
				const ctx = d.ticket.get_context(ticket.id);
				const artifact = [
					`███ TICKET #${ticket.id} — ${ticket.title}`,
					`│ Status: outgoing → pushed`,
					`│ Initiator: ${ticket.initiator ?? "local"}`,
					`│ Created: ${ticket.created_at}`,
					`│`,
					`██ DESCRIPTION`,
					ticket.description,
					``,
					`██ COMPLETED TODOS`,
					...ctx.todos.map(t => `│ [x] #${t.id} ${t.description}`),
					``,
					`██ LINKED NOTES`,
					...ctx.linkedNotes.map(n => `│ ${n.path} (${n.creator})`),
					``,
					`██ LINKED MEMORY`,
					...ctx.linkedMemory.map(m => `│ [${m.score}] ${m.path}`),
				].join("\n");
				await ensureDir("output");
				await fs.writeFile(resolve(outFile), artifact, "utf-8");
			}

			// Copy to each OUTPUT peer's input/
			for (const peer of peers) {
				const peerInputDir = resolve("peer", peer.name, "input");
				try {
					await ensureDir(path.relative(MARBLE_ROOT, peerInputDir));
					const content = await fs.readFile(resolve(outFile), "utf-8");
					await fs.writeFile(path.join(peerInputDir, `ticket-${ticket.id}.md`), content, "utf-8");
					report.push(`Ticket #${ticket.id} → ${peer.name}/input/`);
				} catch (err) {
					report.push(`Ticket #${ticket.id} → ${peer.name} FAILED: ${err}`);
				}
			}

			d.ticket.update_status(ticket.id, "closed");
			report.push(`Ticket #${ticket.id} closed`);
		}

		if (!peers.length) {
			report.push("No OUTPUT peers configured — artifacts are in output/ only.");
		}

		return { content: [{ type: "text", text: report.join("\n") }] };
	}
);

server.tool(
	"status",
	"Show the state of all tickets, their todos, and link counts.",
	{
		ticket_id: z.number().optional().describe("Optional: show detail for a specific ticket"),
	},
	async ({ ticket_id }) => {
		if (ticket_id) {
			const ctx = d.ticket.get_context(ticket_id);
			if (!ctx.ticket) {
				return { content: [{ type: "text", text: `Ticket #${ticket_id} not found.` }] };
			}
			const lines = [
				`███ TICKET #${ctx.ticket.id}`,
				`│ Title: ${ctx.ticket.title}`,
				`│ Status: ${ctx.ticket.status}`,
				`│ Initiator: ${ctx.ticket.initiator ?? "—"}`,
				`│ Created: ${ctx.ticket.created_at}`,
				`│`,
				`██ TODOS (${ctx.todos.length})`,
				...ctx.todos.map(t => `│ ${t.status === "done" ? "[x]" : "[ ]"} #${t.id} ${t.description}`),
				``,
				`██ LINKED NOTES (${ctx.linkedNotes.length})`,
				...ctx.linkedNotes.map(n => `│ ${n.path}`),
				``,
				`██ LINKED MEMORY (${ctx.linkedMemory.length})`,
				...ctx.linkedMemory.map(m => `│ [${m.score}] ${m.path}`),
			];
			return { content: [{ type: "text", text: lines.join("\n") }] };
		}

		// Overview of all tickets
		const all = d.ticket.list();
		if (!all.length) {
			return { content: [{ type: "text", text: "No tickets." }] };
		}
		const lines = ["███ ALL TICKETS", ""];
		for (const t of all) {
			const todos = d.todo.list_for_ticket(t.id);
			const done = todos.filter(td => td.status === "done").length;
			lines.push(`│ #${t.id} [${t.status}] ${t.title}  (${done}/${todos.length} todos)`);
		}
		return { content: [{ type: "text", text: lines.join("\n") }] };
	}
);

server.tool(
	"query",
	"Search across all clusters — local notes, memory, tickets, and peer data. The single I/O surface for information retrieval.",
	{
		q: z.string().describe("Search query — keywords or a natural-language question"),
	},
	async ({ q }) => {
		const keywords = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);
		const results: string[] = ["[QUERY RESULTS]", ""];

		// Search memory
		const memResults = d.memory.query(keywords, 10);
		if (memResults.length) {
			results.push(`██ MEMORY (${memResults.length} hits)`);
			for (const m of memResults) {
				results.push(`│ [${m.score}] ${m.category}/${m.hash} — ${m.content.slice(0, 120)}`);
			}
			results.push("");
		}

		// Search notes
		if (keywords.length) {
			const noteConds = keywords.map(() => `content LIKE ?`);
			const noteParams = keywords.map(k => `%${k}%`);
			const notes = d.getDb().prepare(
				`SELECT * FROM notes WHERE ${noteConds.join(" OR ")} ORDER BY created_at DESC LIMIT 10`
			).all(...noteParams) as { id: number; path: string; creator: string; content: string }[];
			if (notes.length) {
				results.push(`██ NOTES (${notes.length} hits)`);
				for (const n of notes) {
					results.push(`│ ${n.path} (${n.creator}) — ${n.content.slice(0, 120)}`);
				}
				results.push("");
			}
		}

		// Search tickets
		if (keywords.length) {
			const ticketConds = keywords.map(() => `(title LIKE ? OR description LIKE ?)`);
			const ticketParams: string[] = [];
			for (const k of keywords) {
				ticketParams.push(`%${k}%`, `%${k}%`);
			}
			const tickets = d.getDb().prepare(
				`SELECT * FROM tickets WHERE ${ticketConds.join(" OR ")} ORDER BY updated_at DESC LIMIT 10`
			).all(...ticketParams) as { id: number; title: string; status: string; description: string }[];
			if (tickets.length) {
				results.push(`██ TICKETS (${tickets.length} hits)`);
				for (const t of tickets) {
					results.push(`│ #${t.id} [${t.status}] ${t.title}`);
				}
				results.push("");
			}
		}

		if (results.length <= 2) {
			results.push("No results found.");
		}

		return { content: [{ type: "text", text: results.join("\n") }] };
	}
);

// ── Evaluate Tools ──────────────────────────────────────────────────

server.tool(
	"evaluate",
	"Score a single item by gathering its cloud (neighborhood) and running LLM evaluation. Updates scores, categories, and creates discovered links.",
	{
		type: z.enum(["memory", "note", "ticket"]).describe("Type of item to evaluate"),
		id: z.number().describe("ID of the item to evaluate"),
	},
	async ({ type, id }) => {
		if (!isLlmConfigured()) {
			return { content: [{ type: "text", text: "[EVALUATE] LLM not configured. Set LLM_API_KEY env var." }] };
		}

		const cloud = gatherCloud(type, id);
		if (cloud.anchor.summary === "(not found)") {
			return { content: [{ type: "text", text: `[EVALUATE] ${type}:${id} not found.` }] };
		}

		const result = await evaluateCloud(cloud);
		const report = applyEvaluation(result);

		const lines = [
			`[EVALUATE] ${type}:${id}`,
			`Cloud size: 1 anchor + ${cloud.neighbors.length} neighbors`,
			`Updated: ${report.updated} | Pruned: ${report.pruned} | Links created: ${report.linksCreated}`,
			"",
			...report.details,
		];

		return { content: [{ type: "text", text: lines.join("\n") }] };
	}
);

server.tool(
	"evaluate_all",
	"Full re-score pass: evaluate every memory entry's cloud with LLM. Expensive but thorough — updates all scores, prunes dead items, discovers new links.",
	{},
	async () => {
		if (!isLlmConfigured()) {
			return { content: [{ type: "text", text: "[EVALUATE ALL] LLM not configured. Set LLM_API_KEY env var." }] };
		}

		const report = await evaluateAll();

		const lines = [
			"[EVALUATE ALL]",
			`Updated: ${report.updated} | Pruned: ${report.pruned} | Links created: ${report.linksCreated}`,
			"",
			...report.details,
		];

		return { content: [{ type: "text", text: lines.join("\n") }] };
	}
);

// ── Prompts ─────────────────────────────────────────────────────────

server.prompt("marble-system", "The full Marble system prompt from README.md + cortex.md", async () => {
	const cortex = await readIfExists("cortex.md");
	const readme = await readIfExists("README.md");
	const parts: string[] = [];
	if (cortex?.trim()) parts.push(cortex);
	if (readme) parts.push(readme);
	return { messages: [{ role: "user", content: { type: "text", text: parts.join("\n\n") || "README.md not found." } }] };
});

// ── Start ───────────────────────────────────────────────────────────

async function main() {
	await autoConfigureLlm();
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((err) => {
	console.error("Marble MCP server failed to start:", err);
	process.exit(1);
});
