# REASON
# TRIGGER: @reason  (also runs automatically at the START of every message)

Read `@marble/cortex.md` and `@marble/memory.md` first if not already loaded this session.

Build an effective query before any evaluation:
```
effective_query = cortex.md + "\n\n" + incoming_query
```
If `cortex.md` is empty, use `incoming_query` unchanged.

---

## Step 1 — Load and sort the master file list

1. Read `@marble/mind.md` Section B (the master file list, ≤256 rows).
2. Scan peer memory for supplementary context:
   - If `@marble/peer/downstream/` exists: recursively collect all `.md` files under
     `@marble/peer/downstream/memory/` as additional candidates.
   - If `@marble/peer/upstream/` exists: recursively collect all `.md` files under
     `@marble/peer/upstream/memory/` as additional candidates.
   - Treat peer memory files as supplementary with base SCORE 500 (lower than own memory,
     but still searchable). Do not write back to peer files.
3. Compute a **task-relevance score** for every row:
   ```
   task_score = stored_SCORE × lexical_sim(effective_query, category + path)
   ```
   where `lexical_sim` is token-overlap ratio (0–1).
4. Re-order the list for processing using the **interleaved round-robin** rule from `@marble/memory.md §5`:
   - Rank categories by their Section A score descending.
   - Interleave files one-at-a-time across categories in that rank order.
   - Within each category slot, take the highest task_score file not yet placed.

The result is the **processing queue** — a flat ordered list of file paths.

---

## Step 2 — Process files with @spread, step by step

Walk the processing queue **from position 1 downward**. For each file:

1. Read the file (full content).
2. Invoke `@spread` with the file content + effective query as input (see `@marble/synapses/spread.md`).
   Each spread unit extracts: relevant facts, decisions, patterns, and contradictions that bear on the query.
3. Collect each spread result into a **context buffer**.
4. **Early stop** — halt if any of:
   - A spread result contains a direct fact match or an `INVARIANT=TRUE` match to the effective query.
   - Context buffer has accumulated ≥ 10 file outputs.
   - All files in the queue are exhausted.

Override file limit with `@reason --limit N <text>` (default: stop at 10 files).

---

## Step 3 — Reevaluate scores after reading

After processing, trigger a reevaluation pass per `@marble/memory.md §4`:
- For each category that had at least one file processed: run the importance re-rank.
- Update SCORE values in `@marble/mind.md` Section A and Section B.
- Apply usage deltas (values from `@marble/marble.md` variables):
  - File read AND used in answer → SCORE += `SCORE_USED` (capped at `SCORE_MAX`).
  - File read but not used → SCORE += `SCORE_UNUSED` (floored at `SCORE_MIN`).
- Re-sort Section B descending. Enforce `TABLE_CAP`-entry cap.

Note: peer memory files are read-only — do not update scores in peer files.

---

## Step 4 — Return to main agent

Synthesize the context buffer into a structured answer:

```
[CONTEXT FROM MEMORY]
Sources: <list of HASH | PATH for every file that contributed>

<synthesized facts, decisions, patterns relevant to the query>

[CONFIDENCE: 0.0–1.0]
```

Hand this block to the main agent. The main agent uses it to formulate the final response to the user.

---

## Manual invocation: `@reason <text>`

Same steps above, but use `<text>` as `incoming_query` before applying cortex conditioning.
Override file limit with `@reason --limit N <text>` (default: stop at 10 files).
