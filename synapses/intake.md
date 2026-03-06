# INTAKE
# TRIGGER: @marble
# Purpose: Process all pending notes in the downstream/ folder, one by one, in order.

Read `@marble/cortex.md`, `@marble/memory.md`, and `@marble/marble.md` variables first if not already loaded.

---

## Intake file format

Each file in `@marble/downstream/` is a plain markdown note written by the user or the agent.

Structure:
```
<optional metadata lines>

<content>
```

- Optional metadata lines (if present) should be near the top:
  - `@elbram` (AI-generated note marker)
  - A mode hint such as `@reason`, `@reflect`, `@remember`, `@relearn`, or `@todo`
- Everything else is treated as free-form content.

Canonical minimal template (recommended):
```markdown
@elbram
@remember   # optional hint; intent still wins

<your note>
```

Status markers (written by the agent, never by the user):

```
STATUS: pending      ← default, no marker needed — absence = pending
STATUS: in-progress  ← written at start of processing
STATUS: done         ← written after processing completes
SOURCE: user|agent|ai-generated|unknown
PROCESSED: <ISO-8601 timestamp>
```

Status metadata is appended at the bottom of the file when written.

---

## Step 1 — Scan downstream/

List all files in `@marble/downstream/` (non-recursive — top level only; all subfolders are ignored).
Collect all files where STATUS is `pending` (no STATUS line) or `in-progress`.
Sort by file modification time, oldest first.

If no pending files → report "Nothing to process." and stop.

---

## Step 2 — Pick and process ONE file

From the pending list, select the **single most worthy** file to process.
"Most worthy" = the one whose content has the highest immediate value or impact.
When in doubt, prefer the oldest (first in sort order).

Process that file only. After marking it done, **stop** — do not continue to the next file.
The next pending file will be picked up the next time `@marble` is called.

### For the chosen file:

### 2a — Mark in-progress
Append/update metadata in the file:
```
STATUS: in-progress
```
Also ensure `SOURCE:` exists:
- If file already has `SOURCE:`, keep it.
- Else infer it:
  - If `@elbram` marker is present near the top → `SOURCE: ai-generated`
  - Else if clearly written by an agent workflow → `SOURCE: agent`
  - Else if clearly from the user → `SOURCE: user`
  - Else → `SOURCE: unknown`

### 2b — Build effective prompt
Construct the effective prompt for this downstream note:

First, derive `cleaned_note_content` by removing metadata lines
(`@elbram`, mode hint, `SOURCE:`, and status lines).

```
effective_note_prompt = cortex.md + "\n\n" + cleaned_note_content
```

Use `effective_note_prompt` for all remaining evaluation and routing in this file.
If `cortex.md` is empty, use `cleaned_note_content` unchanged.

### 2c — Validate AI-marked notes
If `@elbram` marker is present, treat the note as if it came from a different AI system.
Do not trust claims by default.

Validation pass:
- Verify concrete facts against codebase and/or memory.
- Mark each key claim as `verified`, `unverified`, or `conflict`.
- If a claim conflicts with INVARIANT memory → flag it explicitly, do not silently accept.

### 2d — Route to the appropriate mode

Determine intent using `effective_note_prompt`.

Priority order:
1. **Explicit mode hint** in the note (`@reason`, `@reflect`, `@remember`, `@relearn`, `@todo`) → use that mode.
2. **Intent inference** — infer the best mode from the content:
   - New fact / decision / preference → `@remember`
   - Question / analysis task → `@reason`
   - Suspected code drift / stale memory → `@relearn`
   - Agent file quality issue → `@reflect`
   - Action item → `@todo`

Run the chosen synapse now.

### 2e — Mark done
After the mode synapse completes, append final metadata to the file:
```
STATUS: done
PROCESSED: <ISO-8601 timestamp>
```

---

## Step 3 — Move to upstream/

Copy the completed file from `@marble/downstream/<file>` to `@marble/upstream/<file>`.
Do not delete from `downstream/` — the done STATUS marker prevents reprocessing.

---

## Step 4 — Trigger @push (if configured)

If any SYNC CONFIG field (`REPO`, `DOWNSTREAM`, or `UPSTREAM`) is set in `@marble/marble.md`:
→ automatically trigger `@marble/synapses/push.md` now.

---

## Step 5 — Report

Print:
```
[CHOREY] Processed: <filename>
  Mode: <mode used>
  Source: <user|agent|ai-generated>
  Result: <one-line summary of what was done>
```
