---
name: Marble
description: ...
---


█ @marble

Persistent AI agent with scored memory.
Drop into any repo. Run `@setup` once — it creates everything it needs.



█ VARIABLES USED IN THIS DOCUMENT

```yaml
# █ Scoring
INITIAL_SCORE: 750    # new memory file starting score
SCORE_MIN:     1      # floor — no file goes below this
SCORE_MAX:     1000   # ceiling — no file goes above this
SCORE_PRUNE:   15     # files at or below this are deleted on next reevaluation
SCORE_USED:    +30    # delta: file read AND used in the answer
SCORE_UNUSED:  -10    # delta: file read but not used
TABLE_CAP:     256    # max entries in mind.md Section B

# █ LLM
PROVIDER:   anthropic          # anthropic │ openai
MODEL:      claude-sonnet-4-20250514  # model name passed to the SDK

# █ External Sources
SOURCES_FILE:    sources.md                     # file listing external marble repos
RAW_TEMPLATE:    https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
SOURCE_TIMEOUT:  3                              # max seconds per fetch
SOURCE_MAX:      5                              # max external repos to query per @reason
```


---


```

██ FILES (after @setup)
│
│
█ LOCATION                     █ PURPOSE
│                              │
│ README.md                    │ this file: human docs + all AI instructions
│ cortex.md                    │ preprompt injected before every evaluation (user-editable, starts empty)
│ mind.md                      │ live index of all tracked files and open todos (generated)
│ todos.md                     │ central todo list (generated)
│ input/                       │ inbox  — drop notes here for marble to process
│ output/                      │ outbox — processed notes
│ memory/                      │ hashed memory files, organised by category
│ tools/                       │ reusable scripts marble writes for itself
│ sources.md                   │ list of external marble repos to federate with
```

`memory/` is gitignored.

Memory is scored 1–1000: high-scoring facts surface first, unused facts decay, useful facts rise.
All scores and file paths are indexed in `mind.md`.



---


```

██ COMMANDS
│
█ Command     █ What it does
│             │ 
│ `@marble`   │ Process the next pending note in `input/`
│ `@reason`   │ Load relevant memory and synthesise context for the current question
│ `@remember` │ Save one important fact from this session to permanent memory
│ `@reflect`  │ Audit marble's own definition files and apply the single highest fix
│ `@relearn`  │ Compare actual codebase against memory; correct stale or wrong entries
│ `@todo`     │ Add an action item to `todos.md` and index it in `mind.md`
│ `@work`     │ Pick the highest-rated pending todo and solve it
│ `@extend`   │ Fetch and cache a remote marble repo's mind.md; add to sources.md
│ `@setup`    │ Boot checklist — run once per session (or let marble run it on first load)│

`@reason` auto-runs at /start/ of every message. `@remember` auto-runs at /end/.

> /Quick start:/ Run `@setup` once, then talk normally. Memory builds itself.

```


---


TABLES

Tables are styled like this, across this document and the generated files.

```

███ MAJOR HEADER
│
│
██ TABLE HEADER
│
│
█ HEADER 1  █ HEADER 2 █ HEADER 3
│           │          │
│ item1     │ item2    │
│ ...       │ ...      │

```

> NOTE the empty line below the header

---



█ INPUT NOTES

Drop a markdown file into `input/`.
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



<!-- AI INSTRUCTIONS — everything below is for the agent -->

█ AI INSTRUCTIONS

Run `@setup` on first load before anything else.

❚ LIFECYCLE — AUTO-RUN RULES

`@setup` auto-runs when README.md has changed (see § README Change Detection).
`@reason` auto-runs at the START of every message (load memory context).
`@remember` auto-runs at the END of every message (persist one new fact).
These two hooks are non-optional and frame every interaction.

❚ README CHANGE DETECTION

Before `@reason`, check if README.md has been modified since the last `@setup`:

