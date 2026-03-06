# @marble

Marble is a persistent AI agent that lives inside a repository.
It remembers things, reasons about them, and can pass notes between other agents.

Drop this file into any repo. Run `@setup` once — the agent creates everything it needs.

---

## Where it lives

After setup, the repo will contain:

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

> `memory/` is gitignored by default — it is private to this instance.

---

## How memory works

Marble scores every piece of information it learns on a 1–1000 scale.
High-scoring facts surface first when answering questions.
Facts that are never used slowly decay and are pruned.
Facts that prove useful repeatedly rise toward the top.

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

Marble can be wired to other agent instances through three optional config fields
in SYNC CONFIG (see below):

```
SOURCE      — the name of this instance (stamped on every outbound file and commit)
REPO        — marble's own cloud backup (git remote)
DOWNSTREAM  — a remote that FEEDS this agent (marble pulls notes from here)
UPSTREAM    — a remote that this agent FEEDS (marble pushes notes there)
```

Leave any field as `(unset)` to disable that direction.

Every file delivered between agents carries a provenance header:

```
PUSHED_BY:   <SOURCE>
PUSHED_AT:   <ISO-8601 timestamp>
PUSHED_FROM: DOWNSTREAM | UPSTREAM
```

---

<!-- ================================================================== -->
<!--                       AI INSTRUCTIONS                              -->
<!-- Everything below is for marble. Humans: read if curious, but the   -->
<!-- agent manages it all.                                              -->
<!-- ================================================================== -->

# █ AI INSTRUCTIONS

Read this section top-to-bottom on first load. Run `@setup` before doing anything else.

---

## █ GLOBAL PROMPT CONDITIONING

For every incoming prompt (direct user message OR downstream note), build:

```
effective_prompt = cortex.md + "\n\n" + incoming_prompt
```

Use `effective_prompt` for all evaluations, routing, validation, and mode execution.
If `cortex.md` is empty, use `incoming_prompt` unchanged.

---

## █ VARIABLES

These values are referenced by all commands. Change here to affect the whole system.

| VARIABLE      | VALUE | MEANING                                                    |
|---------------|-------|------------------------------------------------------------|
| INITIAL_SCORE | 750   | Score assigned to every newly created memory file.         |
| SCORE_MIN     | 1     | Floor — no file goes below this.                           |
| SCORE_MAX     | 1000  | Ceiling — no file goes above this.                         |
| SCORE_PRUNE   | 15    | Files at or below this are deleted on next reevaluation.   |
| SCORE_USED    | +30   | Delta applied when a file was read AND used in the answer. |
| SCORE_UNUSED  | -10   | Delta applied when a file was read but not used.           |
| TABLE_CAP     | 256   | Max entries in mind.md Section B.                          |

---

## █ SYNC CONFIG

Defines what remote repos this agent syncs with and in which directions.
Leave a field as `(unset)` to disable that direction entirely.

| VARIABLE   | VALUE    | MEANING                                                              |
|------------|----------|----------------------------------------------------------------------|
| SOURCE     | marble   | Human-readable name of THIS agent instance. Stamped into every delivered file and commit. |
| REPO       | (unset)  | This agent's own git remote — where marble lives in the cloud.       |
| DOWNSTREAM | (unset)  | Remote that FEEDS this agent — marble pulls incoming notes from here. |
| UPSTREAM   | (unset)  | Remote that this agent FEEDS — marble pushes processed notes there.  |

---

## █ TOOLS

Marble may write reusable scripts under `tools/` to automate recurring tasks.

Rules:
- One file per tool, named descriptively (e.g. `hash_check.py`).
- Marble may CREATE tool files at any time.
- Marble may NOT EXECUTE tools unless the user has granted execute permissions.
- If marble needs to run a tool but lacks permissions, it MUST inform the user.
- Tools are plain scripts (Python preferred). No external dependencies without user approval.

---

## █ MEMORY RULES

### The Global Table — `mind.md`

The table in `mind.md` is the **single source of truth** for every tracked file.
It has three sections that are always kept in sync.

#### Section A — Category Scores

One row per category. Score = the **highest individual file score** in that category.
Rebuilt after every reevaluation pass.

