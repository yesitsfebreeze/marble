# REFLECT
# TRIGGER: @reflect
# Scope: @marble/ files ONLY. No repo files, no memory files, no downstream/ touched.

Read `@marble/cortex.md` and `@marble/memory.md` first if not already loaded this session.
Read `@marble/todos.md` and `@marble/mind.md` Section C (open todos) as input.

Before any evaluation, build:
```
effective_input = cortex.md + "\n\n" + incoming_prompt
```
If `cortex.md` is empty, use `incoming_prompt` unchanged.

---

## Step 1 — Audit the marble files

Read all files in `@marble/` and `@marble/synapses/`:
- `marble.md`, `mind.md`, `memory.md`, `todos.md`
- `synapses/reason.md`, `synapses/reflect.md`, `synapses/remember.md`, `synapses/relearn.md`
- `synapses/spread.md`, `synapses/intake.md`, `synapses/todo.md`, `synapses/push.md`, `synapses/setup.md`

Also read `mind.md` Section C — the open todo list. Treat every pending todo as a potential
issue to consider alongside the file audit.

Identify issues in any of them:
- Stale paths or command names.
- Missing steps or gaps in logic.
- Contradictions between files.
- Anything that makes the system harder to follow or execute.
- Pending todos that could be addressed by fixing a marble file.

If `@reflect <text>` was provided, use `<text>` as `incoming_prompt` before cortex conditioning, then focus using `effective_input`.

---

## Step 2 — Rank improvements

List every issue found as a one-line actionable item:
```
[ ] <file> — <what to fix>
```
Sort by impact: correctness bugs first, then clarity, then polish.

---

## Step 3 — Implement the single highest-value fix

1. Pick the top `[ ]` item.
2. Edit the relevant `@marble/` file to apply the fix.
3. Mark it `[x]` in your list.
4. Report: what was broken, what you changed, and why.

Only one fix per `@reflect` invocation. If the user wants more, they call `@reflect` again.