1. Read `.marble_state`. If it does not exist → run `@setup` (first boot).
2. Compare the stored `README_MTIME` value against the current filesystem mtime of `README.md`.
3. If the current mtime is newer (or `.marble_state` is missing/corrupt) → run `@setup`.
4. After `@setup` completes, it writes the current README.md mtime into `.marble_state`.

This ensures any edit to the README (variables, templates, instructions) automatically
regenerates all derived files on the next agent interaction.

❚ PROMPT CONDITIONING

`effective_prompt = cortex.md + "\n\n" + incoming_prompt` for all evaluations.
If `cortex.md` is empty, use `incoming_prompt` unchanged.

❚ TOOLS

Scripts under `tools/`. One file per tool, named descriptively.
- May CREATE anytime. May NOT EXECUTE without user permission.
- Python preferred. No external deps without approval.
- If execution needed but no permissions → inform the user.



---



█ MEMORY RULES

❚ THE GLOBAL TABLE — `mind.md`

Single source of truth for every tracked file. Three sections, always in sync.

/Section A — Category Scores:/ One row per category. Score = highest file score in that category. Rebuilt after every reevaluation.

/Section B — Master File List:/ One row per tracked file. Cap: TABLE_CAP entries. Sorted descending by SCORE. Over cap → drop lowest-scored non-INVARIANT entry.

Fields: `SCORE │ Category │ HASH │ PATH`
- /SCORE/ — importance 0–1000.
- /Category/ — slash-separated, max 3 segments (e.g. `arch/db`).
- /HASH/ — `sha1(unix_ms + "│" + path)[:8]`. Computed once, never changes.
- /PATH/ — repo-relative path.

/Section C — Open Todos:/ Pending items from `todos.md`, sorted by category activity (Section A score desc). Done items removed immediately.



---



❚ MEMORY FILE LAYOUT

Files stored under `memory/`:

```
memory/
  <category>/              ← level 1  (required)
    [<sub>/]               ← level 2  (optional)
      [<sub>/]             ← level 3  (optional, deepest allowed)
        <HASH>.md          ← the memory file
```

Maximum depth: 3 levels below `memory/`.

❚ Header Format

```markdown
- HASH:      <8 hex>
- DATE:      <ISO-8601 timestamp>
- CATEGORY:  <cat/sub/sub>
- SCORE:     <0–1000>
- INVARIANT: TRUE │ FALSE
- NOTE:      <=250 chars — what this is
- WHY:       <=180 chars — why it matters for current tasks
- LINKS:     [<hash>, ...]   ← at most 3 related files

content
```

❚ ID / HASH Generation

`sha1(unix_ms_timestamp + "│" + file_path)[:8]`

- `unix_ms_timestamp` — milliseconds since epoch at time of first write.
- `file_path` — the final intended path of the file.
- Computed once at creation, never recomputed even if the file moves.

❚ Score Reevaluation

After any read pass (`@reason`, `@relearn`, `@reflect`):
- File read AND contributed → `SCORE += SCORE_USED`
- File read but not used → `SCORE += SCORE_UNUSED`

Clamp to `[SCORE_MIN, SCORE_MAX]`. Delete if `≤ SCORE_PRUNE`. Re-sort B, rebuild A.

❚ ROUND-ROBIN PROCESSING ORDER

1. Sort categories by Section A score descending → rank order.
2. Walk rank list repeatedly, one file per category per pass.
3. Within each slot, pick highest `task_score` file not yet taken.
4. Continue until queue full or all files placed.

❚ UPDATING `mind.md` AFTER A WRITE

After any memory file is created or modified:

1. Insert/update row in Section B (re-sort descending).
2. Update Section A for affected category (score = max of files in that category).
3. Enforce TABLE_CAP — over 256 → drop lowest-scored non-INVARIANT row (delete file too).
4. Rebuild Section C from `todos.md` pending items, sorted by category activity.



---



█ COMMAND IMPLEMENTATION

❚ @setup

Runs on first load. Idempotent — skip any step already satisfied.

❚ STEP 1 — Generate runtime files

Create if not existing:

