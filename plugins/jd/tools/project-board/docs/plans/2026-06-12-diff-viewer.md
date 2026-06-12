# PR-style Diff Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a task's branch diff per-file like a GitHub PR (collapsible files + summary + file list) and add an "⤢ Mở rộng" wide modal — per spec `docs/specs/2026-06-12-diff-viewer-design.md`. UI-only; the diff data already flows from `GET /api/tasks/:id/diff`.

**Architecture:** A pure `parseDiff(raw)` in `ui/src/diff.ts` turns the unified diff into `FileDiff[]`. `DiffView` is rewritten to render per-file collapsible blocks + a summary/file-list, with a `wide` prop for sidebar layout. A new `DiffModal` wraps `<DiffView wide>` in a ~90vw overlay; `TaskDrawer` gains the trigger.

**Tech Stack:** existing React 19/Tailwind 4 (Aurora tokens)/vitest stack. Tests for the pure parser live in `server/src/` (vitest only scans `server/src/**`) importing the UI module.

**Repo:** all in `/home/gamesync/source/jd-claude-skill`, branch `diff-viewer`, tool dir `plugins/jd/tools/project-board`.

---

## File structure

```
ui/src/diff.ts                          # + FileDiff/DiffLine types + parseDiff (keep classifyDiffLine)
server/src/diff.test.ts                 # + parseDiff tests (imports ../../ui/src/diff.js)
ui/src/components/DiffView.tsx          # rewritten: per-file blocks + summary + file list + wide prop
ui/src/components/DiffModal.tsx          # NEW wide overlay wrapping <DiffView wide>
ui/src/components/TaskDrawer.tsx        # "⤢ Mở rộng" button opens DiffModal
```

---

### Task 1: parseDiff parser (TDD)

**Files:** Modify `ui/src/diff.ts`; Test: `server/src/diff.test.ts`.

- [ ] **Step 1: Branch + types.** `cd /home/gamesync/source/jd-claude-skill && git checkout -b diff-viewer`. In `ui/src/diff.ts`, keep `DiffLineKind` + `classifyDiffLine`, and add:

```ts
export interface DiffLine { kind: DiffLineKind | 'meta'; text: string }

export interface FileDiff {
  path: string
  oldPath?: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'binary'
  additions: number
  deletions: number
  lines: DiffLine[]
}
```

- [ ] **Step 2: Failing tests** — append to `server/src/diff.test.ts` (read its top imports; add `parseDiff` to the import from `../../ui/src/diff.js`):

```ts
describe('parseDiff', () => {
  it('returns [] for empty input', () => {
    expect(parseDiff('')).toEqual([])
    expect(parseDiff('   \n')).toEqual([])
  })

  it('splits a multi-file diff and counts +/- (excluding ---/+++ headers)', () => {
    const raw = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 111..222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,2 @@',
      ' ctx',
      '-old',
      '+new',
      'diff --git a/src/b.ts b/src/b.ts',
      'index 333..444 100644',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -0,0 +1 @@',
      '+added',
    ].join('\n')
    const files = parseDiff(raw)
    expect(files).toHaveLength(2)
    expect(files[0]).toMatchObject({ path: 'src/a.ts', status: 'modified', additions: 1, deletions: 1 })
    expect(files[1]).toMatchObject({ path: 'src/b.ts', additions: 1, deletions: 0 })
    // plumbing excluded; hunk + body kept
    expect(files[0].lines.some((l) => l.kind === 'hunk')).toBe(true)
    expect(files[0].lines.some((l) => l.text.startsWith('diff --git'))).toBe(false)
    expect(files[0].lines.some((l) => l.text.startsWith('+++'))).toBe(false)
  })

  it('detects added (new file mode + /dev/null)', () => {
    const raw = ['diff --git a/n.ts b/n.ts', 'new file mode 100644', 'index 0000..111', '--- /dev/null', '+++ b/n.ts', '@@ -0,0 +1 @@', '+hi'].join('\n')
    expect(parseDiff(raw)[0]).toMatchObject({ path: 'n.ts', status: 'added', additions: 1 })
  })

  it('detects deleted', () => {
    const raw = ['diff --git a/d.ts b/d.ts', 'deleted file mode 100644', 'index 111..0000', '--- a/d.ts', '+++ /dev/null', '@@ -1 +0,0 @@', '-bye'].join('\n')
    expect(parseDiff(raw)[0]).toMatchObject({ path: 'd.ts', status: 'deleted', deletions: 1 })
  })

  it('detects renamed with oldPath', () => {
    const raw = ['diff --git a/old.ts b/new.ts', 'similarity index 100%', 'rename from old.ts', 'rename to new.ts'].join('\n')
    expect(parseDiff(raw)[0]).toMatchObject({ path: 'new.ts', oldPath: 'old.ts', status: 'renamed' })
  })

  it('detects binary', () => {
    const raw = ['diff --git a/img.png b/img.png', 'index 111..222 100644', 'Binary files a/img.png and b/img.png differ'].join('\n')
    expect(parseDiff(raw)[0]).toMatchObject({ path: 'img.png', status: 'binary' })
  })
})
```

