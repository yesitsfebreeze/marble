// ── Core domain types ───────────────────────────────────────────────

export type TicketStatus = "open" | "in_progress" | "outgoing" | "closed";
export type TodoStatus = "pending" | "in_progress" | "done";

export interface Ticket {
	id: number;
	title: string;
	description: string;
	status: TicketStatus;
	initiator: string | null;
	created_at: string;
	updated_at: string;
}

export interface Todo {
	id: number;
	ticket_id: number | null;
	description: string;
	status: TodoStatus;
	category: string;
	created_at: string;
	completed_at: string | null;
}

export interface Note {
	id: number;
	path: string;
	hash: string;
	content: string;
	creator: string;          // "user" | "ai" | peer name
	processed: boolean;
	created_at: string;
}

export interface Link {
	id: number;
	from_type: "note" | "todo" | "ticket" | "memory";
	from_id: number;
	to_type: "note" | "todo" | "ticket" | "memory";
	to_id: number;
	relation: string;        // "extracts" | "implements" | "references" | "blocks"
	created_at: string;
}

export interface MemoryEntry {
	id: number;
	hash: string;
	path: string;
	category: string;
	score: number;
	content: string;
	created_at: string;
}