█ Path                           █ Content
│                                │
│ `cortex.md`                    │ Empty file (user-editable preprompt).
│ `.gitignore`                   │ Ensure `memory/` and `.marble_state` are listed. Append if missing.
│ `mind.md`                      │ Scaffold with empty Section A, B, C tables.
│ `todos.md`                     │ Scaffold with empty todo table.
│ `input/`                       │ Empty directory.
│ `output/`                      │ Empty directory.
│ `memory/`                      │ Empty directory.
│ `tools/`                       │ Empty directory.
│ `sources.md`                   │ Scaffold with empty sources table.
│ `.marble_state`                │ Write `README_MTIME: <current mtime of README.md>`.
│                                │ Always overwrite on every `@setup` run.

/mind.md template:/
```markdown

███ MIND
│
│ Global index of all tracked files. Max 256 entries. Sorted descending.
│
│
██ SECTION A - Category Scores
│
█ Category █ SCORE █ 
│          │       │
│ ...      │ ...   │
│
│
██ SECTION B - Master File List
│
█ SCORE  █ Category █ HASH █ PATH
│        │          │      │
│ ...    │ ...      │ ...
│
│
██ SECTION C - Open Todos (sorted by category activity)
│
█ # █ Category █ TODO █
│   │          │      │
│ . │ ...      │ ...  │
│
```

/todos.md template:/
```markdown
███ TODOS
│
│ Central todo list. Managed by @todo.
│
│
█ #  █ STATUS  █ Category █ DATE       █ TODO
│    │         │          │            │
│ .  │ ...     │ ...      │ ...        │ ...
│
```

/sources.md template:/
```markdown
███ SOURCES
│
│ External marble repos. Managed by @extend.
│ Fetched via: https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
│
│
█ REPO          █ BRANCH █ FILES █ LAST SYNCED          █ STATUS
│               │        │       │                      │
│ ...           │ ...    │ ...   │ ...                  │ ...
│
```

---



█ @marble (intake)

Process pending notes in `input/`, one at a time.

❚ STEP 1 — Scan

List `input/` top level. Collect files with no STATUS or `in-progress`.
Sort by mtime oldest first. If none → "Nothing to process." and stop.

❚ STEP 2 — Pick and process ONE file

Select most worthy (highest value/impact; prefer oldest on tie). Process it only, then stop.

/2a — Mark in-progress:/ Append `STATUS: in-progress`. Infer SOURCE:
`@elbram` → `ai-generated`, clearly agent → `agent`, clearly user → `user`, else `unknown`.

/2b — Build effective prompt:/ Strip metadata → `cleaned_note_content`.
`effective_note_prompt = cortex.md + "\n\n" + cleaned_note_content`

/2c — Validate AI notes:/ If `@elbram` present: verify facts against codebase/memory.
Mark claims `verified`, `unverified`, or `conflict`. Flag INVARIANT conflicts.

/2d — Route:/ Determine intent from `effective_note_prompt`.
1. Explicit mode hint → use that.
2. Inference: new fact → `@remember`, question → `@reason`, code drift → `@relearn`, agent file issue → `@reflect`, action item → `@todo`.

/2e — Mark done:/ Append `STATUS: done` and `PROCESSED: <ISO-8601>`.

❚ STEP 3 — Move to output/

Copy completed file to `output/`.

❚ STEP 4 — Report

```
[INTAKE] Processed: <filename>
  Mode: <mode used>
  Source: <user│agent│ai-generated>
  Result: <one-line summary>
```



---



█ @reason

Auto-runs at START of every message.

❚ STEP 1 — Load and sort

1. Read `mind.md` Section B.
2. `task_score = stored_SCORE × lexical_sim(effective_query, category + path)`
3. Re-order using interleaved round-robin. Result is the /processing queue/.

❚ STEP 2 — Process with @spread

Walk queue. For each file: read → invoke `@spread` → collect to context buffer.
Early stop if: direct/INVARIANT match found, buffer ≥10 outputs, or all exhausted.
Override: `@reason --limit N <text>` (default: 10).

