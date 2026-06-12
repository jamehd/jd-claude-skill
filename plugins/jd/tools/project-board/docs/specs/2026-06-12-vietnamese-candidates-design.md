# Vietnamese Scan Candidates — Design Spec

Date: 2026-06-12
Status: approved (brainstorm with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board`.

## Purpose

The owner reads the board in Vietnamese. TASK/BUG generated from Re-scan are
currently English. Localize the **generated framing** of scan candidates (titles,
lead sentence, the "Acceptance" label) to Vietnamese, and have Re-scan write its
per-requirement **Note** in Vietnamese, so the cards are understandable. This is
the owner's explicit instruction; it overrides the English-by-default convention
for this user-facing board content only.

## Scope (locked)

Translate (deterministic, in `candidates.ts`):
- Titles: `Implement` → `Hiện thực`, `Complete` → `Hoàn thiện`, `Add tests for` →
  `Thêm test cho` (keep `<ID>: <title>` after the verb; `<title>` is the requirement
  title from the docs — left as authored).
- Lead: `Detected by scan: <ID> is missing/partial/untested.` →
  `Scan phát hiện: <ID> chưa làm / làm dở dang / chưa có test.`
- Body label: `Acceptance:` → `Tiêu chí chấp nhận:`.

Re-scan (in `prompt.ts` `buildRescanPrompt`): instruct the AI to write the **Note**
column in Vietnamese (the State/Tested values + the table structure stay as-is;
only the free-text note is Vietnamese).

NOT translated (stays as authored / English):
- The requirement **statement** + **acceptance criteria** text (from
  `docs/requirements/`, the English spec source).
- The status-doc table headers/values (`State`, `Tested`, `done/partial/missing`,
  `yes/no`) — machine-parsed.

## Hard constraints

- The `Req: <ID>` line in the candidate body MUST stay literal — `extractReqIds`
  + dedup parse it. Do not translate `Req:`.
- `itemKind(item)` (dedup classifier by title prefix) must recognize BOTH the new
  Vietnamese prefixes AND the existing English prefixes, so tasks already on the
  board (English titles) still dedup/classify correctly:
  - test: title starts with `Thêm test` OR `Add tests`
  - implement: starts with `Hiện thực ` / `Hoàn thiện ` / `Implement ` / `Complete `
- `Candidate.kind` is set explicitly in `buildCandidates` (not derived from the
  title), so bulk-gen's `requiresShaping` default and the test/implement split are
  unaffected by the title change.

## Testing

- `candidates.test` (update existing assertions): missing → title `Hiện thực <ID>:
  …`, lead `Scan phát hiện: <ID> chưa làm`; partial → `Hoàn thiện <ID>: …`; untested
  → `Thêm test cho <ID>: …`; body has `Tiêu chí chấp nhận:` and still `Req: <ID>`.
- Dedup: a live item with a Vietnamese `Thêm test cho …` title (body has `Req:
  <ID>`) suppresses the matching test candidate; an English `Add tests for …` title
  still suppresses too (back-compat).
- `buildRescanPrompt` mentions writing the Note in Vietnamese.
- Full suite + typecheck stay green.

## Out of scope

- Translating `docs/requirements/` or the requirement statement/AC in the body.
- Localizing the rest of the board UI (already Vietnamese where it matters).
- Re-translating tasks already created (only new scan candidates are affected;
  existing English tasks remain, and dedup still recognizes them).
