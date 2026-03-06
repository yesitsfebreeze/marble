# SPREAD
# TRIGGER: @spread
# Purpose: Spawn subagents to process inputs in parallel and collect their results.
#
# NOTE: /fleet is a GitHub Copilot-specific command for spawning sub-agents.
# @spread is this system's portable equivalent — it maps to whatever subagent
# tool the current agent has available.

---

## What @spread does

Given a set of **inputs** (files, chunks, questions) and a **query**:
1. Fan out — assign each input to a subagent.
2. Each subagent processes its input independently against the query.
3. Collect all results back into a single buffer.
4. Return the merged buffer to the caller.

---

## Tool mapping — use whichever is available

| Environment          | Tool to use                        |
|----------------------|------------------------------------|
| GitHub Copilot       | `/fleet`                           |
| Claude (Sonnet/Opus) | `runSubagent` (one call per input) |
| OpenAI Assistants    | Parallel tool calls in one request |
| Any agent w/ threads | Spawn threads, join results        |
| No subagent support  | Process inputs sequentially inline |

**Fallback**: if no subagent tool exists, run each input through the main agent
one at a time and concatenate results. Speed is lost but output is identical.

---

## Input contract

The caller passes:
```
QUERY:  <the question or task>
INPUTS: [
  { id: <HASH>, path: <PATH>, content: <full text> },
  ...
]
```

---

## Per-subagent instructions

Each subagent receives one input and the query. It must return:
```
[SPREAD RESULT]
Source: <HASH> | <PATH>
Facts:       <bullet list of relevant facts found>
Decisions:   <bullet list of relevant decisions found>
Patterns:    <bullet list of relevant patterns found>
Contradicts: <anything that conflicts with the query or other known facts, or "none">
Match:       DIRECT | PARTIAL | NONE
```

- `DIRECT` — content directly answers the query or matches an INVARIANT.
- `PARTIAL` — content is related but doesn't fully answer.
- `NONE` — content is not relevant to this query.

---

## Merge rules (caller's responsibility)

1. Collect all `[SPREAD RESULT]` blocks.
2. Sort by match priority: DIRECT first, then PARTIAL, then NONE.
3. Discard all NONE results unless fewer than 3 results remain.
4. Deduplicate: if two results state the same fact (token overlap ≥ 0.88), keep the one from the higher-SCORE source.
5. Return the merged buffer to whoever invoked `@spread`.
