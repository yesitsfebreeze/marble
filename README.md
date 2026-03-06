@marble, you only have read/write for this file after you asked for access per request.

# @marble

Marble is a persistent AI agent that lives inside this repository.
It remembers things, reasons about them, and can pass notes between other agents.

It is the merged form of two earlier agents — **brian** (who had a live memory system and
could push notes to a peer) and **carl** (who was that peer, living inside brian's repo).

We recieve a downstream from an upstream of anoter marble repo.
We categorize and memorize it with our configuration.
Put it in the knowledge base, and create an upstream message for what happened and where.
Other marbles can consume this upstream and sort that info into their memory.

---

## Where it lives

```
@marble/
  marble.md       ← identity, variables, and SYNC CONFIG  (start here)
  cortex.md       ← preprompt injected before every evaluation
  memory.md       ← rules for building and maintaining the memory index
  mind.md         ← live index of all tracked files and open todos
  todos.md        ← central todo list
  downstream/     ← inbox  — drop notes here for marble to process
  upstream/       ← outbox — processed notes waiting to be pushed
  memory/         ← hashed memory files, organised by category
  synapses/       ← command definitions (see below)
  tools/          ← reusable scripts marble writes for itself
  peer/           ← local clones of connected remote agents (created on first @setup)
```

> `memory/` is gitignored by default — it is private to this instance.
> Everything else (definition files, synapses, todos) is tracked.

---

## How memory works

Marble scores every piece of information it learns on a 1–1000 scale.
High-scoring facts surface first when answering questions.
Facts that are never used slowly decay and are pruned.
Facts that prove useful repeatedly rise toward the top.

All scores and file paths are indexed in `mind.md`.
The rules for creating, updating, and pruning memory files live in `memory.md`.

---

## Commands

Type any of these in a conversation where marble is the active agent:

| Command     | What it does                                                             |
|-------------|--------------------------------------------------------------------------|
| `@marble`   | Process the next pending note in `downstream/`                           |
| `@reason`   | Load relevant memory and synthesise context for the current question     |
| `@remember` | Save one important fact from this session to permanent memory            |
| `@reflect`  | Audit marble's own definition files and apply the single highest fix     |
| `@relearn`  | Compare actual codebase against memory; correct stale or wrong entries   |
| `@todo`     | Add an action item to `todos.md` and index it in `mind.md`               |
| `@push`     | Deliver `upstream/` notes to connected peers per SYNC CONFIG             |
| `@setup`    | Boot checklist — run once per session (or let marble run it on first load)|

`@reason` also runs automatically at the **start** of every message.
`@remember` also runs automatically at the **end** of every message.

---

## Leaving notes for marble

Drop a plain markdown file into `downstream/`.

```markdown
@remember

The build target for Windows debug is `just build`.
```

Prefix with `@elbram` if the note was written by another AI so marble validates it
before trusting it:

```markdown
@elbram
@remember

<ai-generated observation>
```

Call `@marble` to process the next pending note.

---

## Sync topology

Marble can be wired to other agent instances through three optional config fields in
`marble.md` under `█ SYNC CONFIG`:

```
SOURCE      — the name of this instance (stamped on every outbound file and commit)
REPO        — marble's own cloud backup (git remote)
DOWNSTREAM  — a remote agent that FEEDS marble (marble pulls notes from here)
UPSTREAM    — a remote agent that marble FEEDS (marble pushes notes there)
```

Leave any field as `(unset)` to disable that direction.
Set all three to build a full bidirectional pipeline across multiple instances.

Every file delivered between agents carries a provenance header:

```
PUSHED_BY:   <SOURCE>
PUSHED_AT:   <ISO-8601 timestamp>
PUSHED_FROM: DOWNSTREAM | UPSTREAM
```

This makes it possible to follow a note all the way through the chain — from whoever
originated it, through every agent that relayed it, to wherever it ends up.

---

## AI marker

When marble writes a note to its own `downstream/` (e.g. as a scratch observation),
it prefixes the file with `@elbram`. This signals to the next intake pass that the
content came from an AI and should be validated before being trusted.

---

## Configuring marble

All tuneable values are in the `█ VARIABLES` block in `marble.md`:

| Variable      | Default | Meaning                                            |
|---------------|---------|----------------------------------------------------|
| INITIAL_SCORE | 750     | Score given to every new memory file               |
| SCORE_MIN     | 1       | Floor — no file drops below this                  |
| SCORE_MAX     | 1000    | Ceiling — no file rises above this                |
| SCORE_PRUNE   | 15      | Files at or below this are deleted on next pass   |
| SCORE_USED    | +30     | Bonus when a file contributed to an answer        |
| SCORE_UNUSED  | −10     | Penalty when a file was read but not used         |
| TABLE_CAP     | 256     | Maximum rows in `mind.md` Section B               |

Change a value in `marble.md` and every synapse picks it up automatically.

---

## Lineage

| Agent  | Role                                      | Marker   |
|--------|-------------------------------------------|----------|
| brian  | Original agent, full memory + push system | `@nairb` |
| carl   | Brian's peer, lived inside brian's repo   | `@lrac`  |
| marble | Merged form of both, with explicit config | `@elbram`|
