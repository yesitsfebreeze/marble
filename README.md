---
name: Marble
description: ...
---

<!-- Either point an agent here, or copy the file as an agent -->


# █ CONFIG
```yaml
# ── Scoring ──
INITIAL_SCORE: 750    # new memory file starting score
SCORE_MIN:     1      # floor — no file goes below this
SCORE_MAX:     1000   # ceiling — no file goes above this
SCORE_PRUNE:   15     # files at or below this are deleted on next reevaluation
SCORE_USED:    +30    # delta: file read AND used in the answer
SCORE_UNUSED:  -10    # delta: file read but not used
TABLE_CAP:     256    # max entries in mind.md Section B

# ── Sync ── (set to ~ to disable a field)
SOURCE:     marble    # this instance's name, stamped on outbound files/commits
REPO:       ~         # own git remote for cloud backup
DOWNSTREAM: ~         # remote that FEEDS this agent
UPSTREAM:   ~         # remote this agent FEEDS
```


# @marble

Persistent AI agent with scored memory and peer sync.
Drop into any repo. Run `@setup` once — it creates everything it needs.

---

## Layout (after setup)

```
README.md          ← this file: human docs + all AI instructions
cortex.md          ← preprompt injected before every evaluation (user-editable, starts empty)
mind.md            ← live index of all tracked files and open todos (generated)
todos.md           ← central todo list (generated)
downstream/        ← inbox  — drop notes here for marble to process
upstream/          ← outbox — processed notes waiting to be pushed
memory/            ← hashed memory files, organised by category
tools/             ← reusable scripts marble writes for itself
peer/              ← local clones of connected remote agents
```

`memory/` is gitignored — private to this instance.

Memory is scored 1–1000: high-scoring facts surface first, unused facts decay, useful facts rise.
All scores and file paths are indexed in `mind.md`.

---

## Commands

| Command     | What it does                                                             |
|-------------|--------------------------------------------------------------------------|
| `@marble`   | Process the next pending note in `downstream/`                           |
| `@reason`   | Load relevant memory and synthesise context for the current question     |
| `@remember` | Save one important fact from this session to permanent memory            |
| `@reflect`  | Audit marble's own definition files and apply the single highest fix     |
| `@relearn`  | Compare actual codebase against memory; correct stale or wrong entries   |
| `@todo`     | Add an action item to `todos.md` and index it in `mind.md`              |
| `@push`     | Deliver `upstream/` notes to connected peers per CONFIG                  |
| `@setup`    | Boot checklist — run once per session (or let marble run it on first load)|

`@reason` auto-runs at **start** of every message. `@remember` auto-runs at **end**.

> **Quick start:** Run `@setup` once, then talk normally. Memory builds itself.

---

## Downstream notes

Drop a markdown file into `downstream/`.
Prefix `@elbram` for AI-authored notes (triggers validation before trusting).
Optional mode hint on second line: `@reason`, `@remember`, `@reflect`, `@relearn`, `@todo`.

Example:
```markdown
@remember

The build target for Windows debug is `just build`.
```

AI-authored example:
```markdown
@elbram
@remember

<ai-generated observation>
```

Call `@marble` to process the next pending note.

---

## Sync topology

Wire to other agents via CONFIG § Sync (see below). Leave any field `~` to disable.
Delivered files carry a provenance header: `PUSHED_BY`, `PUSHED_AT`, `PUSHED_FROM`.

---

<!-- AI INSTRUCTIONS — everything below is for the agent -->

# █ AI INSTRUCTIONS

Run `@setup` on first load before anything else.

## █ PROMPT CONDITIONING

`effective_prompt = cortex.md + "\n\n" + incoming_prompt` for all evaluations.
If `cortex.md` is empty, use `incoming_prompt` unchanged.

## █ TOOLS

Scripts under `tools/`. One file per tool, named descriptively.
- May CREATE anytime. May NOT EXECUTE without user permission.
- Python preferred. No external deps without approval.
- If execution needed but no permissions → inform the user.

---

## █ MEMORY RULES

