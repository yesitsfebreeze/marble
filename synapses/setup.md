# SETUP
# Runs ONCE on first boot, and re-runs any steps that are not yet satisfied on subsequent boots.
# Triggered automatically when marble.md is first read.

Read `@marble/marble.md` SYNC CONFIG variables if not already loaded.

---

## What "boot" means

Every time an agent reads `@marble/marble.md` for the first time in a session,
it MUST run through this checklist before doing anything else.
Steps are idempotent — skip any step that is already satisfied.

---

## Checklist

### Step 1 — Verify workspace .gitignore

Check that `@marble/memory/` appears in the root `.gitignore` of this repo
(keeps private memory out of the main repository while still tracking agent definition files).

- If missing → append `@marble/memory/` to `.gitignore`.
- If present → skip.

---

### Step 2 — Clone DOWNSTREAM peer (if set)

Read `DOWNSTREAM` from SYNC CONFIG.

- If `(unset)` → skip. Note to user: "Set DOWNSTREAM in marble.md to receive notes from an upstream peer."
- If `@marble/peer/downstream/` already exists as a git repo (i.e. `.git/` is present) → skip to Step 3.
- Otherwise → clone:

  ```bash
  git clone <DOWNSTREAM> @marble/peer/downstream
  ```

  Run from the workspace root.

If execute permissions are not granted, inform the user:
> "Setup Step 2 requires execute permissions. Run: `git clone <DOWNSTREAM> @marble/peer/downstream` from the workspace root."

---

### Step 3 — Pull latest DOWNSTREAM peer

If `@marble/peer/downstream/.git/` exists, pull the latest changes so supplementary memory
is up to date before marble starts working:

```bash
cd @marble/peer/downstream && git pull origin main
```

If the pull fails (e.g. offline), warn but do not block:
> "Could not pull DOWNSTREAM peer — working with cached state."

If execute permissions are not granted, inform the user:
> "Run `cd @marble/peer/downstream && git pull origin main` to sync the latest peer memory."

---

### Step 4 — Clone UPSTREAM peer (if set)

Read `UPSTREAM` from SYNC CONFIG.

- If `(unset)` → skip. Note to user: "Set UPSTREAM in marble.md to push processed notes to a downstream agent."
- If `@marble/peer/upstream/` already exists as a git repo → skip.
- Otherwise → clone:

  ```bash
  git clone <UPSTREAM> @marble/peer/upstream
  ```

If execute permissions are not granted, inform the user:
> "Setup Step 4 requires execute permissions. Run: `git clone <UPSTREAM> @marble/peer/upstream` from the workspace root."

---

### Step 5 — Verify REPO (own remote)

Read `REPO` from SYNC CONFIG.

- If `(unset)` → skip. Note: "Set REPO in marble.md to enable pushing this agent's own files to the cloud."
- If already configured in local git remotes → skip.
- Otherwise → note to user: "Add REPO as git remote: `git remote add marble-origin <REPO>`"

---

## Done

Once all steps are satisfied, continue with normal operation.
No output needed unless a step was acted on or a warning was raised.
