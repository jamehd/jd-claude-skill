# Project Board Aurora Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Aurora design system (`DESIGN_SYSTEM.md`) to the entire Project Board UI — token foundation, packaged fonts, colored diff rendering, and component polish.

**Architecture:** All work in the jd repo (`/home/gamesync/source/jd-claude-skill`, branch `theme-aurora`), tool dir `plugins/jd/tools/project-board`. Semantic tokens land in `ui/src/index.css` via Tailwind 4 `@theme`; components are restyled to consume ONLY those tokens per the recipes in `DESIGN_SYSTEM.md` (same dir — the single source of truth; read it before each task). Server code untouched.

**Tech Stack:** Tailwind 4 `@theme` CSS variables, `@fontsource-variable/inter`, `@fontsource/jetbrains-mono`, React 19.

**Authority:** `plugins/jd/tools/project-board/DESIGN_SYSTEM.md` overrides this plan on any visual detail. Components must not hardcode colors/fonts/radii.

---

### Task 1: Token foundation + packaged fonts

**Files:**
- Modify: `plugins/jd/tools/project-board/package.json` (deps)
- Modify: `plugins/jd/tools/project-board/ui/src/index.css`
- Modify: `plugins/jd/tools/project-board/ui/src/main.tsx` (font imports)
- Modify: `plugins/jd/tools/project-board/ui/index.html` (drop Tailwind utility colors from body tag)

- [ ] **Step 1:** `npm install @fontsource-variable/inter @fontsource/jetbrains-mono` in the tool dir.

- [ ] **Step 2:** Replace `ui/src/index.css` with the token foundation:

```css
@import "tailwindcss";

@theme {
  --font-sans: "Inter Variable", Inter, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --color-base: #0b1018;
  --color-surface: #121a26;
  --color-raised: #1a2433;
  --color-sunken: #080d14;
  --color-border: #1c2738;
  --color-border-strong: #2b3a52;
  --color-text-primary: #e3ebf5;
  --color-text-secondary: #8fa3b8;
  --color-text-muted: #5d7290;

  --color-accent: #43d9e8;
  --color-accent-soft: #0d2b33;
  --color-accent-border: #155e6b;
  --color-accent-strong: #0d96a8;
  --color-accent-deep: #0e7490;

  --color-ready: #e8b54f;
  --color-ready-bg: #241c0e;
  --color-ready-border: #4a3a1a;
  --color-running: #43d9e8;
  --color-running-bg: #0d2b33;
  --color-running-border: #155e6b;
  --color-ok: #56c98e;
  --color-ok-bg: #0e2418;
  --color-ok-border: #1d4a30;
  --color-danger: #e87a7a;
  --color-danger-bg: #2b1212;
  --color-danger-border: #552222;

  --color-diff-add: #56c98e;
  --color-diff-del: #e8754f;
  --color-diff-hunk: #7f93a8;
  --color-diff-ctx: #aebccb;
}

body {
  background: var(--color-base);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.65;
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-strong) transparent;
}
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-thumb { background: var(--color-border-strong); border-radius: 4px; }
*::-webkit-scrollbar-track { background: transparent; }
```

(`backlog` reuses `text-secondary`/`surface`/`border`; `done` reuses the `ok` triple; priorities reuse danger/ready/secondary/muted per DESIGN_SYSTEM — no extra tokens.)

- [ ] **Step 3:** In `ui/src/main.tsx` add font imports ABOVE `./index.css`:

```ts
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
```

- [ ] **Step 4:** In `ui/index.html` change `<body class="bg-zinc-950 text-zinc-100">` to `<body>` (body styling now comes from index.css).

- [ ] **Step 5:** Verify: `npm run typecheck && npx vite build ui` — clean; built CSS contains `--color-base` and woff2 assets are emitted.

- [ ] **Step 6:** Commit: `git add -A && git commit -m "feat(board-ui): aurora token foundation and packaged fonts"`

---