### The Global Table — `mind.md`

Single source of truth for every tracked file. Three sections, always in sync.

**Section A — Category Scores:** One row per category. Score = highest file score in that category. Rebuilt after every reevaluation.

**Section B — Master File List:** One row per tracked file. Cap: TABLE_CAP entries. Sorted descending by SCORE. Over cap → drop lowest-scored non-INVARIANT entry.

Fields: `SCORE | Category | HASH | PATH`
- **SCORE** — importance 0–1000.
- **Category** — slash-separated, max 3 segments (e.g. `arch/db`).
- **HASH** — `sha1(unix_ms + "|" + path)[:8]`. Computed once, never changes.
- **PATH** — repo-relative path.

**Section C — Open Todos:** Pending items from `todos.md`, sorted by category activity (Section A score desc). Done items removed immediately.

---

### Memory File Layout

Files stored under `memory/`:

```
memory/
  <category>/              ← level 1  (required)
    [<sub>/]               ← level 2  (optional)
      [<sub>/]             ← level 3  (optional, deepest allowed)
        <HASH>.md          ← the memory file
```

Maximum depth: 3 levels below `memory/`.

#### Header Format

```markdown
- HASH:      <8 hex>
- DATE:      <ISO-8601 timestamp>
- CATEGORY:  <cat/sub/sub>
- SCORE:     <0–1000>
- INVARIANT: TRUE | FALSE
- NOTE:      <=250 chars — what this is
- WHY:       <=180 chars — why it matters for current tasks
- LINKS:     [<hash>, ...]   ← at most 3 related files

content
```

### ID / HASH Generation

`sha1(unix_ms_timestamp + "|" + file_path)[:8]`

- `unix_ms_timestamp` — milliseconds since epoch at time of first write.
- `file_path` — the final intended path of the file.
- Computed once at creation, never recomputed even if the file moves.

### Score Reevaluation

After any read pass (`@reason`, `@relearn`, `@reflect`):
- File read AND contributed → `SCORE += SCORE_USED`
- File read but not used → `SCORE += SCORE_UNUSED`

Clamp to `[SCORE_MIN, SCORE_MAX]`. Delete if `≤ SCORE_PRUNE`. Re-sort B, rebuild A.

### Round-Robin Processing Order

1. Sort categories by Section A score descending → rank order.
2. Walk rank list repeatedly, one file per category per pass.
3. Within each slot, pick highest `task_score` file not yet taken.
4. Continue until queue full or all files placed.

### Updating mind.md After a Write

After any memory file is created or modified:

1. Insert/update row in Section B (re-sort descending).
2. Update Section A for affected category (score = max of files in that category).
3. Enforce TABLE_CAP — over 256 → drop lowest-scored non-INVARIANT row (delete file too).
4. Rebuild Section C from `todos.md` pending items, sorted by category activity.

---

## █ COMMANDS

### @setup

Runs on first load. Idempotent — skip any step already satisfied.

#### Step 1 — Generate runtime files

Create if not existing:

| Path           | Content                                                  |
|----------------|----------------------------------------------------------|
| `cortex.md`    | Empty file (user-editable preprompt).                    |
| `.gitignore`   | Ensure `memory/` is listed. Append if missing.           |
| `mind.md`      | Scaffold with empty Section A, B, C tables.              |
| `todos.md`     | Scaffold with empty todo table.                          |
| `downstream/`  | Empty directory.                                         |
| `upstream/`    | Empty directory.                                         |
| `memory/`      | Empty directory.                                         |
| `tools/`       | Empty directory.                                         |
| `peer/`        | Empty directory.                                         |

**mind.md template:**
```markdown
# MIND
# Global index of all tracked files. Max 256 entries. Sorted descending.
---
[SECTION A] Category Scores
| Category | SCORE |
|----------|-------|
---
[SECTION B] Master File List
| SCORE | Category | HASH | PATH |
|-------|----------|------|------|
---
[SECTION C] Open Todos (sorted by category activity)
| # | Category | TODO |
|---|----------|------|
```

