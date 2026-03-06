# PUSH
# TRIGGER: @push  (also auto-triggered by @marble after intake if any SYNC CONFIG field is set)
# Purpose: Deliver @marble/upstream/ to peers and push own REPO per SYNC CONFIG.

Read `@marble/marble.md` SYNC CONFIG if not already loaded.
Read `SOURCE` from SYNC CONFIG (default: `marble` if unset).

---

## Overview

`@marble/upstream/` is the outbound queue of fully-processed notes.
SYNC CONFIG defines up to three actions:

| Config field | Action on @push                                                        |
|--------------|------------------------------------------------------------------------|
| `DOWNSTREAM` | Copy `@marble/upstream/` into the DOWNSTREAM peer's `downstream/`     |
| `UPSTREAM`   | Copy `@marble/upstream/` into the UPSTREAM peer's `downstream/`        |
| `REPO`       | Commit and push this agent's own files to its cloud backup             |

All three are optional and independent. Skip any whose config is `(unset)`.

---

## Step 1 — Pre-flight checks

Read SYNC CONFIG. If all three fields are `(unset)`:
→ print `[PUSH] No SYNC CONFIG fields set. Nothing pushed.` and stop.

Check that `@marble/upstream/` exists and contains at least one file.
If empty → print `[PUSH] @marble/upstream/ is empty. Nothing to push.` and stop.

---

## Step 2 — Deliver to DOWNSTREAM peer (if set)

> This makes marble's processed output visible as new pending notes to its configured DOWNSTREAM source.

Read `DOWNSTREAM` from SYNC CONFIG.
If `(unset)` → skip this step.

### 2a — Ensure local clone exists

Check `@marble/peer/downstream/.git/`:
- If missing → clone: `git clone <DOWNSTREAM> @marble/peer/downstream`

### 2b — Pull latest from remote

```bash
cd @marble/peer/downstream && git pull origin main
```

### 2c — Copy files

For each file in `@marble/upstream/`, before copying, prepend a provenance header:

```
PUSHED_BY: <SOURCE>
PUSHED_AT: <ISO-8601 timestamp>
PUSHED_FROM: DOWNSTREAM
---
<original file content>
```

Then write the stamped file to `@marble/peer/downstream/downstream/<file>`.
Create `@marble/peer/downstream/downstream/` if it does not exist.
Do not delete files from `@marble/upstream/` — they stay as a local archive.

### 2d — Commit and push

```bash
cd @marble/peer/downstream
git add downstream/
git commit -m "downstream: sync from <SOURCE> [auto]"
git push origin main
```

Substitute `<SOURCE>` with the SYNC CONFIG `SOURCE` value.

If execute permissions are not granted, print the commands above for the user to run manually.

---

## Step 3 — Deliver to UPSTREAM peer (if set)

> This pushes marble's output forward to whoever sits downstream in the pipeline.

Read `UPSTREAM` from SYNC CONFIG.
If `(unset)` → skip this step.

### 3a — Ensure local clone exists

Check `@marble/peer/upstream/.git/`:
- If missing → clone: `git clone <UPSTREAM> @marble/peer/upstream`

### 3b — Pull latest from remote

```bash
cd @marble/peer/upstream && git pull origin main
```

### 3c — Copy files

For each file in `@marble/upstream/`, prepend a provenance header:

```
PUSHED_BY: <SOURCE>
PUSHED_AT: <ISO-8601 timestamp>
PUSHED_FROM: UPSTREAM
---
<original file content>
```

Then write the stamped file to `@marble/peer/upstream/downstream/<file>`.
Create `@marble/peer/upstream/downstream/` if it does not exist.

### 3d — Commit and push

```bash
cd @marble/peer/upstream
git add downstream/
git commit -m "downstream: sync from <SOURCE> [auto]"
git push origin main
```

Substitute `<SOURCE>` with the SYNC CONFIG `SOURCE` value.
If execute permissions are not granted, print the commands above for the user to run manually.

---

## Step 4 — Push own REPO backup (if set)

Read `REPO` from SYNC CONFIG.
If `(unset)` → skip this step.

```bash
git add @marble/
git commit -m "marble: sync from <SOURCE> [auto]" --allow-empty
git push <REPO> HEAD:main
```

Substitute `<REPO>` with the SYNC CONFIG value.

If execute permissions are not granted, inform the user:
> "I could automate this with a tool under @marble/tools/ — grant me execute permissions to use it."
> "Pending: `git push <REPO> HEAD:main`"

---

## Step 5 — Report

```
[PUSH] Done.
  DOWNSTREAM → <remote or "skipped">   (<N> files delivered)
  UPSTREAM   → <remote or "skipped">   (<N> files delivered)
  REPO       → <remote or "skipped">   (backup pushed)
```

Or on failure:
```
[PUSH ERROR] <step> — <reason>
```
