# MEMORY
# How the global mind table is built and maintained.

---

## 1. The Global Table — `@marble/mind.md`

The table in `mind.md` is the **single source of truth** for every tracked file across the entire repo.
It has three sections that are always kept in sync.

### Section A — Category Scores

One row per category. Score = the **highest individual file score** in that category.
Rebuilt after every reevaluation pass.

```
█  Category  █  SCORE
|            |
| <cat>      | <0–1000>
| ...        | ...
```

### Section B — Master File List

One row per tracked file. Hard cap: **256 entries**. Sorted descending by SCORE.
When inserting would exceed 256, drop the lowest-scored non-`INVARIANT` entry first.

```
█  SCORE  █  Category  █  HASH      █  PATH
|  <0–1000>  |  <cat>     |  <8 hex>   |  <path>
|  ...        |  ...       |  ...       |  ...
```

Fields:
- **SCORE** — current importance rating (0–1000).
- **Category** — slash-separated id, max 3 segments, e.g. `arch/db` or `ux/forms/input`.
- **HASH** — `sha1( unix_ms_timestamp + "|" + path )[:8]`. Stable once assigned; never recomputed.
- **PATH** — one of:
  - `@marble/<relative>` for files inside this repo.
  - plain repo-relative path for all other files.

### Section C — Open Todos

Live index of all `pending` todos from `@marble/todos.md`. Sorted by **category activity**:
categories with higher Section A scores float their todos to the top, so work naturally
gravitates toward the most active area.

```
█  #  █  Category  █  TODO
| <N>  |  <cat>     |  <description>
| ...  |  ...       |  ...
```

Completed (`done`) todos are removed from Section C immediately. The full history
(including done items) lives in `@marble/todos.md`.

---

## 2. Memory File Layout

Incoming todo, ideas and notes are stored as individual files under `@marble/memory/`.

```
@marble/memory/
  <category>/              ← level 1  (required)
    [<sub>/]               ← level 2  (optional)
      [<sub>/]             ← level 3  (optional, deepest allowed)
        <HASH>.md          ← the memory file
```

Rules:
- Category path mirrors the `Category` field in Section B.
- **Maximum depth: 3 levels** below `memory/`. No deeper nesting.
- The filename is the 8-character HASH (see §1), e.g. `0bb00169.md`.

### Memory File HEADER Format

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

## 3. ID / HASH Generation

```
hash = sha1( unix_ms_timestamp + "|" + file_path )
id   = hash[:8]
```

- `unix_ms_timestamp` — milliseconds since epoch at time of first write.
- `file_path` — the final intended path of the file (e.g. `@marble/memory/arch/0bb00169.md`).
- Hash is computed **once** at creation — never recomputed even if the file moves.

---

## 4. Score Reevaluation

After any read pass (e.g. `@reason`, `@relearn`, `@reflect`), apply deltas per marble.md variables:

```
if file was read AND contributed to the answer → SCORE += SCORE_USED
if file was read but did NOT contribute         → SCORE += SCORE_UNUSED
```

Clamp all scores to `[SCORE_MIN, SCORE_MAX]`.
Files with `SCORE ≤ SCORE_PRUNE` are deleted on next reevaluation.
After updating all scores, re-sort Section B descending and rebuild Section A.

---

## 5. Interleaved Round-Robin Processing Order

To prevent any single high-scoring category from monopolizing the context window:

1. Sort categories by Section A score descending → rank order.
2. Walk the rank list repeatedly, taking one file per category per pass.
3. Within each category slot, always pick the highest `task_score` file not yet taken.
4. Continue until the processing queue is filled or all files are placed.

---

## 6. Updating mind.md After a Write

After any memory file is created or modified:
1. Insert or update the row in Section B (re-sort descending).
2. Update Section A for the affected category (set score = max score of all files in that category).
3. Enforce `TABLE_CAP` — if over 256 entries, drop the lowest-scored non-INVARIANT row (delete the file too).
4. Rebuild Section C from `@marble/todos.md` pending items, sorted by category activity.