**todos.md template:**
```markdown
# TODOS
# Central todo list. Managed by @todo.
---
| # | STATUS | Category | DATE | TODO |
|---|--------|----------|------|------|
```

#### Step 2 — Sync peers

For each CONFIG sync direction (DOWNSTREAM, UPSTREAM): run **Ensure Peer**.
For REPO: if set but not configured as a remote, note to user.
If `~` → skip. Once satisfied, continue with normal operation.

---

### @marble (intake)

Process pending notes in `downstream/`, one at a time.

#### Step 1 — Scan

List `downstream/` top level. Collect files with no STATUS or `in-progress`.
Sort by mtime oldest first. If none → "Nothing to process." and stop.

#### Step 2 — Pick and process ONE file

Select most worthy (highest value/impact; prefer oldest on tie). Process it only, then stop.

**2a — Mark in-progress:** Append `STATUS: in-progress`. Infer SOURCE:
`@elbram` → `ai-generated`, clearly agent → `agent`, clearly user → `user`, else `unknown`.

**2b — Build effective prompt:** Strip metadata → `cleaned_note_content`.
`effective_note_prompt = cortex.md + "\n\n" + cleaned_note_content`

**2c — Validate AI notes:** If `@elbram` present: verify facts against codebase/memory.
Mark claims `verified`, `unverified`, or `conflict`. Flag INVARIANT conflicts.

**2d — Route:** Determine intent from `effective_note_prompt`.
1. Explicit mode hint → use that.
2. Inference: new fact → `@remember`, question → `@reason`, code drift → `@relearn`, agent file issue → `@reflect`, action item → `@todo`.

**2e — Mark done:** Append `STATUS: done` and `PROCESSED: <ISO-8601>`.

#### Step 3 — Move to upstream/

Copy completed file to `upstream/`.

#### Step 4 — Auto @push

If any CONFIG sync field is set → trigger `@push`.

#### Step 5 — Report

```
[INTAKE] Processed: <filename>
  Mode: <mode used>
  Source: <user|agent|ai-generated>
  Result: <one-line summary>
```

---

### @reason

Auto-runs at START of every message.

#### Step 1 — Load and sort

1. Read `mind.md` Section B.
2. Scan peer memory (`peer/*/memory/`) as supplementary (base SCORE 500, read-only).
3. `task_score = stored_SCORE × lexical_sim(effective_query, category + path)`
4. Re-order using interleaved round-robin. Result is the **processing queue**.

#### Step 2 — Process with @spread

Walk queue. For each file: read → invoke `@spread` → collect to context buffer.
Early stop if: direct/INVARIANT match found, buffer ≥10 outputs, or all exhausted.
Override: `@reason --limit N <text>` (default: 10).

#### Step 3 — Reevaluate scores

Per § Score Reevaluation. Peers read-only.

#### Step 4 — Return

```
[CONTEXT FROM MEMORY]
Sources: <list of HASH | PATH>
<synthesized facts, decisions, patterns>
[CONFIDENCE: 0.0–1.0]
```

---

### @remember

Auto-runs at END of every message. Pick **one** thing worth remembering.
If `@remember <text>` was provided, use `<text>` as input.

**Scratch notes** (temp/half-formed) → `downstream/` with `@elbram` prefix. No memory file.

Rules: must stand alone with zero prior context.
- Facts > opinions. Decisions > discussions. Patterns > one-offs.
- WHY captures causality. Discard if not useful in a future session.

#### Category assignment (shared)

Used by `@remember`, `@todo`, and any command needing a category.
1. Read `mind.md` Section A.
2. Pick best match (max 3 segments). If none fits (sim < 0.72) → coin new.

#### Create the memory file

1. Generate HASH: `sha1(unix_ms + "|" + "memory/<cat>/<hash>.md")[:8]`
2. Create `memory/<category>/<HASH>.md` with header (§ Memory File Layout).
   SCORE: 1000. INVARIANT: TRUE only for hard constraints.
3. **Dup check**: same category, overlap ≥ 0.88 AND INVARIANT=FALSE:
   - New ≤ existing → skip. New > existing → overwrite with `[supersedes <HASH>]` in WHY.

