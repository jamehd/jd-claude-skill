# Project Board Design System — "Aurora"

Canonical visual standard for the Project Board UI. Every UI change MUST comply
with this document; when adding a component, compose it from the tokens and
recipes below — never hardcode colors, fonts, or radii in components.

Decided 2026-06-11 with jamehd (brainstorm: futuristic look that stays
comfortable through hours of reading; text and color quality first).

## Principles

1. **Read-first.** The board is read for hours: task bodies, diffs, logs.
   Reading comfort beats visual punch wherever they conflict.
2. **Futuristic, quietly.** The "aurora" feel comes from a cold graphite-blue
   canvas and sparse ice-cyan light — accents cover **under 10% of any screen**.
3. **No absolutes.** Never pure black backgrounds (`#000`) or pure white text
   (`#fff`); both create harsh contrast that fatigues eyes on dark UIs.
4. **Mono is a marker.** JetBrains Mono marks machine artifacts only — IDs, KPI
   numbers, status pills, logs, diffs. Human prose is always Inter.
5. **Tokens only.** Components reference semantic CSS variables. A future theme
   (or per-project accent) must be achievable by swapping one token block.

## Color tokens

Defined as CSS variables in `ui/src/index.css` under Tailwind 4 `@theme`.

### Canvas & text

| Token | Value | Use |
|---|---|---|
| `--color-base` | `#0b1018` | App background |
| `--color-surface` | `#121a26` | Cards, panels, inputs |
| `--color-raised` | `#1a2433` | Hover states, raised elements |
| `--color-sunken` | `#080d14` | Log/diff/code wells, column background |
| `--color-border` | `#1c2738` | Default hairlines |
| `--color-border-strong` | `#2b3a52` | Focus/hover borders |
| `--color-text-primary` | `#e3ebf5` | Headings, body text (~85% white) |
| `--color-text-secondary` | `#8fa3b8` | Descriptions, secondary copy |
| `--color-text-muted` | `#5d7290` | Labels, timestamps, placeholders |

### Accent (ice cyan)

| Token | Value | Use |
|---|---|---|
| `--color-accent` | `#43d9e8` | KPI numbers, active AI markers, links |
| `--color-accent-soft` | `#0d2b33` | Accent-tinted surfaces (pill bg) |
| `--color-accent-border` | `#155e6b` | Borders on accent surfaces |
| `--color-accent-strong` | `#0d96a8` | Primary button gradient start (`→ #0e7490`) |
| `--glow-accent` | `0 0 18px rgba(67,217,232,.18)` | Primary button / running-job glow |

### Status (desaturated for dark canvas)

Each status has a `fg` / `bg` / `border` triple. Use all three together (pill
recipe) — never the fg color on raw `--color-surface`.

| Status | fg | bg | border |
|---|---|---|---|
| `backlog` | `#8fa3b8` | `#121a26` | `#1c2738` |
| `ready` | `#e8b54f` | `#241c0e` | `#4a3a1a` |
| `ai_running` | `#43d9e8` | `#0d2b33` | `#155e6b` |
| `review` | `#56c98e` | `#0e2418` | `#1d4a30` |
| `done` | `#56c98e` | `#0e2418` | `#1d4a30` |
| `failed` / error | `#e87a7a` | `#2b1212` | `#552222` |
| warn | `#e8b54f` | — | — |

Priority text colors: P0 `#e87a7a` · P1 `#e8b54f` · P2 `#8fa3b8` · P3 `#5d7290`.

### Item type (task vs bug)

Type tints the card surface; status owns the left edge + pill (the two signals coexist).

| Token | Value | Use |
|---|---|---|
| `--color-task-bg` | `#0e1b2b` | Task card surface |
| `--color-task-border` | `#1e3a52` | Task card border |
| `--color-bug-bg` | `#241318` | Bug card surface |
| `--color-bug-border` | `#4a2230` | Bug card border |

Type badge text: task → `--color-accent`, bug → `--color-danger`.

### Diff & log

| Token | Value | Use |
|---|---|---|
| `--color-diff-add` | `#56c98e` | `+` lines |
| `--color-diff-del` | `#e8754f` | `-` lines |
| `--color-diff-hunk` | `#7f93a8` | `@@` headers, file headers |
| `--color-diff-ctx` | `#aebccb` | Context lines |
| log timestamp | `--color-text-muted` | dimmed prefix |
| log ok/warn/error | status fg colors | level-bearing lines |

## Typography

Fonts ship as npm packages (`@fontsource-variable/inter`,
`@fontsource/jetbrains-mono`) — **no runtime Google Fonts calls**; the board
must render correctly on an offline LAN.

| Role | Font | Size / line-height | Notes |
|---|---|---|---|
| Body / task prose | Inter | 14px / 1.65 | The reading baseline. Never below 13.5px |
| Headings (drawer title) | Inter 600 | 18px / 1.3 | |
| Section labels | Inter 600 | 10px / 1, uppercase, tracking `.08em`, `--color-text-muted` | Column headers, panel titles |
| KPI numbers | JetBrains Mono 600 | 24px | `--color-accent` for the lead KPI |
| IDs, pills, badges | JetBrains Mono | 10–11px | |
| Logs, diffs | JetBrains Mono | 11.5px / 1.55 | In `--color-sunken` wells |