### Task 2: Diff line classifier + DiffView component (TDD)

**Files:**
- Create: `plugins/jd/tools/project-board/ui/src/diff.ts`
- Create: `plugins/jd/tools/project-board/server/src/diff.test.ts` (vitest include is `server/src/**` — test imports from `../../ui/src/diff.js`)
- Create: `plugins/jd/tools/project-board/ui/src/components/DiffView.tsx`

- [ ] **Step 1:** Write failing tests:

```ts
import { describe, it, expect } from 'vitest'
import { classifyDiffLine } from '../../ui/src/diff.js'

describe('classifyDiffLine', () => {
  it('classifies adds and dels', () => {
    expect(classifyDiffLine('+new line')).toBe('add')
    expect(classifyDiffLine('-old line')).toBe('del')
  })
  it('classifies headers as hunk (before single-char rules)', () => {
    expect(classifyDiffLine('@@ -1,4 +1,6 @@')).toBe('hunk')
    expect(classifyDiffLine('diff --git a/x b/x')).toBe('hunk')
    expect(classifyDiffLine('index 0000..1111 100644')).toBe('hunk')
    expect(classifyDiffLine('+++ b/file.ts')).toBe('hunk')
    expect(classifyDiffLine('--- a/file.ts')).toBe('hunk')
  })
  it('everything else is context', () => {
    expect(classifyDiffLine(' unchanged')).toBe('ctx')
    expect(classifyDiffLine('')).toBe('ctx')
  })
})
```

- [ ] **Step 2:** Run — FAIL (module missing). Implement `ui/src/diff.ts`:

```ts
export type DiffLineKind = 'add' | 'del' | 'hunk' | 'ctx'

export function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')
    || line.startsWith('diff --git') || line.startsWith('index ')) return 'hunk'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'ctx'
}
```

- [ ] **Step 3:** `ui/src/components/DiffView.tsx`:

```tsx
import { classifyDiffLine, type DiffLineKind } from '../diff.js'

const KIND_CLASS: Record<DiffLineKind, string> = {
  add: 'text-diff-add',
  del: 'text-diff-del',
  hunk: 'text-diff-hunk',
  ctx: 'text-diff-ctx',
}

export function DiffView({ diff }: { diff: string }) {
  if (!diff.trim()) return <p className="text-sm text-text-muted">(diff trống)</p>
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-sunken p-3 font-mono text-[11.5px] leading-[1.55]">
      {diff.split('\n').map((line, i) => (
        <div key={i} className={KIND_CLASS[classifyDiffLine(line)]}>{line || ' '}</div>
      ))}
    </pre>
  )
}
```

- [ ] **Step 4:** Run full suite (62 + 3 new = 65) + typecheck. Commit: `feat(board-ui): colored diff rendering`

---

### Task 3: Restyle all components per DESIGN_SYSTEM recipes

**Files (all under `plugins/jd/tools/project-board/ui/src/`):**
- Modify: `App.tsx`, `components/Login.tsx`, `components/KpiStrip.tsx`, `components/ComponentsPanel.tsx`, `components/Kanban.tsx`, `components/QuickAdd.tsx`, `components/TaskDrawer.tsx`, `components/ActivityPanel.tsx`

Read `DESIGN_SYSTEM.md` first; it is authoritative. Replace every `zinc-*`/`cyan-*`/`red-*`/`green-*`/`orange-*` utility with token-based utilities (Tailwind 4 exposes `@theme` colors as classes: `bg-surface`, `text-text-secondary`, `border-border`, `text-danger`, etc.).

- [ ] **Step 1: shared maps.** In `Kanban.tsx` and wherever statuses render, build the status fg/bg/border classes from the token triples (backlog→secondary/surface/border, ready→ready triple, ai_running→running triple, review+done→ok triple). Priority colors: P0 `text-danger`, P1 `text-ready`, P2 `text-text-secondary`, P3 `text-text-muted`.

