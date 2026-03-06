import { llmCall, isLlmConfigured } from "./llm.js";
import d from "./db.js";
import type { MemoryEntry, Note, Ticket, Link } from "./types.js";

// ── Scoring constants (from README CONFIG) ──────────────────────────

const SCORE_MIN = 1;
const SCORE_MAX = 1000;
const SCORE_PRUNE = 15;
const SCORE_INITIAL = 750;
const SCORE_USED = 30;    // +delta when item was useful
const SCORE_UNUSED = -10; // -delta when item was surfaced but not useful

// ── Cloud: gather neighborhood around a node ────────────────────────

export interface CloudNode {
	type: "memory" | "note" | "ticket";
	id: number;
	score: number | null;    // null for notes/tickets (they don't have scores)
	category: string;
	summary: string;         // truncated content for LLM context window
	path?: string;
}

export interface Cloud {
	anchor: CloudNode;
	neighbors: CloudNode[];
}

/**
 * Gather the "cloud" around a target — its linked items,
 * same-category siblings, and keyword-similar items.
 * This is what the LLM sees for context.
 */
export function gatherCloud(
	targetType: "memory" | "note" | "ticket",
	targetId: number,
	radius = 15,
): Cloud {
	// 1. Get the anchor node
	const anchor = loadNode(targetType, targetId);
	if (!anchor) {
		return { anchor: { type: targetType, id: targetId, score: null, category: "unknown", summary: "(not found)" }, neighbors: [] };
	}

	const seen = new Set<string>();
	seen.add(`${targetType}:${targetId}`);
	const neighbors: CloudNode[] = [];

	// 2. Direct links (both directions)
	const outLinks = d.links.get_from(targetType, targetId);
	const inLinks = d.links.get_to(targetType, targetId);
	const allLinks = [...outLinks, ...inLinks];

	for (const link of allLinks) {
		const [linkType, linkId] = link.from_type === targetType && link.from_id === targetId
			? [link.to_type, link.to_id]
			: [link.from_type, link.from_id];
		const key = `${linkType}:${linkId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const node = loadNode(linkType as CloudNode["type"], linkId);
		if (node) neighbors.push(node);
	}

	// 3. Same-category memory (top by score, skip already seen)
	if (anchor.category && anchor.category !== "unknown") {
		const catMemory = d.getDb().prepare(
			`SELECT * FROM memory WHERE category = ? ORDER BY score DESC LIMIT ?`
		).all(anchor.category, radius) as MemoryEntry[];
		for (const m of catMemory) {
			const key = `memory:${m.id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			neighbors.push({
				type: "memory",
				id: m.id,
				score: m.score,
				category: m.category,
				summary: m.content.slice(0, 300),
				path: m.path,
			});
			if (neighbors.length >= radius) break;
		}
	}

	// 4. Keyword-similar items from memory (extract meaningful words from anchor)
	const anchorWords = extractKeywords(anchor.summary);
	if (anchorWords.length > 0 && neighbors.length < radius) {
		const keywordHits = d.memory.query(anchorWords.slice(0, 5), radius);
		for (const m of keywordHits) {
			const key = `memory:${m.id}`;
			if (seen.has(key)) continue;
			seen.add(key);
			neighbors.push({
				type: "memory",
				id: m.id,
				score: m.score,
				category: m.category,
				summary: m.content.slice(0, 300),
				path: m.path,
			});
			if (neighbors.length >= radius) break;
		}
	}

	return { anchor, neighbors };
}

function loadNode(type: string, id: number): CloudNode | null {
	const db = d.getDb();
	if (type === "memory") {
		const row = db.prepare(`SELECT * FROM memory WHERE id = ?`).get(id) as MemoryEntry | undefined;
		if (!row) return null;
		return { type: "memory", id: row.id, score: row.score, category: row.category, summary: row.content.slice(0, 300), path: row.path };
	}
	if (type === "note") {
		const row = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as Note | undefined;
		if (!row) return null;
		return { type: "note", id: row.id, score: null, category: "note", summary: row.content.slice(0, 300), path: row.path };
	}
	if (type === "ticket") {
		const row = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id) as Ticket | undefined;
		if (!row) return null;
		return { type: "ticket", id: row.id, score: null, category: "ticket", summary: `${row.title}\n${row.description}`.slice(0, 300) };
	}
	return null;
}

