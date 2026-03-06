# TODO
# TRIGGER: @todo
# Purpose: Extract a todo item from a note, add it to the central todo list,
#          and index open todos in mind.md Section C.

Read `@marble/cortex.md`, `@marble/todos.md`, and `@marble/mind.md` first if not already loaded this session.

Before any evaluation, build:
```
effective_input = cortex.md + "\n\n" + incoming_prompt
```
If `cortex.md` is empty, use `incoming_prompt` unchanged.

---

## Step 1 — Parse the todo

If `@todo <text>` was provided, use `<text>` as `incoming_prompt` before cortex conditioning.
Otherwise, use full note content as `incoming_prompt` before cortex conditioning.
Then summarize `effective_input` into a single actionable line (max 80 chars).

Rules for a good todo:
- Starts with a verb (add, fix, build, remove, refactor, investigate…).
- Specific enough to act on without extra context.
- One task per todo. If the note contains multiple tasks, create one row per task.

---

## Step 2 — Assign a category

1. Read `@marble/mind.md` Section A (category list).
2. Pick the best matching existing category for the todo.
3. If no existing category fits → coin a new one (same rules as `@remember`).

---

## Step 3 — Assign a number

Read `@marble/todos.md`. Find the highest existing `#` value.
New todo(s) get the next sequential number(s).

---

## Step 4 — Append to todos.md

Add a new row to the table in `@marble/todos.md` for each todo:

```
| <#> | pending | <category> | <YYYY-MM-DD> | <todo description> |
```

- **#** — sequential integer.
- **STATUS** — always `pending` on creation.
- **Category** — from Step 2.
- **DATE** — today's date (ISO-8601, date only).
- **TODO** — the actionable description from Step 1.

---

## Step 5 — Update mind.md Section C

Rebuild Section C in `@marble/mind.md`:

1. Collect all `pending` todos from `@marble/todos.md`.
2. Sort them by **category activity**: order categories by their Section A score (descending).
   Within each category, keep original `#` order.
3. Write the sorted list to Section C:
   ```
   | # | Category | TODO |
   ```
4. Completed (`done`) todos are **removed** from Section C entirely.

---

## Step 6 — Confirm

Output:
```
[TODO ADDED]
#<N> [<category>]: <todo description>
```
