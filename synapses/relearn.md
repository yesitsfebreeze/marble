# RELEARN
# TRIGGER: @relearn
# Purpose: Compare the actual codebase (truth) against memory. Correct stale, wrong, or missing entries.

Read `@marble/cortex.md` and `@marble/memory.md` first if not already loaded this session.

Before any evaluation, build:
```
effective_input = cortex.md + "\n\n" + incoming_prompt
```
If `cortex.md` is empty, use `incoming_prompt` unchanged.

---

## Step 1 — Sample the codebase

1. Read `@marble/mind.md` Section B. Identify all rows where PATH does **not** start with
   `@marble/memory/` — these are direct repo files.
2. For each repo file in Section B (up to 20, highest SCORE first): read its current content.
3. Also check for any recently modified files not yet in Section B
   (use git status or directory scan if available).

---

## Step 2 — Cross-check against memory

For each repo file read in Step 1:
1. Find all memory files in `@marble/memory/` whose NOTE or WHY references this file, path, or topic.
2. Compare what memory says against what the file actually contains now.
3. Flag any of:
   - **Stale** — memory describes something that no longer exists or has changed.
   - **Wrong** — memory contradicts the actual code/content.
   - **Missing** — important facts in the file are not captured in memory at all.

---

## Step 3 — Correct the discrepancies

For each flagged memory file:
- **Stale / Wrong** → update the NOTE and WHY fields to reflect current reality.
  Lower SCORE by 200 (floor 1) to signal it was out of date.
  Add `[corrected <ISO date>]` to WHY.
- **Missing** → run `@remember` inline to create a new memory file for the missing fact.
- **INVARIANT=TRUE** entries are never modified. Flag them to the user instead.

After corrections, run `@marble/memory.md §4` reevaluation for every affected category.

---

## Step 4 — Report

Output a summary:
```
[RELEARN REPORT]
Repo files checked: <N>
Memory files checked: <N>

Corrected: <list of HASH | short description of what changed>
Created:   <list of HASH | short description>
Flagged (INVARIANT conflicts): <list or "none">
```

---

## Manual invocation: `@relearn <path>`

Same steps above but use `<path>` as `incoming_prompt` before cortex conditioning,
then restrict Step 1 to only the file or directory selected by `effective_input`.