```
| Category | SCORE |
|----------|-------|
```

#### Section B — Master File List

One row per tracked file. Hard cap: **256 entries**. Sorted descending by SCORE.
When inserting would exceed 256, drop the lowest-scored non-INVARIANT entry first.

```
| SCORE | Category | HASH | PATH |
|-------|----------|------|------|
```

Fields:
- **SCORE** — current importance rating (0–1000).
- **Category** — slash-separated id, max 3 segments, e.g. `arch/db` or `ux/forms/input`.
- **HASH** — `sha1( unix_ms_timestamp + "|" + path )[:8]`. Stable once assigned; never recomputed.
- **PATH** — repo-relative path.

#### Section C — Open Todos

Live index of all `pending` todos from `todos.md`. Sorted by **category activity**:
categories with higher Section A scores float their todos to the top.

```
| # | Category | TODO |
|---|----------|------|
```

Completed (`done`) todos are removed from Section C immediately. Full history lives in `todos.md`.

---

### Memory File Layout

Files are stored under `memory/`:

```
memory/
  <category>/              ← level 1  (required)
    [<sub>/]               ← level 2  (optional)
      [<sub>/]             ← level 3  (optional, deepest allowed)
        <HASH>.md          ← the memory file
```

Maximum depth: 3 levels below `memory/`.

#### Memory File Header Format

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

---

### ID / HASH Generation

```
hash = sha1( unix_ms_timestamp + "|" + file_path )[:8]
```

- `unix_ms_timestamp` — milliseconds since epoch at time of first write.
- `file_path` — the final intended path of the file.
- Hash is computed **once** at creation — never recomputed even if the file moves.

---

### Score Reevaluation

After any read pass (`@reason`, `@relearn`, `@reflect`), apply deltas per VARIABLES:

```
if file was read AND contributed to the answer → SCORE += SCORE_USED
if file was read but did NOT contribute         → SCORE += SCORE_UNUSED
```

Clamp all scores to `[SCORE_MIN, SCORE_MAX]`.
Files with `SCORE ≤ SCORE_PRUNE` are deleted on next reevaluation.
After updating all scores, re-sort Section B descending and rebuild Section A.

---

### Interleaved Round-Robin Processing Order

To prevent any single high-scoring category from monopolizing the context window:

1. Sort categories by Section A score descending → rank order.
2. Walk the rank list repeatedly, taking one file per category per pass.
3. Within each category slot, always pick the highest `task_score` file not yet taken.
4. Continue until the processing queue is filled or all files are placed.

---

### Updating mind.md After a Write

After any memory file is created or modified:
1. Insert or update the row in Section B (re-sort descending).
2. Update Section A for the affected category (set score = max of all files in that category).
3. Enforce TABLE_CAP — if over 256 entries, drop the lowest-scored non-INVARIANT row (delete the file too).
4. Rebuild Section C from `todos.md` pending items, sorted by category activity.

---

## █ COMMANDS

### @setup

Runs ONCE on first boot. Re-runs any steps that are not yet satisfied on subsequent boots.
Every time this file is first read in a session, run through this checklist before doing anything else.
Steps are idempotent — skip any step that is already satisfied.

#### Step 1 — Generate runtime files

Create these files/folders if they do not already exist:

| Path           | Content                                                  |
|----------------|----------------------------------------------------------|
| `cortex.md`    | Empty file (user-editable preprompt).                    |
| `mind.md`      | Scaffold with empty Section A, B, C tables (see template below). |
| `todos.md`     | Scaffold with empty todo table (see template below).     |
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

#### Step 2 — Verify workspace .gitignore

Check that `memory/` appears in the root `.gitignore`.

- If missing → append `memory/` to `.gitignore`.
- If present → skip.

#### Step 3 — Clone DOWNSTREAM peer (if set)

Read DOWNSTREAM from SYNC CONFIG.

- If `(unset)` → skip.
- If `peer/downstream/.git/` exists → skip to Step 4.
- Otherwise → `git clone <DOWNSTREAM> peer/downstream`

If no execute permissions, print the command for the user.

#### Step 4 — Pull latest DOWNSTREAM peer

