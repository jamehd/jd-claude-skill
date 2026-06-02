# Design-System Mode — Detailed Procedure

Use this procedure when at least one canonical design document exists: `DESIGN_SYSTEM.md`, `design-theme*.html`, `STYLE_GUIDE.md`, or equivalent.

## Step 1 — Internalize the design system

Read the design document(s) end-to-end before scanning code. You need to know:

- **Tokens defined** — every color, font, spacing, radius, shadow that the design system names. Record both raw tokens (`--hi-vis`) and semantic ones (`--primary`).
- **Primitive components named** — the canonical `<Button>`, `<Input>`, `<Badge>`, `<Card>`, etc. that the design system says to use. Note their import paths.
- **Rules that are absolute** vs **rules that are guidelines** — the design doc often distinguishes (e.g., "no rounded corners on chrome — photos and avatars are the only exception").
- **Reservations** — colors or visual treatments reserved for a specific meaning (e.g., "alert orange is for rejected/expired only, never decorative").
- **Layout shells** — top-level layout components users are expected to compose into.

Also read the actual token source (`globals.css`, `tailwind.config.ts`, `theme.ts`) to confirm the design doc matches the code. If they disagree, the code wins for "what's available", but the doc wins for "what's intended" — flag the divergence.

## Step 2 — Identify the primitives that exist

List every component in `src/components/ui/` (or equivalent). For each, note:

- Its public API (variants, sizes, props)
- The Tailwind classes / styles it bundles
- The canonical usage example from the design doc

This list is your "expected building blocks." Any inline re-implementation of one of these in feature code is a violation.

## Step 3 — Scan code with targeted greps

Don't read every file linearly. Use Grep to find candidate violations, then read the matched files to confirm.

Patterns to grep for (adapt to the project's actual tokens):

### Hardcoded color violations

```
# Hex colors in JSX/CSS — almost always a violation when tokens exist
\#[0-9a-fA-F]{3,8}

# Tailwind palette colors (yellow, gray, etc.) that bypass tokens
bg-(yellow|gray|slate|zinc|neutral|stone|red|orange|amber|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+

# Inline style with color
style=\{\{[^}]*color
style=\{\{[^}]*background

# Raw rgb/rgba
rgba?\(
```

For each match: is there a semantic token that should have been used? If yes → finding.

### Geometry violations (when design system bans them)

```
# Rounded corners on chrome (when banned)
rounded-(sm|md|lg|xl|2xl|3xl|full)

# Single-pixel borders (when 2px is mandated)
border\b(?!-2)
```

Be careful — `rounded-full` on an avatar is fine. Confirm context before flagging.

### Primitive bypass

```
# Raw <button> when <Button /> exists
<button\s

# Raw <input> when <Input /> exists
<input\s

# Inline "badge-like" spans
className=.*(badge|pill|tag).*\b(px-|py-|border)

# Inline button-like divs
<div[^>]*onClick
```

A raw `<button>` deep inside a primitive (`button.tsx` itself) is fine — the primitive IS the place it should exist. A raw `<button>` in feature code is the violation.

### Cursor & hover discipline

```
# Clickable element without cursor-pointer
<button(?![^>]*cursor-pointer)
<a\s[^>]*onClick(?![^>]*cursor-pointer)
onClick=.*(?!cursor-pointer)

# Missing hover on interactive
className=.*onClick.*(?!hover:)
```

Many design systems mandate explicit hover styling beyond browser defaults. Check the design doc.

### Typography violations

```
# Display font on Korean / non-Latin text (when forbidden)
:lang\(ko\).*font-display
font-display.*lang.ko

# Mono missing on data
\{(time|date|count|id|amount|phone|percent)
```

These need a follow-up read — greps surface candidates, but only context confirms the violation.

### Reserved color misuse

If `alert` (or whatever the destructive color is named) is reserved:

```
bg-alert|text-alert|border-alert
```

For each match: does the surrounding code semantically use it for error/rejection/expired? If not → violation. (E.g., using `bg-alert` for a "warning" banner when the rule is alert = errors only.)

### Hi-vis / brand color overuse

If the brand accent is meant to be precious (one primary action per screen):

```
bg-(hi-vis|brand|accent-primary)
```

Then list every page that uses it more than once for a primary CTA. Each excess use is a violation.

### Missing layout shells

```
# Top-level page that doesn't import the canonical shell
src/app/**/page.tsx
```

Open each and verify it composes with `<WorkerShell>`, `<ManagerShell>`, etc. as appropriate.

## Step 4 — Cross-check the live theme preview

If a `design-theme*.html` file exists, it's the canonical "this is what good looks like." Open it conceptually (read it as a reference, not by rendering) to confirm your understanding of how primitives compose. If you see a pattern in the codebase that doesn't appear anywhere in the live preview, that's worth flagging as "novel pattern — needs review."

## Step 5 — Severity assignment

For each violation found:

- **Blocker** — breaks the design system contract in a way that ships visibly wrong UI. Examples: wrong color on primary CTA, missing primary action, broken language fallback (Korean rendering in display font).
- **Major** — visibly inconsistent with the rest of the product. Examples: hardcoded hex, raw `<button>` instead of `<Button>`, missing hover state.
- **Minor** — style drift that a careful reviewer would catch. Examples: arbitrary `mt-[13px]`, `border` instead of `border-2`, ink color slightly off (`#1A1A1A` vs `--ink #131210`).
- **Nit** — opinion-flavored. Examples: section title could use a higher weight; eyebrow could be a different size. Use sparingly.

## Anti-patterns in the reviewer (you)

- Don't flag tokens that simply *aren't being used yet* — only flag *misuse*. An empty page using no tokens is not a violation.
- Don't flag generated code, vendor files, or `node_modules`.
- Don't claim a primitive is missing if you didn't grep for it — list what exists, then compare.
- Don't recommend a sweeping migration in a review. Cite the violations; let the human decide scope.

## Producing findings

When you write a finding for a design-system violation, always include:

1. The rule, with section reference: `DESIGN_SYSTEM.md §2 Color rules: hi-vis reserved for one primary action per view`
2. The location: `src/app/admin/sites/page.tsx:48`
3. The evidence: a one-line quote of the offending code
4. The fix: `Replace bg-yellow-400 with bg-hi-vis`

That tuple makes the finding actionable in seconds.