- [ ] **Step 3:** `cd plugins/jd/tools/project-board && npx vitest run server/src/diff.test.ts` — FAIL.

- [ ] **Step 4: Implement `parseDiff` in `ui/src/diff.ts`:**

```ts
export function parseDiff(raw: string): FileDiff[] {
  if (!raw.trim()) return []
  const files: FileDiff[] = []
  let cur: FileDiff | null = null
  const flush = () => { if (cur) files.push(cur) }
  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flush()
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/)
      const newPath = m?.[2] ?? m?.[1] ?? ''
      cur = { path: newPath, status: 'modified', additions: 0, deletions: 0, lines: [] }
      continue
    }
    if (!cur) continue
    if (line.startsWith('new file mode')) { cur.status = 'added'; continue }
    if (line.startsWith('deleted file mode')) { cur.status = 'deleted'; continue }
    if (line.startsWith('rename from ')) { cur.oldPath = line.slice(12); cur.status = 'renamed'; continue }
    if (line.startsWith('rename to ')) { cur.path = line.slice(10); cur.status = 'renamed'; continue }
    if (line.startsWith('Binary files')) { if (cur.status === 'modified') cur.status = 'binary'; continue }
    // plumbing lines represented by the header — drop them
    if (line.startsWith('index ') || line.startsWith('old mode') || line.startsWith('new mode')
      || line.startsWith('similarity index') || line.startsWith('dissimilarity index')
      || line.startsWith('copy from') || line.startsWith('copy to')) continue
    if (line.startsWith('--- ')) { if (line === '--- /dev/null') cur.status = 'added'; continue }
    if (line.startsWith('+++ ')) { if (line === '+++ /dev/null') cur.status = 'deleted'; continue }
    if (line.startsWith('@@')) { cur.lines.push({ kind: 'hunk', text: line }); continue }
    if (line.startsWith('+')) { cur.additions++; cur.lines.push({ kind: 'add', text: line }); continue }
    if (line.startsWith('-')) { cur.deletions++; cur.lines.push({ kind: 'del', text: line }); continue }
    cur.lines.push({ kind: 'ctx', text: line })
  }
  flush()
  return files
}
```

- [ ] **Step 5:** `npx vitest run` (full suite — prior 215 + new green). `npm run typecheck` clean.

- [ ] **Step 6: Commit.**
```bash
git add ui/src/diff.ts server/src/diff.test.ts
git commit -m "feat(board): parseDiff — group unified diff into per-file FileDiff[]"
```

---

### Task 2: DiffView rewrite + DiffModal + TaskDrawer trigger

**Files:** Rewrite `ui/src/components/DiffView.tsx`; Create `ui/src/components/DiffModal.tsx`; Modify `ui/src/components/TaskDrawer.tsx`.

- [ ] **Step 1: Verify tokens.** Read `ui/src/index.css` `@theme`: confirm `text-diff-add`/`text-diff-del`/`text-diff-hunk`/`text-diff-ctx`, `bg-surface`/`bg-sunken`/`bg-raised`/`bg-base`, `border-border`, `text-text-primary/secondary/muted`, `text-ok`, `text-danger`, `text-accent` exist. Substitute real names if any differ. NO raw palette classes (grep-gate).

- [ ] **Step 2: Rewrite `ui/src/components/DiffView.tsx`:**