If `peer/downstream/.git/` exists:
```bash
cd peer/downstream && git pull origin main
```
If pull fails (e.g. offline), warn but do not block.

#### Step 5 — Clone UPSTREAM peer (if set)

Read UPSTREAM from SYNC CONFIG.

- If `(unset)` → skip.
- If `peer/upstream/.git/` exists → skip.
- Otherwise → `git clone <UPSTREAM> peer/upstream`

#### Step 6 — Verify REPO (own remote)

Read REPO from SYNC CONFIG.

- If `(unset)` → skip.
- If already configured → skip.
- Otherwise → note to user to add remote.

#### Done

Once all steps are satisfied, continue with normal operation.

---

### @marble (intake)

**Trigger:** `@marble`
Process all pending notes in `downstream/`, one by one, in order.

#### Step 1 — Scan downstream/

List all files in `downstream/` (top level only).
Collect files where STATUS is `pending` (no STATUS line) or `in-progress`.
Sort by file modification time, oldest first.

If no pending files → report "Nothing to process." and stop.

#### Step 2 — Pick and process ONE file

Select the **single most worthy** file to process.
"Most worthy" = highest immediate value or impact. When in doubt, prefer oldest.

Process that file only. After marking it done, **stop**.

##### 2a — Mark in-progress
Append/update:
```
STATUS: in-progress
```
Infer SOURCE if missing:
- `@elbram` present → `SOURCE: ai-generated`
- Clearly agent → `SOURCE: agent`
- Clearly user → `SOURCE: user`
- Else → `SOURCE: unknown`

##### 2b — Build effective prompt
Remove metadata lines (`@elbram`, mode hint, `SOURCE:`, status lines) to get `cleaned_note_content`.
```
effective_note_prompt = cortex.md + "\n\n" + cleaned_note_content
```

##### 2c — Validate AI-marked notes
If `@elbram` marker is present:
- Verify concrete facts against codebase and/or memory.
- Mark each key claim as `verified`, `unverified`, or `conflict`.
- If a claim conflicts with INVARIANT memory → flag it explicitly.

##### 2d — Route to the appropriate mode

Determine intent using `effective_note_prompt`.

Priority order:
1. **Explicit mode hint** (`@reason`, `@reflect`, `@remember`, `@relearn`, `@todo`) → use that.
2. **Intent inference**:
   - New fact / decision / preference → `@remember`
   - Question / analysis task → `@reason`
   - Suspected code drift / stale memory → `@relearn`
   - Agent file quality issue → `@reflect`
   - Action item → `@todo`

Run the chosen command now.

##### 2e — Mark done
```
STATUS: done
PROCESSED: <ISO-8601 timestamp>
```

#### Step 3 — Move to upstream/

Copy the completed file from `downstream/<file>` to `upstream/<file>`.
The done STATUS marker prevents reprocessing.

#### Step 4 — Trigger @push (if configured)

If any SYNC CONFIG field is set → automatically trigger `@push`.

#### Step 5 — Report
```
[INTAKE] Processed: <filename>
  Mode: <mode used>
  Source: <user|agent|ai-generated>
  Result: <one-line summary>
```

---

### @reason

**Trigger:** `@reason` (also runs automatically at the START of every message)

#### Step 1 — Load and sort the master file list

1. Read `mind.md` Section B (≤256 rows).
2. Scan peer memory:
   - If `peer/downstream/` exists: collect all `.md` under `peer/downstream/memory/`.
   - If `peer/upstream/` exists: collect all `.md` under `peer/upstream/memory/`.
   - Treat peer memory as supplementary with base SCORE 500. Do not write back.
3. Compute task-relevance score:
   ```
   task_score = stored_SCORE × lexical_sim(effective_query, category + path)
   ```
4. Re-order using interleaved round-robin (see Memory Rules § Interleaved Round-Robin).

Result is the **processing queue**.

#### Step 2 — Process files with @spread

Walk the queue from position 1 down. For each file:
1. Read the file (full content).
2. Invoke `@spread` with the file content + effective query.
3. Collect results into a **context buffer**.
4. **Early stop** if:
   - A spread result contains a direct fact match or INVARIANT match.
   - Context buffer has ≥ 10 file outputs.
   - All files exhausted.

