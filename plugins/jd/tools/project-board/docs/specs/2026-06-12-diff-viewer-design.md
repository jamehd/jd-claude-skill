# PR-style Diff Viewer — Design Spec

Date: 2026-06-12
Status: approved (brainstorm session with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board` (board tool feature).

## Purpose

A task in `review` shows its branch diff (`git diff main...board/<id>`) as one long
single-`<pre>` block in the ~34rem TaskDrawer — hard to read and cramped. The owner
wants to review changes per-file like a GitHub PR (so they don't have to open a real
PR) and to expand the view to a wide window for detail. This is a UI-only change;
the diff data already flows from `GET /api/tasks/:id/diff`.

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Grouping | Parse the unified diff into per-file sections (PR-style), each a collapsible block with a header (path, status, +N/−N). A summary bar lists all files (click to jump/expand). |
| Detail / width | An "⤢ Mở rộng" button opens the same diff in a wide modal (~90vw × 90vh). When wide, the file list becomes a sticky left sidebar; the diff fills the rest. The compact in-drawer view stacks the summary on top. |
| Server | Unchanged. `branchDiff` still returns the full `git diff main...board/<id>`; all grouping is client-side. |
| Default expand | Files expanded by default; per-file collapse + a global "Gập/Mở tất cả" toggle. |
| Out of scope | Side-by-side/split view, syntax highlighting, line comments. |

## Parser — `ui/src/diff.ts`

Extend the existing module (keeps `classifyDiffLine`). Add `parseDiff(raw: string): FileDiff[]`:

```ts
export interface DiffLine { kind: DiffLineKind | 'meta'; text: string }
export interface FileDiff {
  path: string          // new path (or old path for a delete)
  oldPath?: string      // set when renamed
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'binary'
  additions: number
  deletions: number
  lines: DiffLine[]     // the body lines to render (hunks + ctx + add/del); excludes the `diff --git`/index/`---`/`+++` plumbing
}
```

Parsing rules:
- Split into file sections on each `diff --git a/<old> b/<new>` line.
- `path`/`oldPath` from the `diff --git` paths; refine from `--- a/…` / `+++ b/…` when present (`/dev/null` → added/deleted).
- `status`: `new file mode` → added; `deleted file mode` → deleted; `rename from`/`rename to` → renamed (set `oldPath`); a `Binary files … differ` line → binary; else modified.
- `additions` = count of body lines starting with `+` (excluding the `+++` header); `deletions` = lines starting with `-` (excluding `---`).
- `lines`: keep `@@` hunk headers (kind `hunk`), context (`ctx`), `+`/`-` (`add`/`del`); drop the `diff --git`, `index`, `mode`, `rename`, `---`, `+++` plumbing lines (they’re represented by the header). For binary files, `lines` is empty.
- Robust to an empty/whitespace diff → `[]`.

This is pure + unit-testable.

## Components

### `DiffView` (`ui/src/components/DiffView.tsx`) — rewritten
Props: `{ diff: string; wide?: boolean }`.
- Parses via `parseDiff`. Empty → "(diff trống)".
- **Summary bar:** `{N} file · +{Σadd} −{Σdel}` and a **file list** — each row: a status marker (added/modified/deleted/renamed/binary, tokenized color), the path, and `+N/−N`. Clicking a row scrolls its file block into view and ensures it is expanded. A **"Gập/Mở tất cả"** toggle.
- **Per-file block:** a sticky header (status label + path + `+N/−N` + a chevron) that toggles collapse; body renders `lines` with the existing `classifyDiffLine`→`text-diff-*` coloring (in a horizontally-scrollable mono `<pre>`-like container). Collapsed → header only.
- **Layout:** when `wide`, render the file list as a sticky **left sidebar** (e.g. `w-64`) with the file blocks in a scrollable right pane; when not `wide` (in-drawer), stack the summary/file-list on top of the blocks. A single `wide` flag switches the flex direction / sidebar.
- Per-file expand state held in local component state (a `Set<path>` of collapsed paths, or expanded-by-default map).

### `DiffModal` (`ui/src/components/DiffModal.tsx`) — new
- A full-screen overlay (`fixed inset-0`, dim backdrop) centering a panel `~90vw max-w-[1400px] h-[90vh]`, with a header (title `Diff · {id}` + ✕) and a scrollable body rendering `<DiffView diff={diff} wide />`.
- Closes on ✕, `Esc`, and backdrop click (mirror `TaskDrawer`'s overlay pattern). Tokens-only.

### `TaskDrawer` (`ui/src/components/TaskDrawer.tsx`) — wire the trigger
- The existing review-state diff section keeps the compact `<DiffView diff={diff} />` and gains an **"⤢ Mở rộng"** button that opens `DiffModal` (local `useState` `diffOpen`). The modal renders over the drawer.

### Tokens
- Reuse `--color-diff-add/del/hunk/ctx`. Add status-marker tokens only if needed — prefer existing semantic tokens (`text-ok` for added, `text-danger` for deleted, `text-accent`/`text-shape` for modified/renamed, `text-text-muted` for binary). No raw palette classes (grep-gate).

## Error / edge handling

- Whitespace-only / empty diff → "(diff trống)".
- A file with no hunks (pure rename / mode change / binary) → header only, no body, +0/−0 (or "Binary file" note).
- Very large diffs: all-expanded by default but each file collapsible + "Gập tất cả"; the body containers scroll independently so the page stays usable. (No virtualization — out of scope.)
- Malformed lines that don't match any rule → treated as context (`ctx`), never throw.

## Testing

- `diff.ts` (vitest): `parseDiff` on a multi-file unified diff returns one `FileDiff`
  per file with correct `path`, `status` (added via `new file mode` + `--- /dev/null`,
  deleted, renamed via `rename from/to`, modified, binary via `Binary files`),
  and correct `additions`/`deletions` counts; `+++`/`---` headers are NOT counted;
  plumbing lines are excluded from `lines`; empty input → `[]`. Keep existing
  `classifyDiffLine` tests.
- UI (`DiffView`/`DiffModal`): not unit-tested beyond the parser; typecheck +
  `vite build ui` + grep-gate green; manual check that per-file collapse, the file
  list jump, and the expand modal work in the drawer review view.
- Full suite + typecheck stay green.

## Out of scope

- Side-by-side / split diff, syntax highlighting, inline comments.
- Server-side diff parsing or a structured diff API (kept client-side).
- Diff for non-review states (the diff is only fetched in `review`, as today).