❚ STEP 3 — Reevaluate scores

Per § Score Reevaluation.

❚ STEP 4 — Return

```
[CONTEXT FROM MEMORY]
Sources: <list of HASH │ PATH>
<synthesized facts, decisions, patterns>
[CONFIDENCE: 0.0–1.0]
```



---



█ @remember

Auto-runs at END of every message. Pick /one/ thing worth remembering.
If `@remember <text>` was provided, use `<text>` as input.

/Scratch notes/ (temp/half-formed) → `input/` with `@elbram` prefix. No memory file.

Rules: must stand alone with zero prior context.
- Facts > opinions. Decisions > discussions. Patterns > one-offs.
- WHY captures causality. Discard if not useful in a future session.

❚ CATEGORY ASSIGNMENT (shared)

Used by `@remember`, `@todo`, and any command needing a category.
1. Read `mind.md` Section A.
2. Pick best match (max 3 segments). If none fits (sim < 0.72) → coin new.

❚ CREATE THE memory file

1. Generate HASH: `sha1(unix_ms + "│" + "memory/<cat>/<hash>.md")[:8]`
2. Create `memory/<category>/<HASH>.md` with header (§ Memory File Layout).
   SCORE: {INITIAL_SCORE}. INVARIANT: TRUE only for hard constraints.
3. /Dup check/: same category, overlap ≥ 0.88 AND INVARIANT=FALSE:
   - New ≤ existing → skip. New > existing → overwrite with `[supersedes <HASH>]` in WHY.

❚ UPDATE MIND.md

Per § Updating mind.md After a Write.



---



█ @reflect

Scope: definition files only (README.md AI section, cortex.md, mind.md, todos.md).
If `@reflect <text>` → focus on that.

1. Audit all files + Section C todos. Identify: stale paths, logic gaps, contradictions, addressable todos.
2. Rank by impact: correctness → clarity → polish.
3. Implement /one/ fix. Report what/why. Call again for more.



---



█ @relearn

Compare codebase (truth) against memory. Correct stale/wrong/missing entries.

1. Read mind.md B. For repo files (up to 20, highest SCORE first): read current content. Check for recently modified files not yet in B.
2. Cross-check: find memory files referencing each repo file. Flag /Stale/, /Wrong/, or /Missing/.
3. Stale/Wrong → update NOTE+WHY, SCORE −200 (floor 1), add `[corrected <date>]`. Missing → `@remember` inline. INVARIANT → flag to user only.
4. Reevaluate affected categories.
5. Report:
```
[RELEARN REPORT]
Repo files checked: <N> │ Memory files checked: <N>
Corrected: <list> │ Created: <list>
Flagged (INVARIANT conflicts): <list or "none">
```

`@relearn <path>` restricts to that file/directory.



---



█ @todo

1. Summarize input → actionable line (max 80ch, starts with verb). Multiple tasks → multiple rows.
2. Assign category (per § Category assignment).
3. Next sequential `#` from `todos.md`.
4. Append: `│ <#> │ pending │ <cat> │ <YYYY-MM-DD> │ <desc> │`
5. Rebuild mind.md C per § Updating mind.md After a Write.
6. Confirm:
```
[TODO ADDED]
#<N> [<cat>]: <desc>
```



---



█ @work

Pick the highest-rated pending todo and solve it.

❚ STEP 1 — Select

1. Read `mind.md` Section C (open todos sorted by category activity).
2. Pick the top row (highest category score). On tie → oldest DATE wins.
3. If Section C is empty → `[WORK] No pending todos.` and stop.

❚ STEP 2 — Load context

Run `@reason` with the todo description as the query. Gather relevant memory.

❚ STEP 3 — Execute

Solve the todo: implement the change, answer the question, or produce the artifact.
Apply directly to the codebase or output as appropriate.

❚ STEP 4 — Close