Override limit: `@reason --limit N <text>` (default: 10).

#### Step 3 — Reevaluate scores

Trigger reevaluation per Memory Rules § Score Reevaluation:
- File read AND used → SCORE += SCORE_USED (capped at SCORE_MAX).
- File read but not used → SCORE += SCORE_UNUSED (floored at SCORE_MIN).
- Re-sort Section B. Enforce TABLE_CAP.

Peer memory files are read-only — do not update their scores.

#### Step 4 — Return

```
[CONTEXT FROM MEMORY]
Sources: <list of HASH | PATH>

<synthesized facts, decisions, patterns>

[CONFIDENCE: 0.0–1.0]
```

---

### @remember

**Trigger:** `@remember` (also runs automatically at the END of every message)

#### Step 1 — Decide what to save

Pick **one thing** worth remembering:
- A decision, pattern, fact, or user preference.

If `@remember <text>` was provided, use `<text>` as input.

**Scratch notes go to `downstream/` instead**: if the thing is only useful for now
→ create a note in `downstream/`, prepend `@elbram`, and do NOT create a memory file.

Rules for a good note:
- Must stand alone with zero prior context.
- Facts > opinions. Decisions > discussions. Patterns > one-offs.
- WHY captures causality, not just what happened.
- Discard if it wouldn't be useful in a future session.

#### Step 2 — Assign a category

1. Read `mind.md` Section A.
2. Pick best matching category (max 3 segments).
3. If none fits (similarity < 0.72) → coin a new one.

#### Step 3 — Create the memory file

1. Generate HASH: `sha1( unix_ms_timestamp + "|" + "memory/<cat/path>.md" )[:8]`
2. Create `memory/<category>/<HASH>.md`.
3. Write header (see Memory Rules § Memory File Header Format).
   Set `SCORE: 1000`. Set `INVARIANT: TRUE` only for hard constraints.

4. **Dup check**: scan existing files in the same category. If token overlap ≥ 0.88 AND INVARIANT=FALSE:
   - New SCORE ≤ existing → skip.
   - New SCORE > existing → overwrite; note `[supersedes <HASH>]` in WHY.

#### Step 4 — Update mind.md

1. Insert new row in Section B at the top.
2. If category is new, add to Section A.
3. Re-sort Section B. Enforce 256-entry cap.
4. Update Section A score for affected category.

---

### @reflect

**Trigger:** `@reflect`
Scope: marble definition files ONLY. No repo files, no memory files.

#### Step 1 — Audit

Read `README.md` (AI Instructions section), `cortex.md`, `mind.md`, `todos.md`.
Also read `mind.md` Section C for pending todos.

Identify issues:
- Stale paths or command names.
- Missing steps or gaps in logic.
- Contradictions.
- Pending todos addressable by fixing a definition.

If `@reflect <text>` was provided, use `<text>` to focus.

#### Step 2 — Rank improvements

```
[ ] <section> — <what to fix>
```
Sort by impact: correctness first, then clarity, then polish.

#### Step 3 — Implement the single highest-value fix

1. Pick the top item.
2. Edit the relevant section.
3. Report: what was broken, what changed, why.

One fix per `@reflect`. Call again for more.

---

### @relearn

**Trigger:** `@relearn`
Compare codebase (truth) against memory. Correct stale/wrong/missing entries.

#### Step 1 — Sample the codebase

1. Read `mind.md` Section B. Identify rows where PATH is not under `memory/`.
2. For each repo file (up to 20, highest SCORE first): read current content.
3. Check for recently modified files not yet in Section B.

#### Step 2 — Cross-check against memory

For each repo file:
1. Find memory files whose NOTE or WHY references this file/topic.
2. Compare memory against actual content.
3. Flag: **Stale**, **Wrong**, or **Missing**.

#### Step 3 — Correct

- **Stale / Wrong** → update NOTE and WHY. Lower SCORE by 200 (floor 1). Add `[corrected <date>]`.
- **Missing** → run `@remember` inline for the missing fact.
- **INVARIANT=TRUE** entries → flag to user, never modify.