- [ ] **Step 2: per-component checklist** (each per its DESIGN_SYSTEM recipe):
  - KpiStrip: surface cards radius-10, mono 24px numbers (`font-mono text-2xl font-semibold`), overall-% number in `text-accent`, labels uppercase 10px `text-text-muted` tracking-wider.
  - ComponentsPanel: uppercase section label; progress bar track `bg-raised`, fill `bg-accent`; Re-scan as secondary button recipe; rows hover→raised.
  - Kanban: columns `bg-sunken rounded-[10px]`; cards = kanban-card recipe incl. 2px left status edge (`border-l-2` + status border class) and hover raise; ai_running column header gets `◉` in `text-accent`; counts in header.
  - QuickAdd + Login: modal recipe — backdrop `bg-[rgba(8,13,20,.7)]`, panel surface, inputs sunken with focus `focus:border-accent`; primary submit = gradient button recipe.
  - TaskDrawer: title row = mono ID + status pill recipe + Inter 600 18px title; body prose `text-[14px] leading-[1.65] text-text-primary` (render in a plain div, keep whitespace-pre-wrap); ⚡ button = primary gradient + glow (`shadow-[0_0_18px_rgba(67,217,232,.18)]` or a small CSS class in index.css); Merge = ok-tinted secondary; Tạo PR = secondary; Hủy bỏ = destructive secondary; replace the diff `<pre>` with `<DiffView diff={diff}/>`.
  - ActivityPanel: entries = surface cards; running entry `border-running-border` + glow; state badge = pill recipe per state (queued/cancelled muted, running accent, succeeded ok, failed/interrupted danger/ready); log tail = sunken well, mono 11.5px; RescanReview buttons follow button recipes; cancel button destructive secondary.
  - App shell: KPI row + "⊕ Thêm task / bug" primary button recipe; invalid tray = danger triple strip; empty states (`Chưa có job nào`, `Chưa có dữ liệu trạng thái`) centered `text-text-muted`.
  - Transitions: `transition-colors duration-150` on interactive elements; drawer `transition-transform duration-200` if trivial, else skip animation (no overshoot).

- [ ] **Step 3:** Grep-gate: `grep -rnE '(zinc|cyan|red|green|orange|rose)-[0-9]' ui/src` returns NOTHING (raw palette classes eliminated; arbitrary rgba values for backdrop/glow are allowed).

- [ ] **Step 4:** `npm run typecheck && npx vite build ui && npx vitest run` (65) — green. Commit: `feat(board-ui): apply aurora design system to all components`

---

### Task 4: Verify, version, deploy

- [ ] **Step 1:** Full verification in tool dir: typecheck, vite build, vitest (65).
- [ ] **Step 2:** Bump `plugins/jd/.claude-plugin/plugin.json` version → `0.12.0`. Commit `chore(jd): bump plugin to 0.12.0 (aurora theme)`.
- [ ] **Step 3:** Merge `theme-aurora` → `main` in the jd repo (ff or merge commit), push origin main.
- [ ] **Step 4:** Restart the gamesync board server (kill the nohup process on :4400, start again same env per the skill's step 5 — NEW generated password) and verify login + UI serves the new CSS (curl the built asset hash differs / fonts woff2 served).
- [ ] **Step 5:** Report URL + new password to the owner.

---

## Self-review notes

- Spec coverage: tokens+fonts (T1), diff coloring with the exact classifier ordering from DESIGN_SYSTEM (T2), all 8 components incl. empty states/invalid tray/scrollbars/transitions (T1+T3), offline fonts (T1), version+deploy (T4).
- Tailwind 4 nuance: `@theme` color names containing `text-` (e.g. `--color-text-primary`) yield classes like `text-text-primary` — intended; grep-gate covers regressions.
- DiffView lives in ui but its pure logic is tested from server/src per the existing vitest include glob — matches the tsconfig.ui/typecheck split (diff.ts has no DOM deps).