## Shape, depth, motion

| Property | Value |
|---|---|
| Radius | panels/cards 10px · inner elements (pills, buttons) 8px · wells 8px · pills 999px |
| Borders | 1px everywhere; elevation expressed by background step (base→surface→raised) + border, not heavy shadows |
| Shadows | `0 2px 8px rgba(0,0,0,.3)` on cards; `--glow-accent` ONLY on the primary action and running-job card |
| Transitions | `150ms ease` for color/border/background; `200ms ease` for transform/drawer; no bounce |
| Hover (cards) | background → `--color-raised`, border → `--color-border-strong`, no scale |
| Scrollbars | thin (8px), thumb `#2b3a52`, track transparent |

## Component recipes

- **KPI cell** — surface card, mono number 24px (accent on "overall %"), muted
  uppercase label beneath.
- **Kanban card** — **Type** → tinted surface (`bg-task-bg`/`bg-bug-bg`) + a mono
  TASK/BUG badge (accent/danger). **Status** → a 2px left edge in the status fg
  color + a status pill. Both signals coexist. Row 1: mono ID (muted) + priority
  (priority color); row 2: title in `text-primary` (bug titles in failed-fg); row
  3: component muted + the type/status badges. Hover: raised recipe, but keep the
  status left edge (`hover:border-y/-r-border-strong`, not all sides).
- **Kanban column** — `--color-sunken` at 10px radius, uppercase label with
  count; `ai_running` column header carries an accent `◉`.
- **Status pill** — mono 10px, fg/bg/border triple, radius 999px, padding
  `2px 8px`.
- **Primary button (⚡ Giao cho AI)** — gradient `accent-strong → #0e7490`,
  text `#e6fbff`, radius 8px, `--glow-accent`; hover brightens 8%.
- **Secondary button** — transparent bg, `--color-border` border,
  `text-secondary`; hover: raised recipe. Destructive: failed-fg text.
- **Drawer** — `--color-surface` panel on a full-screen `rgba(8,13,20,.7)`
  backdrop, anchored right with a left border; closes on outside-click and ESC
  (panel calls `stopPropagation`). It is an **editable form**: title input,
  description textarea, priority + component selects (sunken bg, accent focus
  border). A secondary Save button is enabled only when **dirty AND** both
  required fields (title + description) are non-blank; saving keeps the panel
  open. Below a hairline, an **action row**: Execute (⚡ primary, for
  backlog/ready/failed) / Mở console (when a job exists) / review actions
  (Merge ok-tint / Tạo PR neutral / Hủy bỏ danger-tint). Diff/log render in
  sunken wells. A **Delete** affordance pins to the bottom with an inline
  danger confirm.
- **Confirm (inline)** — prefer an in-place confirm over a separate modal: a
  short danger-tinted prompt + a danger confirm button (`danger` fg/bg/border)
  beside a neutral cancel, shown where the trigger was.
- **Activity entry** — surface card; running entry gets accent border +
  `--glow-accent`; log tail in a sunken well, timestamps muted.
- **Diff rendering** — line-based coloring per the diff tokens (classifier:
  `+`→add, `-`→del, `@@`/`diff --git`/`index `/`+++`/`---`→hunk, else ctx;
  `+++`/`---` file headers take hunk color, checked before single-char rules).
- **Empty states** — centered `text-muted`, one short sentence, optional muted
  icon; never blank panels.
- **Invalid tray** — failed triple (fg/bg/border), full-width strip under KPIs.
- **Modal (QuickAdd) / Login** — surface panel on `rgba(8,13,20,.7)` backdrop,
  inputs: sunken bg, border, focus ring `--color-accent-border` →
  `--color-accent` border.
- **Console** — header strip on surface (mono ids, state pill); stream area on
  base with reading-baseline assistant text; tool cards are surface `<details>`
  with a mono summary and a sunken result well (danger fg on errors); system
  lines mono 11px muted (danger for errors, accent for user notes); input bar on
  surface with a sunken textarea, primary send button + danger-tinted "Ngắt &
  chỉ đạo"; auto-scroll pinned to the bottom with a "↓ mới nhất" jump pill.

## Don'ts

- No raw Tailwind palette colors (`zinc-*`, `cyan-*`…) in components — tokens only.
- No pure `#000` / `#fff`.
- No mono for prose; no Inter inside log/diff wells.
- No accent backgrounds on large areas (panels, columns).
- No new fonts, no runtime font CDNs.
- No animation longer than 200ms or with overshoot.

## Compliance

UI reviews check against this file (`jd:ui-design-audit` can target it as the
project design system). When a needed token/recipe is missing, extend THIS
document in the same change that uses it.