```tsx
import { useMemo, useRef, useState } from 'react'
import { classifyDiffLine, parseDiff, type DiffLine, type FileDiff } from '../diff.js'

const LINE_CLASS: Record<string, string> = {
  add: 'text-diff-add', del: 'text-diff-del', hunk: 'text-diff-hunk', ctx: 'text-diff-ctx', meta: 'text-text-muted',
}
const STATUS_CLASS: Record<FileDiff['status'], string> = {
  added: 'text-ok', modified: 'text-accent', deleted: 'text-danger', renamed: 'text-accent', binary: 'text-text-muted',
}
const STATUS_LABEL: Record<FileDiff['status'], string> = {
  added: 'thêm', modified: 'sửa', deleted: 'xóa', renamed: 'đổi tên', binary: 'binary',
}

function FileBlock({ file, collapsed, onToggle, anchorRef }: {
  file: FileDiff; collapsed: boolean; onToggle: () => void; anchorRef: (el: HTMLDivElement | null) => void
}) {
  return (
    <div ref={anchorRef} className="rounded-lg border border-border bg-sunken">
      <button onClick={onToggle}
        className="sticky top-0 z-10 flex w-full items-center gap-2 rounded-t-lg border-b border-border bg-raised px-3 py-1.5 text-left text-xs">
        <span className="text-text-muted">{collapsed ? '▸' : '▾'}</span>
        <span className={`font-mono uppercase ${STATUS_CLASS[file.status]}`}>{STATUS_LABEL[file.status]}</span>
        <span className="flex-1 truncate font-mono text-text-primary" title={file.path}>
          {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        </span>
        <span className="font-mono text-diff-add">+{file.additions}</span>
        <span className="font-mono text-diff-del">−{file.deletions}</span>
      </button>
      {!collapsed && (
        <pre className="overflow-x-auto px-3 py-2 font-mono text-[11.5px] leading-[1.55]">
          {file.lines.length === 0
            ? <div className="text-text-muted">{file.status === 'binary' ? '(binary)' : '(không có thay đổi nội dung)'}</div>
            : file.lines.map((l: DiffLine, i) => <div key={i} className={LINE_CLASS[l.kind]}>{l.text || ' '}</div>)}
        </pre>
      )}
    </div>
  )
}

export function DiffView({ diff, wide = false }: { diff: string; wide?: boolean }) {
  const files = useMemo(() => parseDiff(diff), [diff])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const refs = useRef<Record<string, HTMLDivElement | null>>({})

  if (files.length === 0) return <p className="text-sm text-text-muted">(diff trống)</p>

  const adds = files.reduce((s, f) => s + f.additions, 0)
  const dels = files.reduce((s, f) => s + f.deletions, 0)
  const allCollapsed = collapsed.size === files.length
  const toggle = (p: string) => setCollapsed((c) => { const n = new Set(c); n.has(p) ? n.delete(p) : n.add(p); return n })
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(files.map((f) => f.path)))
  const jump = (p: string) => { setCollapsed((c) => { const n = new Set(c); n.delete(p); return n }); refs.current[p]?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

  const summary = (
    <div className={wide ? 'shrink-0 overflow-y-auto pr-2' : ''}>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-text-secondary">{files.length} file · <span className="text-diff-add">+{adds}</span> <span className="text-diff-del">−{dels}</span></span>
        <button onClick={toggleAll} className="rounded border border-border px-2 py-0.5 text-text-secondary transition-colors duration-150 hover:bg-raised">{allCollapsed ? 'Mở tất cả' : 'Gập tất cả'}</button>
      </div>
      <ul className="space-y-0.5 text-xs">
        {files.map((f) => (
          <li key={f.path}>
            <button onClick={() => jump(f.path)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors duration-150 hover:bg-raised">
              <span className={`font-mono text-[9px] uppercase ${STATUS_CLASS[f.status]}`}>●</span>
              <span className="flex-1 truncate font-mono text-text-secondary" title={f.path}>{f.path}</span>
              <span className="font-mono text-diff-add">+{f.additions}</span>
              <span className="font-mono text-diff-del">−{f.deletions}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  const blocks = (
    <div className={`space-y-3 ${wide ? 'min-w-0 flex-1 overflow-y-auto' : ''}`}>
      {files.map((f) => (
        <FileBlock key={f.path} file={f} collapsed={collapsed.has(f.path)} onToggle={() => toggle(f.path)} anchorRef={(el) => { refs.current[f.path] = el }} />
      ))}
    </div>
  )

  if (wide) return <div className="flex h-full gap-4"><div className="w-64 shrink-0">{summary}</div>{blocks}</div>
  return <div className="max-h-96 overflow-y-auto">{summary}{blocks}</div>
}
```

(Adjust token class names to the real ones from Step 1. The non-wide view keeps the bounded `max-h-96` scroll used today.)

- [ ] **Step 3: Create `ui/src/components/DiffModal.tsx`:**

