# REMEMBER
# TRIGGER: @remember  (also runs automatically at the END of every message)

Read `@marble/cortex.md` and `@marble/memory.md` first if not already loaded this session.

Before any evaluation, build:
```
effective_input = cortex.md + "\n\n" + incoming_prompt
```
Use `effective_input` for deciding what to save.
If `cortex.md` is empty, use `incoming_prompt` unchanged.

---

## Step 1 — Decide what to save

Decide on **one thing** worth remembering from this interaction:
- A decision that was made.
- A pattern that was discovered.
- A fact that will matter again.
- A user preference or constraint.

If `@remember <text>` was provided, use `<text>` as `incoming_prompt` before cortex conditioning.

**Scratch notes go to `downstream/` instead**: if the thing is only useful for now
(e.g. a working assumption, a temp variable name, a half-formed idea) → create a new note in
`@marble/downstream/` and do NOT create a memory file yet. Prepend `@elbram` to mark AI-generated input;
the mode will be chosen by downstream investigation on the next `@marble` churn.

Rules for a good permanent note:
- Must stand alone with zero prior context.
- Facts > opinions. Decisions > discussions. Patterns > one-offs.
- WHY captures causality, not just what happened.
- Discard if it wouldn't be useful in a future session.

---

## Step 2 — Assign a category

1. Read `@marble/mind.md` Section A (category list).
2. Pick the best matching existing category (lowercase slash-separated, max 3 segments).
3. If no existing category fits (lexical similarity < 0.72 to all existing cats) → coin a new one.

---

## Step 3 — Create the memory file

1. Generate HASH per `@marble/memory.md §3`:
   ```
   hash = sha1( unix_ms_timestamp + "|" + "@marble/memory/<cat/path>.md" )[:8]
   ```
2. Create `@marble/memory/<category>/<HASH>.md` (max 3 directory levels under `memory/`).
3. Write the file using the format from `@marble/memory.md §2`:
   ```
   - HASH:      <8 hex>
   - DATE:      <ISO-8601>
   - CATEGORY:  <cat>
   - SCORE:     <INITIAL_SCORE from @marble/marble.md variables>
   - INVARIANT: TRUE | FALSE
   - NOTE:      <=250 chars
   - WHY:       <=180 chars
   - LINKS:     []
   ```
   Set `SCORE: 1000` — all new files start at maximum importance.
   Set `INVARIANT: TRUE` only for hard constraints or facts that must never be forgotten.

4. **Dup check before creating**: scan existing files in the same category. Compute token overlap
   of new NOTE against each existing NOTE. If any match ≥ 0.88 AND INVARIANT=FALSE:
   - New SCORE ≤ existing → skip, do not create.
   - New SCORE > existing → overwrite the existing file; note `[supersedes <HASH>]` in WHY.

---

## Step 4 — Update mind.md

Follow `@marble/memory.md §6`:
1. Insert new row in Section B at the top (SCORE 1000).
2. If the category is new, add it to Section A.
3. Re-sort Section B descending. Enforce 256-entry cap (drop lowest non-INVARIANT if over).
4. Update Section A score for the affected category.
5. Rebuild Section C from pending todos in `@marble/todos.md`.