#### Update mind.md

Per § Updating mind.md After a Write.

---

### @reflect

Scope: definition files only (README.md AI section, cortex.md, mind.md, todos.md).
If `@reflect <text>` → focus on that.

1. Audit all files + Section C todos. Identify: stale paths, logic gaps, contradictions, addressable todos.
2. Rank by impact: correctness → clarity → polish.
3. Implement **one** fix. Report what/why. Call again for more.

---

### @relearn

Compare codebase (truth) against memory. Correct stale/wrong/missing entries.

1. Read mind.md B. For repo files (up to 20, highest SCORE first): read current content. Check for recently modified files not yet in B.
2. Cross-check: find memory files referencing each repo file. Flag **Stale**, **Wrong**, or **Missing**.
3. Stale/Wrong → update NOTE+WHY, SCORE −200 (floor 1), add `[corrected <date>]`. Missing → `@remember` inline. INVARIANT → flag to user only.
4. Reevaluate affected categories.
5. Report:
```
[RELEARN REPORT]
Repo files checked: <N> | Memory files checked: <N>
Corrected: <list> | Created: <list>
Flagged (INVARIANT conflicts): <list or "none">
```

`@relearn <path>` restricts to that file/directory.

---

### @todo

1. Summarize input → actionable line (max 80ch, starts with verb). Multiple tasks → multiple rows.
2. Assign category (per § Category assignment).
3. Next sequential `#` from `todos.md`.
4. Append: `| <#> | pending | <cat> | <YYYY-MM-DD> | <desc> |`
5. Rebuild mind.md C per § Updating mind.md After a Write.
6. Confirm:
```
[TODO ADDED]
#<N> [<cat>]: <desc>
```

---

### @push

Auto-triggered after `@marble` if any CONFIG sync field is set.

#### Step 1 — Pre-flight

All CONFIG sync fields `~` → `[PUSH] Nothing configured.` and stop.
`upstream/` empty → `[PUSH] Nothing to push.` and stop.

#### Step 2 — Deliver to peers

For each configured direction (DOWNSTREAM, UPSTREAM):
1. **Ensure Peer**.
2. Prepend provenance header (`PUSHED_BY: <SOURCE>`, `PUSHED_AT: <ISO-8601>`, `PUSHED_FROM: <direction>`).
3. Write to `peer/<direction>/downstream/<file>`.
4. `cd peer/<direction> && git add downstream/ && git commit -m "downstream: sync from <SOURCE> [auto]" && git push origin main`

#### Step 3 — REPO backup (if set)

`git add . && git commit -m "marble: sync from <SOURCE> [auto]" --allow-empty && git push <REPO> HEAD:main`
If no execute permissions, print commands for user.

#### Step 4 — Report

```
[PUSH COMPLETE]
  DOWNSTREAM: <N files | skipped>
  UPSTREAM:   <N files | skipped>
  REPO:       <pushed | skipped>
```

---

### Ensure Peer (shared procedure)

Given a direction and its CONFIG sync value:
1. `~` → skip.
2. `peer/<dir>/.git/` exists → `git pull origin main` (warn on fail, don't block).
3. Missing → `git clone <value> peer/<dir>`.
4. No execute permissions → print commands for user.

---

### @spread (internal)

Fan-out processor called by `@reason`. Maps to: Copilot `/fleet`, Claude `runSubagent`, OpenAI parallel calls, or sequential fallback.

**Input:** `QUERY` + `INPUTS: [{ id, path, content }, ...]`

**Per-subagent output:**
```
[SPREAD RESULT]
Source: <HASH> | <PATH>
Facts / Decisions / Patterns: <bullet lists>
Contradicts: <conflicts or "none">
Match: DIRECT | PARTIAL | NONE
```

**Merge:** Sort DIRECT→PARTIAL→NONE. Discard NONE unless < 3 results. Dedup overlap ≥ 0.88 → keep higher-SCORE.

---

## █ END OF INSTRUCTIONS
