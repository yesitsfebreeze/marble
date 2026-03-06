import Database from "better-sqlite3";
import * as path from "node:path";
import type { Ticket, Todo, Note, Link, MemoryEntry, TicketStatus, TodoStatus } from "./types.js";

let _db: Database.Database | null = null;

function init(root: string): void {
	if (_db) return;

	const dbPath = path.resolve(root, ".marble.db");
	_db = new Database(dbPath);

	// WAL mode for better concurrent read perf
	_db.pragma("journal_mode = WAL");
	_db.pragma("foreign_keys = ON");

	migrate(_db);
}

function getDb(): Database.Database {
	if (!_db) throw new Error("Database not initialized. Call init() first.");
	return _db;
}

// Schema

function migrate(db: Database.Database): void {
	db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      status      TEXT    NOT NULL DEFAULT 'open',
      initiator   TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS todos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id    INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
      description  TEXT    NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'pending',
      category     TEXT    NOT NULL DEFAULT 'general',
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      path       TEXT    NOT NULL UNIQUE,
      hash       TEXT    NOT NULL,
      content    TEXT    NOT NULL DEFAULT '',
      creator     TEXT    NOT NULL DEFAULT 'user',
      processed  INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memory (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      hash       TEXT    NOT NULL UNIQUE,
      path       TEXT    NOT NULL,
      category   TEXT    NOT NULL DEFAULT 'general',
      score      INTEGER NOT NULL DEFAULT 750,
      content    TEXT    NOT NULL DEFAULT '',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS links (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      from_type  TEXT    NOT NULL,
      from_id    INTEGER NOT NULL,
      to_type    TEXT    NOT NULL,
      to_id      INTEGER NOT NULL,
      relation   TEXT    NOT NULL DEFAULT 'references',
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(from_type, from_id, to_type, to_id, relation)
    );

    CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_type, from_id);
    CREATE INDEX IF NOT EXISTS idx_links_to   ON links(to_type, to_id);
    CREATE INDEX IF NOT EXISTS idx_todos_ticket ON todos(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_notes_path ON notes(path);
    CREATE INDEX IF NOT EXISTS idx_memory_score ON memory(score DESC);
  `);
}

const links = {
	create: (
		fromType: string, fromId: number,
		toType: string, toId: number,
		relation: string
	): Link | null => {
		try {
			const stmt = getDb().prepare(`
      INSERT INTO links (from_type, from_id, to_type, to_id, relation)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
      RETURNING *
    `);
			return stmt.get(fromType, fromId, toType, toId, relation) as Link | null;
		} catch {
			return null;
		}
	},

	get_from: (fromType: string, fromId: number): Link[] => {
		return getDb().prepare(`SELECT * FROM links WHERE from_type = ? AND from_id = ?`).all(fromType, fromId) as Link[];
	},

	get_to: (toType: string, toId: number): Link[] => {
		return getDb().prepare(`SELECT * FROM links WHERE to_type = ? AND to_id = ?`).all(toType, toId) as Link[];
	},
}

const memory = {
	create: (hash: string, memPath: string, category: string, score: number, content: string): MemoryEntry => {
		const stmt = getDb().prepare(`
    INSERT INTO memory (hash, path, category, score, content)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(hash) DO UPDATE SET score = excluded.score, content = excluded.content
    RETURNING *
  `);
		return stmt.get(hash, memPath, category, score, content) as MemoryEntry;
	},

	query: (keywords: string[], limit = 20): MemoryEntry[] => {
		const db = getDb();
		if (!keywords.length) {
			return db.prepare(`SELECT * FROM memory ORDER BY score DESC LIMIT ?`).all(limit) as MemoryEntry[];
		}
		// Simple keyword match across content, category, path
		const conditions = keywords.map(() => `(content LIKE ? OR category LIKE ? OR path LIKE ?)`);
		const params: (string | number)[] = [];
		for (const kw of keywords) {
			const like = `%${kw}%`;
			params.push(like, like, like);
		}
		params.push(limit);
		return db.prepare(
			`SELECT * FROM memory WHERE ${conditions.join(" OR ")} ORDER BY score DESC LIMIT ?`
		).all(...params) as MemoryEntry[];
	}
}

const todo = {
	create: (description: string, ticketId?: number, category?: string): Todo => {
		const stmt = getDb().prepare(
			`INSERT INTO todos (description, ticket_id, category) VALUES (?, ?, ?) RETURNING *`
		);
		return stmt.get(description, ticketId ?? null, category ?? "general") as Todo;
	},
	complete: (id: number): void => {
		getDb().prepare(`UPDATE todos SET status = 'done', completed_at = datetime('now') WHERE id = ?`).run(id);
	},
	list_for_ticket: (ticketId: number): Todo[] => {
		return getDb().prepare(`SELECT * FROM todos WHERE ticket_id = ? ORDER BY id`).all(ticketId) as Todo[];
	},
	list: (status?: TodoStatus): Todo[] => {
		const db = getDb();
		if (status) {
			return db.prepare(`SELECT * FROM todos WHERE status = ? ORDER BY created_at DESC`).all(status) as Todo[];
		}
		return db.prepare(`SELECT * FROM todos ORDER BY created_at DESC`).all() as Todo[];
	},
	list_done: (): Todo[] => {
		return getDb().prepare(`SELECT * FROM todos WHERE status = 'done' ORDER BY completed_at DESC`).all() as Todo[];
	},
	list_open: (): Todo[] => {
		return getDb().prepare(`SELECT * FROM todos WHERE status != 'done' ORDER BY created_at DESC`).all() as Todo[];
	},
	drop: (id: number): void => {
		getDb().prepare(`DELETE FROM todos WHERE id = ?`).run(id);
	},
	all_done: (ticketId: number): boolean => {
		const row = getDb().prepare(
			`SELECT COUNT(*) as pending FROM todos WHERE ticket_id = ? AND status != 'done'`
		).get(ticketId) as { pending: number };
		return row.pending === 0;
	},
}

const ticket = {
	create: (title: string, description: string, initiator?: string): Ticket => {
		const stmt = getDb().prepare(
			`INSERT INTO tickets (title, description, initiator) VALUES (?, ?, ?) RETURNING *`
		);
		return stmt.get(title, description, initiator ?? null) as Ticket;
	},
	get: (id: number): Ticket | undefined => {
		return getDb().prepare(`SELECT * FROM tickets WHERE id = ?`).get(id) as Ticket | undefined;
	},
	list: (status?: TicketStatus): Ticket[] => {
		const db = getDb();
		if (status) {
			return db.prepare(`SELECT * FROM tickets WHERE status = ? ORDER BY updated_at DESC`).all(status) as Ticket[];
		}
		return db.prepare(`SELECT * FROM tickets ORDER BY updated_at DESC`).all() as Ticket[];
	},
	update_status: (id: number, status: TicketStatus): void => {
		getDb().prepare(`UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
	},
	get_context: (ticketId: number): {
		ticket: Ticket | undefined;
		todos: Todo[];
		linkedNotes: Note[];
		linkedMemory: MemoryEntry[];
	} => {
		const db = getDb();
		const t = ticket.get(ticketId);
		const todos = todo.list_for_ticket(ticketId);

		// Get linked notes and memory via links table
		const lnks = links.get_to("ticket", ticketId);
		const noteIds = lnks.filter(l => l.from_type === "note").map(l => l.from_id);
		const memIds = lnks.filter(l => l.from_type === "memory").map(l => l.from_id);

		const linkedNotes: Note[] = [];
		for (const nid of noteIds) {
			const n = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(nid) as Note | undefined;
			if (n) linkedNotes.push(n);
		}

		const linkedMemory: MemoryEntry[] = [];
		for (const mid of memIds) {
			const m = db.prepare(`SELECT * FROM memory WHERE id = ?`).get(mid) as MemoryEntry | undefined;
			if (m) linkedMemory.push(m);
		}

		return { ticket: t, todos, linkedNotes, linkedMemory };
	}
}

const notes = {
	create: (notePath: string, hash: string, content: string, creator: string): Note => {
		const stmt = getDb().prepare(`
      INSERT INTO notes (path, hash, content, creator)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET hash = excluded.hash, content = excluded.content, creator = excluded.creator
      RETURNING *
    `);
		return stmt.get(notePath, hash, content, creator) as Note;
	},
	set_processed: (id: number): void => {
		getDb().prepare(`UPDATE notes SET processed = 1 WHERE id = ?`).run(id);
	},
	list_unprocessed: (): Note[] => {
		return getDb().prepare(`SELECT * FROM notes WHERE processed = 0 ORDER BY created_at`).all() as Note[];
	},
	list_processed: (): Note[] => {
		return getDb().prepare(`SELECT * FROM notes WHERE processed = 1 ORDER BY created_at`).all() as Note[];
	},
}


export default {
	init,
	getDb,
	notes,
	ticket,
	todo,
	memory,
	links
}