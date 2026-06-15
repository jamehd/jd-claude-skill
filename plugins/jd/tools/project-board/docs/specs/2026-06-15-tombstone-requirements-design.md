# Tombstone Requirements — Design Spec

Date: 2026-06-15
Status: approved (brainstorm with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board`.

## Problem

A requirement that has been deliberately removed is kept in the requirements doc
as a **tombstone** (ID retained, "do not reuse") — e.g. `IDC-R7: Manifest
chunk-level diff — REMOVED`. Re-scan still writes a status row for it
(`done | tested:no`, with a tombstone note). `buildCandidates` then emits a
spurious **"Thêm test cho IDC-R7"** candidate, because its rule is *state ≠
missing AND tested = no → propose a test*. Proposing tests for removed code is
nonsensical, and every future tombstone (`done | tested:no`) hits the same trap.

Root cause: `buildCandidates` has no notion of "removed" — it only reads
state + tested. The tombstone signal exists only as prose in the requirement.

## Decision (locked)

| Topic | Decision |
|---|---|
| Tombstone marker | Reuse the existing convention: a requirement whose **title ends with `REMOVED`** is a tombstone. No new syntax. (`IDC-R7` already follows it: title `Manifest chunk-level diff — REMOVED`.) |
| Detection | `parseRequirementDoc` sets a new `removed: boolean` on each `Requirement` via `/\bREMOVED\s*$/i.test(title)` (anchored at end to avoid false positives). |
| Suppression point | `buildCandidates`: for each status-doc row, if `reqIndex.get(row.id)?.removed` is true, skip it entirely — emit NO implement and NO test candidate. |
| Re-scan | Unchanged. The status doc keeps the tombstone row as documentation; suppression happens downstream at candidate generation. |
| CAFE-R4 | Untouched. It is genuinely `partial` (AC2 signature verification not implemented), so its "Hoàn thiện CAFE-R4" candidate is correct and must keep appearing. |

## Changes

1. **`server/src/jobs/requirements.ts`**
   - `Requirement` interface gains `removed: boolean`.
   - In `parseRequirementDoc`, when a `## <ID>: <title>` heading is matched,
     set `removed: /\bREMOVED\s*$/i.test(title)` on the new requirement object.

2. **`server/src/jobs/candidates.ts`**
   - In `buildCandidates`, inside the `for (const row of doc.rows)` loop, after
     `const req = reqIndex.get(row.id)`, add: `if (req?.removed) continue` so a
     removed requirement produces no candidates. (A row whose id is absent from
     `reqIndex` — no matching requirement — is NOT treated as removed and behaves
     as today.)

## Testing

- **`server/src/requirements.test.ts`** (create if absent; else extend):
  `parseRequirementDoc` on a doc with `## IDC-R7: Manifest chunk-level diff — REMOVED`
  yields `removed: true`; a normal `## CAFE-R4: Manifest v2 + differential update`
  yields `removed: false`. Confirm `removed` is case-insensitive and end-anchored
  (a title merely containing "removed" mid-sentence is NOT a tombstone — e.g.
  `## X-R1: Handle removed files` → `removed: false`).
- **`server/src/candidates.test.ts`** (extend): with a `reqIndex` where a req is
  `removed: true`, `buildCandidates` emits zero candidates for that id regardless
  of its status-doc row (`done|tested:no`, `partial`, or `missing`); a non-removed
  req with the same row shapes still emits its usual candidate(s).
- Full suite + typecheck stay green.

## Verification (live)

After deploy, `GET /api/scan-candidates` must contain NO `reqId: 'IDC-R7'`
candidate, and MUST still contain the `reqId: 'CAFE-R4'` implement candidate.
Then sweep all status docs for other tombstone rows that were emitting spurious
candidates (any req whose title ends with `REMOVED`).

## Out of scope

- New marker syntax (a `Status: removed` line) — the title convention suffices.
- Changing the re-scan prompt or the status-doc format.
- UI changes.
- Removing tombstone rows from status docs (they remain as documentation).
