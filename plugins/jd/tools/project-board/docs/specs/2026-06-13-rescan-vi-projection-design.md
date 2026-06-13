# Re-scan Vietnamese Projection — Design Spec

Date: 2026-06-13
Status: approved (brainstorm with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board`.

## Purpose

Scan-generated tasks must be fully Vietnamese AND stay synchronized with the
English requirement spec — without translating the spec source or adding a
non-deterministic per-candidate translation. Make **Re-scan the single localizer**:
`docs/requirements/` stays canonical English; the Re-scan AI (which already reads
those docs to judge status) additionally writes a Vietnamese rendering of each
requirement's statement + acceptance criteria into the status doc; `buildCandidates`
reads the Vietnamese from the status doc. One Re-scan re-derives the whole Vietnamese
board projection from the English spec — one-directional, never hand-drifts.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Spec source | `docs/requirements/` stays English (canonical, convention-compliant, tooling/AI-read). Not translated. |
| VN source | The status doc (`project-board/data/status/<c>.md`, board data, gitignored) carries the Vietnamese statement + AC per requirement, written by Re-scan. |
| Candidate body | `buildCandidates` uses the status-doc Vietnamese statement/AC; **falls back to the English `reqIndex`** when a requirement has no VN entry yet (pre-re-scan / back-compat). |
| Title | The requirement title in the task title stays English as a stable label (e.g. `Thêm test cho DL-R16: Build and runtime integrity`) — matches the 75 already-translated tasks; no re-touch. Body is fully Vietnamese. |
| Sync | Run **Re-scan** → status docs gain VN statement/AC → new candidates fully Vietnamese. The existing English-table (State/Tested) + frontmatter (built/tested %) are unchanged, so the two-axis status is unaffected. |

## Status doc format (added section)

Keep the existing frontmatter + `| Req | State | Tested | Note |` table + `## Drift`.
Append a Vietnamese detail section the parser reads:

```
## Chi tiết (Tiếng Việt)

### CAFE-R4
Mô tả: <requirement statement, dịch sang tiếng Việt>
Tiêu chí chấp nhận:
- <AC 1 tiếng Việt>
- <AC 2 tiếng Việt>

### CAFE-R9
Mô tả: …
Tiêu chí chấp nhận:
- …
```

(Code references / identifiers inside the Vietnamese text stay as-is, like the Note
column already does.)

## Changes

1. **`buildRescanPrompt` (prompt.ts):** after the existing table/Drift/rules,
   instruct the AI to also write the `## Chi tiết (Tiếng Việt)` section — one
   `### <ID>` block per requirement in the doc, with `Mô tả:` (Vietnamese statement)
   and `Tiêu chí chấp nhận:` (Vietnamese AC bullets), translating from the English
   requirement doc. Keep code tokens/paths/identifiers unchanged. (The existing
   "Note column in Vietnamese" rule stays.)

2. **`parseStatusDoc` (candidates.ts):** in addition to `rows`, parse the
   `## Chi tiết (Tiếng Việt)` section into
   `details?: Record<string, { statement: string; acceptance: string[] }>` keyed by
   `### <ID>` — `Mô tả:` → statement; bullets after `Tiêu chí chấp nhận:` →
   acceptance (until the next `###` or EOF). Robust to the section being absent.

3. **`buildCandidates` (candidates.ts):** the `body()` helper takes the VN detail
   (from `doc.details?.[row.id]`) plus the English `req` as fallback:
   `statement = detail?.statement || req?.statement`;
   `acceptance = detail?.acceptance?.length ? detail.acceptance : (req?.acceptance ?? [])`.
   The lead (`Scan phát hiện: …` + Note) and label (`Tiêu chí chấp nhận:`) and title
   (`<VN prefix> <ID>: <req.title>`) are unchanged. `Req: <ID>` stays literal.

## Testing

- `parseStatusDoc` (candidates.test): parses a `## Chi tiết (Tiếng Việt)` section into
  `details` (statement + AC per ID); a doc without the section → `details` undefined
  / empty, `rows` unchanged.
- `buildCandidates`: when the doc has a VN detail for a req, the candidate body uses
  the Vietnamese statement/AC; when absent, falls back to the English `reqIndex`
  statement/AC (back-compat). `Req: <ID>` + title unchanged either way.
- `buildRescanPrompt` (prompt.test): output instructs the `## Chi tiết (Tiếng Việt)`
  section with `Mô tả:` + `Tiêu chí chấp nhận:` in Vietnamese.
- Full suite + typecheck stay green.

## Out of scope

- Translating `docs/requirements/` or the requirement title.
- Re-translating the 75 existing tasks (already Vietnamese; titles keep English
  req-title labels — consistent with new tasks).
- A non-AI / per-candidate live translation (Re-scan is the batched localizer).
- Two-axis status changes (unchanged; reads frontmatter + table).