function extractKeywords(text: string): string[] {
	const stopWords = new Set([
		"the", "and", "for", "that", "this", "with", "from", "are", "was",
		"were", "been", "have", "has", "had", "will", "would", "could",
		"should", "not", "but", "they", "them", "their", "what", "when",
		"where", "which", "who", "how", "all", "each", "every", "both",
		"few", "more", "most", "other", "some", "such", "than", "too",
		"very", "can", "just", "into", "also", "only",
	]);

	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length > 3 && !stopWords.has(w))
		.slice(0, 20);
}

// ── LLM Evaluation ─────────────────────────────────────────────────

export interface EvalResult {
	items: EvalItem[];
	suggestedLinks: SuggestedLink[];
}

export interface EvalItem {
	type: string;
	id: number;
	score: number;           // 1–1000
	category: string;
	reasoning: string;       // one-line justification
}

export interface SuggestedLink {
	from_type: string;
	from_id: number;
	to_type: string;
	to_id: number;
	relation: string;
}

const EVAL_SYSTEM = `You are a scoring engine for a knowledge management system called Marble.
You evaluate items in a knowledge graph by analyzing their content and relationships.

Your job:
1. Read the ANCHOR item and its CLOUD (neighboring items).
2. For each item (anchor + neighbors), assign a SCORE from 1 to 1000 based on:
   - Relevance: How useful is this item in the context of the anchor and its neighborhood?
   - Quality: Is the information correct, specific, and actionable?
   - Freshness: Does it contain current, non-stale information?
   - Connectivity: Does it relate meaningfully to other items?
3. Assign or verify a CATEGORY for each item (short lowercase slug, e.g., "auth", "deployment", "api-design").
4. Suggest any missing LINKS between items that clearly relate but aren't connected.

Scoring guidelines:
- 900-1000: Critical, frequently-needed, highly interconnected knowledge
- 700-899:  Important, regularly useful, well-connected
- 400-699:  Moderately useful, occasionally referenced
- 100-399:  Low utility, rarely relevant, possibly stale
- 1-99:     Near-worthless, candidate for pruning

Respond with ONLY valid JSON (no markdown fencing, no explanation outside JSON):
{
  "items": [
    { "type": "memory|note|ticket", "id": <number>, "score": <1-1000>, "category": "<slug>", "reasoning": "<one line>" }
  ],
  "suggested_links": [
    { "from_type": "<type>", "from_id": <id>, "to_type": "<type>", "to_id": <id>, "relation": "references|implements|blocks|extracts" }
  ]
}`;

function buildEvalPrompt(cloud: Cloud): string {
	const lines: string[] = [];

	lines.push("═══ ANCHOR ═══");
	lines.push(formatNode(cloud.anchor));
	lines.push("");
	lines.push(`═══ CLOUD (${cloud.neighbors.length} neighbors) ═══`);

	for (const n of cloud.neighbors) {
		lines.push("---");
		lines.push(formatNode(n));
	}

	lines.push("");
	lines.push("Score ALL items above (anchor + every neighbor). Return JSON only.");

	return lines.join("\n");
}

function formatNode(node: CloudNode): string {
	const parts = [
		`[${node.type}:${node.id}]`,
		node.score !== null ? `score=${node.score}` : "",
		`category=${node.category}`,
		node.path ? `path=${node.path}` : "",
		"",
		node.summary,
	].filter(Boolean);
	return parts.join("\n");
}

/**
 * Run LLM evaluation on a cloud. Returns scored items and suggested links.
 */
export async function evaluateCloud(cloud: Cloud): Promise<EvalResult> {
	if (!isLlmConfigured()) {
		throw new Error("LLM not configured — set LLM_API_KEY env var.");
	}

	const prompt = buildEvalPrompt(cloud);
	const response = await llmCall(EVAL_SYSTEM, prompt, 4096);

	// Parse JSON response — strip markdown fencing if the model wrapped it
	let cleaned = response.text.trim();
	if (cleaned.startsWith("```")) {
		cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
	}

	let parsed: { items?: unknown[]; suggested_links?: unknown[] };
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		// If JSON parsing fails, return empty result rather than crashing
		return { items: [], suggestedLinks: [] };
	}

	const items: EvalItem[] = [];
	if (Array.isArray(parsed.items)) {
		for (const raw of parsed.items) {
			const r = raw as Record<string, unknown>;
			if (typeof r.type === "string" && typeof r.id === "number" && typeof r.score === "number") {
				items.push({
					type: r.type,
					id: r.id,
					score: clampScore(r.score),
					category: typeof r.category === "string" ? r.category : "general",
					reasoning: typeof r.reasoning === "string" ? r.reasoning : "",
				});
			}
		}
	}

	const suggestedLinks: SuggestedLink[] = [];
	if (Array.isArray(parsed.suggested_links)) {
		for (const raw of parsed.suggested_links) {
			const r = raw as Record<string, unknown>;
			if (
				typeof r.from_type === "string" && typeof r.from_id === "number" &&
				typeof r.to_type === "string" && typeof r.to_id === "number"
			) {
				suggestedLinks.push({
					from_type: r.from_type,
					from_id: r.from_id,
					to_type: r.to_type,
					to_id: r.to_id,
					relation: typeof r.relation === "string" ? r.relation : "references",
				});
			}
		}
	}

	return { items, suggestedLinks };
}

