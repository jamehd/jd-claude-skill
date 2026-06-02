---
name: ui-design-audit
description: Use this skill whenever the user asks for a UI review, design audit, theme compliance check, or wants to verify that the frontend implementation matches the project's design system. Trigger on phrases like "review UI", "ui audit", "design audit", "kiểm tra UI", "check design", "rà soát giao diện", "audit theme", "check Tailwind", or whenever the user has finished a UI change and wants quality assurance. The skill scans the source code, compares it against the project's DESIGN_SYSTEM.md / design-theme-v2.html (or a default UI-quality checklist if those files are absent), and reports concrete, file-and-line-anchored violations grouped by severity.
---

# UI Design Audit

A systematic UI audit skill. Treat the codebase as something to inspect, not modify — produce a precise report of what diverges from the design system (or from universal UI quality rules) so the human can decide what to fix.

This skill reports inline by default and writes no files. If the user asks for the report as files, write them under `.jd/ui-design-audit/<YYYY-MM-DD-HHMMSS>/` per the shared output convention (`../../shared/output-convention.md`) and ensure `.jd/` is in `.gitignore`.

## Mental model

The user runs this skill repeatedly during UI development. Three things matter:

1. **Consistency** — every screen should look like it came from the same product. Same tokens, same primitives, same density.
2. **Glanceability** — a developer reading the report should be able to act on it in under a minute. Use file paths with line numbers (`src/foo.tsx:42`) so every finding is one click from the source.
3. **Honesty** — never invent violations. If a rule is ambiguous, flag it as a *question*, not a *defect*. False positives erode trust faster than missed defects.

You are NOT modifying code in this skill. You are producing a report. If the user later asks "fix it", that becomes a separate task.

## Workflow

Follow these phases in order. Don't skip discovery — the report quality depends on knowing what design system rules apply.

### Phase 1 — Discover the design system

Look for canonical design documents at the project root and one level deep. Common names:

- `DESIGN_SYSTEM.md`, `DESIGN.md`, `THEME.md`, `STYLE_GUIDE.md`
- `design-theme*.html`, `design-system*.html`, `theme*.html`
- `tailwind.config.{js,ts}` + `globals.css` (token source of truth)
- `src/components/ui/`, `components/ui/`, `app/ui/` (primitive components)
- `CLAUDE.md` for any project-specific UI conventions

Use Glob for filenames and Grep for token names (`--hi-vis`, `--brand`, etc.) so you don't miss tokens declared under a non-standard name.

Record what you find. If at least one of these exists, switch to **design-system mode** (Phase 3a). Otherwise, switch to **default-checklist mode** (Phase 3b).

If both modes apply (e.g., a partial design doc exists), run the default checklist AND the design system check — they complement each other.

### Phase 2 — Inventory the UI surface

Identify what to review. Don't scan node_modules, dist, build, .next, coverage, or generated files.

Typical UI locations:
- `src/app/**/*.{tsx,jsx,vue,svelte}` — Next.js / React app routes
- `src/components/**`
- `src/pages/**`
- `app/**` (Next 13+ app router)
- `styles/**`, `*.css`, `*.scss`

If the project is large, ask the user to narrow scope ("which directory should I focus on?") rather than scanning everything. A focused review is more valuable than a shallow one.

For each file you'll review, also keep a mental list of primitive components in `components/ui/` — these are the *expected* building blocks. Inline classes that re-create a primitive are a violation.

### Phase 3a — Design-system mode

Read `references/design-system-check.md` for the full procedure. The core checks:

1. **Token discipline** — no hardcoded colors (`#fff`, `bg-yellow-400`, `rgb(...)`) when a semantic token exists (`bg-primary`, `bg-hi-vis`). No raw pixel font sizes when the design system defines a type scale.
2. **Primitive reuse** — if a `<Button />`, `<Input />`, `<Badge />` exists in `components/ui/`, raw `<button>` / `<input>` / `<span class="badge-like">` is a violation. Inline-styled buttons are violations.
3. **Geometry rules** — verify the design system's rules on border radius, border weight, shadows, spacing. (E.g., the Site Signage system bans `rounded-*` on chrome.)
4. **Typography mapping** — headings use the display font; data (times, IDs, counts) uses the mono font; the language-specific font kicks in via `:lang(...)`.
5. **Color reservations** — flagship/accent colors are reserved (e.g., hi-vis = one primary action per screen; alert = errors only, not "warning"). Look for misuse.
6. **Interactive feedback** — every clickable element has visible hover + focus + disabled + active states matching the design system spec.
7. **Layout shells** — pages use the canonical shell components (`WorkerShell`, `ManagerShell`, etc.) instead of re-implementing the layout.

