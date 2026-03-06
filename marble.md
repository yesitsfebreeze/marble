█ IMPORTANT FILES
█ DO NOT READ YET! JUST REMEMBER THEIR LOCATION

LOCATION           █ ALIAS        █ PURPOSE
                   |              |
@marble/mind       | `@mind`      | Global index table of all tracked files (256 max).
@marble/cortex     | `@cortex`    | Global preprompt context prepended to every incoming message/note before evaluation.
@marble/memory     | `@memory`    | Saved hashed memory files, organized by category.
@marble/memory     | `@memory.md` | How to build and maintain the index → read this first.
@marble/synapses   | `@synapses`  | Command definitions for marble.
@marble/todos      | `@todos`     | Central todo list. Managed by the @todo synapse.
@marble/downstream | `@downstream`| User/agent-written notes. Prefix `@elbram` for AI-generated notes.
                   |              | Each note is investigated at churn time, AI-marked notes are validated first,
                   |              | then routed to the best mode (`@reason` `@reflect` `@remember` `@relearn` `@todo`).
                   |              | Type `@marble` to process all pending notes in this folder.
@marble/upstream   | `@upstream`  | Processed (done) intake files — outbound queue.
                   |              | On @push, these are delivered to peers per SYNC CONFIG.
@marble/tools      | `@tools`     | Reusable scripts (Python, shell, etc.) marble writes for recurring chores.
                   |              | Requires user-granted execute permissions. See TOOLS section below.
@marble/synapses/setup | `@setup` | Mandatory boot checklist. Run once per session before anything else.


RUN `@marble/synapses/setup.md` FIRST — before reading anything else.
THEN READ `@marble/cortex.md`
THEN READ `@marble/memory.md`


█ TOOLS — `@marble/tools/`

Marble may write reusable scripts under `@marble/tools/` to automate recurring tasks
(hashing, validation, bulk checks, etc.) instead of issuing multi-step terminal commands.

Rules:
- Scripts live in `@marble/tools/`. One file per tool, named descriptively (e.g. `hash_check.py`).
- Marble may CREATE tool files at any time — writing is always allowed.
- Marble may NOT EXECUTE tools unless the user has granted execute permissions for that environment.
- If marble identifies a task that would benefit from a tool but lacks execution rights,
  marble MUST inform the user: "I could automate this with a tool under @marble/tools/ —
  grant me execute permissions to use it."
- Tools are plain scripts (Python preferred). No external dependencies without user approval.


█ GLOBAL PROMPT CONDITIONING

For every incoming prompt (direct user message OR downstream note), build:

```
effective_prompt = cortex.md + "\n\n" + incoming_prompt
```

Use `effective_prompt` for all evaluations, routing, validation, and downstream mode execution.
If `cortex.md` is empty, use `incoming_prompt` unchanged.


█ VARIABLES
█ These values are referenced by all synapses. Change here to affect the whole system.

VARIABLE         █ VALUE  █ MEANING
                 |        |
INITIAL_SCORE    | 750    | Score assigned to every newly created memory file.
SCORE_MIN        | 1      | Floor — no file goes below this.
SCORE_MAX        | 1000   | Ceiling — no file goes above this.
SCORE_PRUNE      | 15     | Files at or below this are deleted on next reevaluation.
SCORE_USED       | +30    | Delta applied when a file was read AND used in the answer.
SCORE_UNUSED     | -10    | Delta applied when a file was read but not used.
TABLE_CAP        | 256    | Max entries in mind.md Section B.


█ SYNC CONFIG
█ Defines what remote repos this agent syncs with and in which directions.
█ Leave a field as (unset) to disable that direction entirely.

VARIABLE         █ VALUE    █ MEANING
                 |          |
SOURCE           | marble   | Human-readable name of THIS agent instance.
                 |          | Stamped into every delivered file (PUSHED_BY header) and every
                 |          | git commit message so the full push chain is traceable.
                 |          | Change to something unique if running multiple instances.
REPO             | (unset)  | This agent's own git remote — where @marble/ lives in the cloud.
                 |          | On @push: @marble/ is committed and pushed here as a backup.
DOWNSTREAM       | (unset)  | Remote that FEEDS this agent — marble pulls incoming notes from here.
                 |          | On @setup: cloned into @marble/peer/downstream/ if not present.
                 |          | On @push: @marble/upstream/ files are copied into the peer's downstream/.
UPSTREAM         | (unset)  | Remote that this agent FEEDS — marble pushes processed notes there.
                 |          | On @push: the local clone of this remote gets @marble/upstream/ files
                 |          | copied into its downstream/, then pushed to the remote.


█ OPERATION FILES

WHEN the user types any `@COMMAND`, read the file and act accordingly.
ELSE SKIP the next table.

COMMAND     █ LOCATION                  █ PURPOSE
            |                           |
@marble     | `@synapses/intake.md`     | Process all pending notes in downstream/; dispatch each by its mode.
@reason     | `@synapses/reason.md`     | Load & sort memory, process with @spread, return context.
@reflect    | `@synapses/reflect.md`    | Audit @marble/ files, find issues, implement the top fix.
@remember   | `@synapses/remember.md`   | Save one important fact from this session to memory.
@relearn    | `@synapses/relearn.md`    | Compare codebase (truth) to memory, correct stale entries.
@todo       | `@synapses/todo.md`       | Add a todo item to the central todo list.
@push       | `@synapses/push.md`       | Push per SYNC CONFIG. Auto-triggered after every @marble run if any SYNC CONFIG field is set.
@setup      | `@synapses/setup.md`      | Boot checklist: verify .gitignore, clone/pull peer repos per SYNC CONFIG.


█ INTERNAL UTILITIES
█ These are called by synapses, not typed directly by the user.

UTILITY     █ LOCATION                  █ PURPOSE
            |                           |
@spread     | `@synapses/spread.md`     | Fan out inputs to subagents; collect and merge results.