function clampScore(score: number): number {
	return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(score)));
}

// ── Apply evaluation results to the DB ──────────────────────────────

export interface ApplyReport {
	updated: number;
	pruned: number;
	linksCreated: number;
	details: string[];
}

/**
 * Apply evaluation results: update scores, categories, prune dead items, create links.
 */
export function applyEvaluation(result: EvalResult): ApplyReport {
	const db = d.getDb();
	const report: ApplyReport = { updated: 0, pruned: 0, linksCreated: 0, details: [] };

	for (const item of result.items) {
		if (item.type === "memory") {
			const current = db.prepare(`SELECT * FROM memory WHERE id = ?`).get(item.id) as MemoryEntry | undefined;
			if (!current) continue;

			if (item.score <= SCORE_PRUNE) {
				// Prune: delete the memory entry and its links
				db.prepare(`DELETE FROM memory WHERE id = ?`).run(item.id);
				db.prepare(`DELETE FROM links WHERE (from_type = 'memory' AND from_id = ?) OR (to_type = 'memory' AND to_id = ?)`).run(item.id, item.id);
				report.pruned++;
				report.details.push(`PRUNED memory:${item.id} (${current.path}) — score ${item.score} ≤ ${SCORE_PRUNE}: ${item.reasoning}`);
			} else {
				// Update score and category
				db.prepare(`UPDATE memory SET score = ?, category = ? WHERE id = ?`).run(item.score, item.category, item.id);
				report.updated++;
				const delta = item.score - current.score;
				const arrow = delta > 0 ? `↑${delta}` : delta < 0 ? `↓${Math.abs(delta)}` : "=";
				report.details.push(`memory:${item.id} ${current.score}→${item.score} (${arrow}) [${item.category}]: ${item.reasoning}`);
			}
		}
		// Notes and tickets don't have mutable scores in the DB yet,
		// but we still log the evaluation for visibility
		if (item.type === "note" || item.type === "ticket") {
			report.details.push(`${item.type}:${item.id} eval=${item.score} [${item.category}]: ${item.reasoning}`);
		}
	}

	// Create suggested links
	for (const link of result.suggestedLinks) {
		const created = d.links.create(link.from_type, link.from_id, link.to_type, link.to_id, link.relation);
		if (created) {
			report.linksCreated++;
			report.details.push(`LINKED ${link.from_type}:${link.from_id} →[${link.relation}]→ ${link.to_type}:${link.to_id}`);
		}
	}

	return report;
}

// ── Batch evaluation: run across all memory ─────────────────────────

/**
 * Evaluate all memory entries in batches, using each as an anchor.
 * This is the full re-score pass — expensive but thorough.
 */
export async function evaluateAll(batchSize = 10): Promise<ApplyReport> {
	const allMemory = d.getDb().prepare(`SELECT * FROM memory ORDER BY score DESC`).all() as MemoryEntry[];
	const totalReport: ApplyReport = { updated: 0, pruned: 0, linksCreated: 0, details: [] };

	// Process in batches — each batch evaluates one anchor's cloud
	for (let i = 0; i < allMemory.length; i += batchSize) {
		const batch = allMemory.slice(i, i + batchSize);

		for (const entry of batch) {
			// Check if it was already pruned in a previous iteration
			const stillExists = d.getDb().prepare(`SELECT id FROM memory WHERE id = ?`).get(entry.id);
			if (!stillExists) continue;

			const cloud = gatherCloud("memory", entry.id);
			if (cloud.neighbors.length === 0 && cloud.anchor.summary === "(not found)") continue;

			try {
				const result = await evaluateCloud(cloud);
				const report = applyEvaluation(result);
				totalReport.updated += report.updated;
				totalReport.pruned += report.pruned;
				totalReport.linksCreated += report.linksCreated;
				totalReport.details.push(...report.details);
			} catch (err) {
				totalReport.details.push(`ERROR evaluating memory:${entry.id}: ${err}`);
			}
		}
	}

	return totalReport;
}