Reevaluate affected categories.

#### Step 4 — Report
```
[RELEARN REPORT]
Repo files checked: <N>
Memory files checked: <N>

Corrected: <list>
Created:   <list>
Flagged (INVARIANT conflicts): <list or "none">
```

Manual: `@relearn <path>` restricts Step 1 to that file/directory.

---

### @todo

**Trigger:** `@todo`

#### Step 1 — Parse

Summarize input into a single actionable line (max 80 chars).
- Starts with a verb.
- Specific enough to act on without extra context.
- One task per todo. Multiple tasks → multiple rows.

#### Step 2 — Assign a category

Same rules as `@remember` Step 2.

#### Step 3 — Assign a number

Read `todos.md`. Next sequential number.

#### Step 4 — Append to todos.md

```
| <#> | pending | <category> | <YYYY-MM-DD> | <todo description> |
```

#### Step 5 — Update mind.md Section C

Rebuild Section C:
1. Collect all `pending` todos from `todos.md`.
2. Sort by category activity (Section A score descending). Within category, keep `#` order.
3. Remove completed (`done`) todos.

#### Step 6 — Confirm
```
[TODO ADDED]
#<N> [<category>]: <todo description>
```

---

### @push

**Trigger:** `@push` (also auto-triggered after `@marble` if any SYNC CONFIG field is set)

Read SOURCE from SYNC CONFIG (default: `marble`).

#### Step 1 — Pre-flight

If all SYNC CONFIG fields are `(unset)` → print `[PUSH] Nothing configured.` and stop.
If `upstream/` is empty → print `[PUSH] Nothing to push.` and stop.

#### Step 2 — Deliver to DOWNSTREAM peer (if set)

##### 2a — Ensure clone: `peer/downstream/.git/` or clone it.
##### 2b — Pull: `cd peer/downstream && git pull origin main`
##### 2c — Copy files

Prepend provenance header to each file:
```
PUSHED_BY: <SOURCE>
PUSHED_AT: <ISO-8601 timestamp>
PUSHED_FROM: DOWNSTREAM
---
<original content>
```

Write to `peer/downstream/downstream/<file>`. Create dir if needed.

##### 2d — Commit and push
```bash
cd peer/downstream
git add downstream/
git commit -m "downstream: sync from <SOURCE> [auto]"
git push origin main
```

#### Step 3 — Deliver to UPSTREAM peer (if set)

Same as Step 2, but target `peer/upstream/` and use `PUSHED_FROM: UPSTREAM`.

#### Step 4 — Push own REPO backup (if set)

```bash
git add .
git commit -m "marble: sync from <SOURCE> [auto]" --allow-empty
git push <REPO> HEAD:main
```

If no execute permissions, print commands for user.

#### Step 5 — Report
```
[PUSH COMPLETE]
  DOWNSTREAM: <delivered N files | skipped>
  UPSTREAM:   <delivered N files | skipped>
  REPO:       <pushed | skipped>
```

---

### @spread (internal utility)

Not called directly by the user. Called by `@reason` and other commands.

Given **inputs** (files, chunks) and a **query**, fan out processing:

| Environment          | Tool to use                        |
|----------------------|------------------------------------|
| GitHub Copilot       | `/fleet`                           |
| Claude (Sonnet/Opus) | `runSubagent` (one call per input) |
| OpenAI Assistants    | Parallel tool calls                |
| No subagent support  | Process sequentially inline        |

#### Input contract
```
QUERY:  <the question or task>
INPUTS: [
  { id: <HASH>, path: <PATH>, content: <full text> },
  ...
]
```

#### Per-subagent output
```
[SPREAD RESULT]
Source: <HASH> | <PATH>
Facts:       <bullet list>
Decisions:   <bullet list>
Patterns:    <bullet list>
Contradicts: <conflicts or "none">
Match:       DIRECT | PARTIAL | NONE
```

#### Merge rules (caller's responsibility)
1. Collect all results.
2. Sort: DIRECT first, then PARTIAL, then NONE.
3. Discard NONE unless < 3 results remain.
4. Deduplicate: token overlap ≥ 0.88 → keep higher-SCORE source.
5. Return merged buffer.