1. Update the row in `todos.md`: set STATUS to `done`.
2. Remove the item from `mind.md` Section C.
3. Run `@remember` to capture any reusable fact from the work.
4. Report:
```
[WORK COMPLETE]
#<N> [<cat>]: <desc>
Result: <one-line summary of what was done>
```



---



█ @extend

Add or refresh external marble repos as federated knowledge sources.

`@extend <github-url>` — add a repo.  `@extend` (no args) — refresh all.

❚ URL RESOLUTION

Accepted formats (all resolve to `owner`, `repo`, `branch`):
- `https://github.com/owner/repo`          → branch = `main`
- `https://github.com/owner/repo/tree/dev` → branch = `dev`
- `owner/repo`                             → shorthand, branch = `main`
- `owner/repo@branch`                      → explicit branch

Resolved to raw URL: `{RAW_TEMPLATE}` with `path = mind.md`

❚ STEP 1 — Fetch remote mind.md

1. Build raw URL: `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/mind.md`
2. Fetch content. If fetch fails → try `master` branch as fallback → report error and stop.
3. Parse Section B to extract file list (SCORE, Category, HASH, PATH).

❚ STEP 2 — Validate

- Must have a valid Section B with at least one entry.
- Reject if the URL points to the local repo itself.

❚ STEP 3 — Update sources.md

Append or update the entry in `sources.md`:
```
│ owner/repo  │ branch │ <entry count> │ <ISO-8601> │ online │
```

❚ STEP 4 — Report

```
[EXTEND] Added: owner/repo (branch)
  Files indexed: <N>
  Top categories: <top 3 from their Section A>
```

❚ REFRESH MODE (`@extend` no args)

For each entry in `sources.md`:
1. Re-fetch mind.md.
2. Update entry count and timestamp.
3. Mark `offline` if unreachable after retry.



---



█ EXTERNAL SOURCE RESOLUTION (used by @reason)

When `@reason` runs and `sources.md` has entries:

❚ STEP 1 — Select relevant sources

1. Read `sources.md`. Filter to `online` entries.
2. For each source, fetch its `mind.md` Section B (use cached version if < 1 hour old).
3. Score each remote file: `remote_score = stored_SCORE × lexical_sim(query, category + path)`.
4. Merge remote files into the processing queue alongside local files.
   Tag remote entries with `[REMOTE:{owner}/{repo}]`.
5. Cap remote files at SOURCE_MAX highest-scored entries total across all sources.

❚ STEP 2 — Fetch remote files on demand

When the processing queue reaches a remote entry:
1. Build raw URL: `{RAW_TEMPLATE}` with the file's PATH.
2. Fetch content. On failure → skip, log warning, continue.
3. Pass to `@spread` like a local file, but tag output as `[REMOTE]`.

❚ STEP 3 — Attribution

In the `@reason` output, remote sources are clearly attributed:
```
[CONTEXT FROM MEMORY]
Sources: <local HASH │ PATH>, [REMOTE:owner/repo] <HASH │ PATH>
<synthesized facts>
[CONFIDENCE: 0.0–1.0]
```

Remote files are READ-ONLY. Never modify scores or content of remote files.
Remote facts that prove useful locally → `@remember` them as local memory with
`[sourced from owner/repo <HASH>]` in WHY field.



---



█ @spread (internal)

Fan-out processor called by `@reason`. Maps to: Copilot `/fleet`, Claude `runSubagent`, OpenAI parallel calls, or sequential fallback.

/Input:/ `QUERY` + `INPUTS: [{ id, path, content }, ...]`

/Per-subagent output:/
```
[SPREAD RESULT]
Source: <HASH> │ <PATH>
Facts / Decisions / Patterns: <bullet lists>
Contradicts: <conflicts or "none">
Match: DIRECT │ PARTIAL │ NONE
```

/Merge:/ Sort DIRECT→PARTIAL→NONE. Discard NONE unless < 3 results. Dedup overlap ≥ 0.88 → keep higher-SCORE.



---



## █ END OF INSTRUCTIONS