```tsx
import { useEffect } from 'react'
import { DiffView } from './DiffView.js'

export function DiffModal({ id, diff, onClose }: { id: string; diff: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(8,13,20,.7)] p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="flex h-[90vh] w-[90vw] max-w-[1400px] flex-col rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h3 className="font-mono text-xs text-text-secondary">Diff · {id}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>
        <div className="min-h-0 flex-1 p-4"><DiffView diff={diff} wide /></div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire the trigger in `ui/src/components/TaskDrawer.tsx`.** Add `import { DiffModal } from './DiffModal.js'`, a state `const [diffOpen, setDiffOpen] = useState(false)`, and where the diff currently renders (the `{diff !== null && (...)}` block with the `Diff (main…board/{item.id})` heading), add an "⤢ Mở rộng" button next to the heading that calls `setDiffOpen(true)`; keep the inline `<DiffView diff={diff} />` below it. At the end of the component (before the closing tags), render the modal:

```tsx
        {diff !== null && (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-text-muted">Diff (main…board/{item.id})</h3>
              <button onClick={() => setDiffOpen(true)}
                className="rounded border border-border px-2 py-0.5 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised">⤢ Mở rộng</button>
            </div>
            <DiffView diff={diff} />
          </>
        )}
```
and near the other top-level overlays:
```tsx
      {diffOpen && diff && <DiffModal id={item.id} diff={diff} onClose={() => setDiffOpen(false)} />}
```
(Read the file to place the modal inside the component's returned tree — it can sit as a sibling at the end, before the outermost closing `</div>`. Match the existing `act()`/state patterns.)

- [ ] **Step 5: Gates.** From the tool dir: `npm run typecheck` clean; `npx vite build ui` succeeds; `npx vitest run` green; grep-gate clean:
```bash
grep -rnE '(zinc|cyan|red|green|orange|rose|amber|slate|gray|neutral|stone|emerald|teal|sky|blue|indigo|violet|purple|fuchsia|pink|lime|yellow)-[0-9]' ui/src && echo GREP-DIRTY || echo GREP-CLEAN
```

- [ ] **Step 6: Commit.**
```bash
git add ui/src/components/DiffView.tsx ui/src/components/DiffModal.tsx ui/src/components/TaskDrawer.tsx
git commit -m "feat(board-ui): per-file collapsible diff + file list + wide expand modal"
```

---

### Task 3: deploy 0.24.0 + prove

- [ ] **Step 1: Gates.** `npm run typecheck && npx vite build ui && npx vitest run` + grep-gate clean.
- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` → `0.24.0`; commit `chore(jd): bump plugin to 0.24.0 (diff viewer)`. Then `git checkout main && git merge --no-ff diff-viewer && git branch -d diff-viewer && git push origin main`.
- [ ] **Step 3: Build dist + restart — ONLY when no jobs running** (check `curl /api/board` for running/queued; this is UI-only but a restart still interrupts running jobs). Rebuild + relaunch `BOARD_REPO_ROOT=/home/gamesync/source/gamesync BOARD_PORT=4400 BOARD_HOST=0.0.0.0 nohup node dist/server/src/index.js > project-board/board.log 2>&1 &`.
- [ ] **Step 4: Prove.** Open a task in `review` (e.g. TASK-057/058/065 if still in review) in the drawer: the diff shows per-file collapsible blocks + a summary/file list; "⤢ Mở rộng" opens the wide modal with the file list as a left sidebar; Esc/✕/backdrop close it. If no review task exists, note that the viewer renders on the next review task.

---

## Self-review notes

- Spec coverage: per-file grouping + summary + file list + collapse (T2 DiffView), wide expand modal with left-sidebar file list (T2 DiffModal + `wide`), parser with status/counts/plumbing-exclusion (T1), server unchanged, deploy (T3).
- Type consistency: `FileDiff`/`DiffLine` defined in `ui/src/diff.ts`, produced by `parseDiff`, consumed by `DiffView`/`FileBlock`/`DiffModal`. `classifyDiffLine` retained (re-used conceptually; `parseDiff` assigns kinds directly).
- Tests: pure `parseDiff` tested from `server/src/diff.test.ts` (vitest scans `server/src/**` only) — covers added/deleted/renamed/modified/binary + count exclusions + empty. UI not unit-tested (typecheck/vite/grep + manual).
- Tokens-only; reuse `--color-diff-*`; status colors from existing semantic tokens. Non-wide view keeps a bounded scroll; wide modal is 90vw×90vh.
- Safety: UI-only, no server/route/runner change; restart guarded on no-running-jobs.