For each rule the design system states, find counter-examples in the codebase. Report only what you found; do not hallucinate violations to fill space.

### Phase 3b — Default-checklist mode

Read `references/default-checklist.md` for the full procedure. The core checks (always applicable, even without a design doc):

1. **Button states** — hover, active/pressed, disabled, focus, loading. All five present on every primary button.
2. **Cursor affordance** — `cursor-pointer` on every clickable element. `cursor-not-allowed` on disabled. `cursor-wait` during loading.
3. **Loading states** — every async action (API call, form submit, navigation) shows a loading indicator. Submit buttons disable during in-flight requests. Lists show skeleton or spinner during initial load.
4. **Empty states** — every list/table has a non-empty empty state (icon + message + CTA where appropriate). Never a blank box.
5. **Error states** — failed API calls show user-friendly messages with retry. Form validation errors are inline and field-scoped.
6. **Form discipline** — labels paired with inputs, required fields marked, submit disabled until valid, submit shows loading, success/failure feedback.
7. **Accessibility** — semantic HTML (`<button>` not `<div onClick>`), `alt` on images, `aria-label` on icon-only buttons, focus rings visible, color contrast OK.
8. **Responsive** — touch targets ≥44px on mobile, no horizontal overflow, breakpoints handled, text legible at 320px width.
9. **Performance** — `next/image` (or equivalent) instead of `<img>` for known dimensions, no obvious N+1 fetches in components, lazy loading for below-the-fold content.
10. **Consistency** — spacing scale used (not arbitrary `mt-[13px]`), color values consistent (not five shades of "almost gray"), border radius consistent.
11. **Confirmation for destructive actions** — delete, terminate, cancel-subscription require explicit confirmation (modal or hold-to-confirm).
12. **Internationalization** — visible text is not hardcoded if the project has i18n; dates/numbers use locale-aware formatting.

### Phase 4 — Produce the report

Read `references/report-format.md` for the exact structure. Summary:

- One report per run, written to chat. Do NOT create a file unless the user asks.
- Header: scope reviewed (paths + file count), mode (design-system / default / both), and overall verdict (`PASS` / `NEEDS_WORK` / `BLOCKED`).
- Findings grouped by **severity** (Blocker → Major → Minor → Nit) and within each, by **category**.
- Every finding has: a one-line title, the rule it violates, the file:line evidence, and a one-sentence fix suggestion.
- End with a **prioritized fix list** — the top 5–10 changes that would move the verdict toward PASS.

Keep the report scannable. If there are zero findings in a category, omit that category. Never pad.

## Tone and discipline

- Findings are facts, not opinions. "This uses `bg-yellow-400` instead of `bg-hi-vis`" — not "I think it might be better to use the token."
- Severity reflects user impact, not effort to fix. A missing loading state on a checkout button is a Blocker even if the fix is two lines.
- If a rule is genuinely subjective ("does this layout feel cramped?"), surface it as a **Question for the human**, not a defect.
- Don't reproduce the entire design system document in the report. Cite the rule (`DESIGN_SYSTEM.md §4 Geometry: radius = 0 on chrome`) and move on.
- If you can't find an issue but the user expects one, say so plainly: "Reviewed N files. No violations of <rule> found." Negative findings are valuable.

## When the user says "run it again"

A re-run is the common case. Each time:
1. Re-discover (the design doc may have changed; new primitives may exist).
2. Re-scope (the user may have added directories).
3. Compare against the *current* code, not your memory of last run.
4. If you produced a report last time and most findings are unchanged, say so up front: "12 of 15 findings from the previous report are still present" — saves the human re-reading.

## What this skill does NOT do

- It does not modify code. Even if the fix is obvious, produce the report and stop.
- It does not run lint/typecheck/build. Those are different tools. Mention them if useful, but don't substitute.
- It does not screenshot the UI or open a browser. It reads source code only. If visual verification is needed, say so and let the human decide.
- It does not review backend, API contracts, business logic, security, or accessibility audits beyond the surface-level a11y checks in the default checklist. Recommend specialized skills/tools for those.

## Reference files

- [references/design-system-check.md](references/design-system-check.md) — full procedure when DESIGN_SYSTEM.md / theme files exist
- [references/default-checklist.md](references/default-checklist.md) — full universal UI quality checklist
- [references/report-format.md](references/report-format.md) — exact report structure and severity definitions
- [references/common-violations.md](references/common-violations.md) — recurring patterns to grep for (hardcoded colors, raw buttons, missing hover, etc.)
