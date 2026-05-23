# Common Violations — Greppable Patterns

This file is a working library of regex patterns and their typical false-positive traps. Use it as your search arsenal during Phase 3.

Every pattern here has the same shape:

- **Pattern** — what to grep
- **Why it matters** — what it usually catches
- **False positives** — what NOT to flag
- **Confirm before flagging** — how to verify it's a real violation

---

## 1. Hardcoded hex colors

**Pattern:** `#[0-9a-fA-F]{3,8}\b`

**Why it matters:** Tokens exist for a reason. A raw `#FFCE0A` in the codebase means the next theme change won't propagate.

**False positives:**
- SVG `fill="#000"` inside icon components — usually fine; icons often take color via `currentColor` upstream.
- Test fixtures, snapshot files, MDX docs.
- Generated CSS in `.next/`, `dist/`, `build/`.

**Confirm before flagging:** open the file. Is the hex inside a `style=` prop, inline class, or CSS file? Does a matching token exist (check `globals.css` / `tailwind.config`)? If yes to both → finding.

---

## 2. Tailwind palette bypass

**Pattern:** `bg-(yellow|gray|slate|zinc|neutral|stone|red|orange|amber|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+`

Same for `text-`, `border-`, `ring-`.

**Why it matters:** these are Tailwind's default palette, not your project's semantic palette. Tokens like `bg-primary`, `bg-hi-vis`, `text-foreground` should be used instead.

**False positives:**
- Component libraries you're using (e.g., a third-party Markdown renderer's syntax-highlight theme).
- Storybook/dev-only files.

**Confirm before flagging:** is there a semantic equivalent? `bg-yellow-400` in a project where `--hi-vis: #FFCE0A` exists → finding. `bg-gray-100` in a project with no theme defined → not a finding (in default mode this might just be "consistency drift").

---

## 3. Raw `<button>` where a primitive exists

**Pattern:** `<button\s`

**Why it matters:** primitives bundle hover, disabled, focus, size, variant rules. Raw `<button>` re-implements them inconsistently.

**False positives:**
- Inside the primitive itself (`components/ui/button.tsx`).
- Tests, storybook stories.
- Third-party-driven content (a markdown renderer outputting buttons).

**Confirm before flagging:** is `<Button />` imported in this project? If yes, every raw `<button>` outside the primitive file is a candidate.

---

## 4. Click handler on a non-interactive element

**Pattern:** `<(div|span|li|td|a(?!\s))[^>]*onClick`

(The `a` without trailing `\s` is to exclude `<a ` which is fine — well, except for `<a>` without `href`. Treat carefully.)

**Why it matters:** screen readers and keyboards won't reach `<div onClick>`. It's both an a11y bug and a hover/focus discipline bug.

**False positives:**
- Custom interactive elements with proper `role="button"`, `tabIndex={0}`, and a keyboard handler. Open and confirm.

**Confirm before flagging:** open the file. Does it have `role="button"` AND `tabIndex={0}` AND a `onKeyDown` for Enter/Space? If any missing → finding.

---

## 5. Missing hover

**Pattern:** none direct — use this approach:

```
# Find all clickable elements
<(button|a|Button|LinkButton)
```

Then for each match, check if the same class string contains `hover:`. If not, suspect missing hover.

**False positives:**
- Primitives that inject hover from their internal `cva` variants — the consumer doesn't need to add `hover:` because the primitive handles it.

**Confirm before flagging:** open the consumer. If the primitive (`<Button>`) handles hover internally, the consumer line is fine. If it's a raw `<button>` or a `<div onClick>`, missing hover is a finding.

---

## 6. Missing focus ring

**Pattern:**

```
outline-none(?!.*focus-visible)
outline:\s*none(?!.*focus)
```

**Why it matters:** removing the outline without replacing it makes the app unusable with a keyboard.

**False positives:** rare. If `outline-none` appears, it should ALWAYS be paired with a replacement focus indicator. If not → finding (a11y Blocker).

---

## 7. `cursor-pointer` discipline

**Patterns:**

```
# Native button without explicit cursor-pointer
<button(?![^>]*cursor-pointer)

# Disabled without cursor-not-allowed
disabled(?![^>]*not-allowed)
```

**Why it matters:** in many themes, `<button>` doesn't get pointer cursor by default. Disabled elements should show a not-allowed cursor.

**False positives:**
- Primitives that bundle `cursor-pointer` via class composition — only flag the consumer if it bypasses the primitive.

**Confirm before flagging:** is this a raw `<button>` outside a primitive? Then missing `cursor-pointer` is a finding.

---

## 8. Missing loading on async actions

**Pattern:**

```
# onClick that awaits without a loading flag in scope
onClick=.*async
onSubmit=.*async
\.mutate\(
\.mutateAsync\(
```

For each match, read the surrounding component. Is there a `loading` / `isPending` / `isSubmitting` flag? Is it used to:

1. Disable the button?
2. Render a spinner?
3. Disable form inputs (for forms)?

If any is missing → finding.

**False positives:**
- Fire-and-forget actions where loading visual is intentionally skipped (rare, document why).

---

## 9. Empty `.catch`

**Pattern:**

```
\.catch\(\(\) => \{\}\)
\.catch\(\([^)]*\) => console
catch\s*\([^)]*\)\s*\{\s*console
```

**Why it matters:** errors swallowed silently or only logged to console means the user has no idea something went wrong.

**Confirm before flagging:** is there a user-visible error path (toast, banner, modal, inline message)? If console-only → finding.

---

## 10. Images without alt

**Pattern:**

```
<img(?![^>]*alt=)
<Image(?![^>]*alt=)
```

**Why it matters:** a11y. Also breaks if the image fails to load.

**False positives:**
- Decorative images that legitimately use `alt=""` (still requires the empty alt attribute — both are valid, missing is not).

**Confirm before flagging:** match must literally have no `alt=` attribute at all. `alt=""` is acceptable.

---

## 11. Icon-only buttons missing `aria-label`

**Pattern:** harder — use this approach. Grep for `<button` blocks where the body contains an icon component or `<svg>` but no visible text.

```
<button[^>]*>\s*<(Icon|svg|[A-Z][a-zA-Z]*Icon)
<Button[^>]*>\s*<(Icon|svg|[A-Z][a-zA-Z]*Icon)
```

Then open each and check if `aria-label`, `title`, or visually-hidden text exists.

---

## 12. Arbitrary spacing / sizing values

**Patterns:**

```
[mp][trblxy]?-\[
w-\[
h-\[
text-\[
rounded-\[
```

**Why it matters:** arbitrary values mean the spacing/sizing scale isn't being used. Often a sign that the design wasn't translated through a system.

**False positives:**
- Aligning to fixed external element (e.g., a video player with known dimensions).
- One-off illustration sizing.

**Confirm before flagging:** is there a scale equivalent? `mt-[13px]` should probably be `mt-3` (12px) or `mt-4` (16px). Arbitrary `w-[372px]` for a video player matching the design exactly might be justified.

---

## 13. Reserved colors used decoratively

For colors that the design system reserves (e.g., `bg-alert` = errors only):

**Pattern:** `bg-alert|text-alert|border-alert` (or whatever the reserved tokens are named)

**Confirm before flagging:** open each match and read the surrounding context. Is the element semantically an error / rejection / expired state? If yes → fine. If it's a "warning" or "promotional accent" → finding.

---

## 14. Hardcoded user-facing text (when i18n exists)

**Pattern:**

```
>\s*[A-Za-z][A-Za-z\s]{3,}<
```

**Why it matters:** if the project has `t("...")` infrastructure, every hardcoded string is a missed translation.

**False positives:** many. Brand names, code, abbreviations, single letters, names of inputs.

**Confirm before flagging:** is `t(` or `useTranslation` or `<Trans>` imported elsewhere? If yes → audit candidate. If no → skip this check.

---

## 15. Inline styles for color/spacing

**Patterns:**

```
style=\{\{[^}]*(color|background|fontSize|padding|margin|width|height)
```

**Why it matters:** bypasses Tailwind / the design system entirely.

**False positives:**
- Dynamic values that legitimately need a runtime computed style (chart bar widths, animation progress, etc.).

**Confirm before flagging:** is the value a literal (`color: "#fff"`) or computed (`width: ${percent}%`)? Literal → finding. Computed → usually fine, just verify it can't use a class.

---

## 16. Stack of `useEffect(fetch)` patterns

**Pattern:**

```
useEffect\(.*\) => \{[\s\S]*?fetch\(
```

(Multiline.)

**Why it matters:** `useEffect`-based fetching often misses error/loading discipline AND races on unmount. Most projects today use a query library.

**Confirm before flagging:** is the project using React Query / SWR / TanStack Query elsewhere? If yes, manual `useEffect(fetch)` is a candidate for migration — flag as Minor with the note "should be migrated to the query library used elsewhere."

---

## 17. Borders that disagree with the design

If the design system says "2px ink borders":

**Pattern:** `\bborder\b(?!-2)(?!-l)(?!-r)(?!-t)(?!-b)`

(`border` without a size — but exclude single-side borders which are common.)

**Confirm before flagging:** open the file. Is this primary chrome (cards, panels, inputs)? Then `border` → `border-2` is the fix. Is this a row divider where a 1px is correct? → not a finding.

---

## 18. Multi-source-of-truth shadows

If shadows are defined in the design system:

**Pattern:** `box-shadow:|shadow-\[`

Inline shadows or arbitrary shadow utilities bypass the system. Confirm a named shadow (`shadow-stamp`, `shadow-md`) doesn't fit before allowing the inline version.

---

## Using the patterns

For each Grep run, capture:
- File path
- Line number
- The matched line

Then group findings by category before writing the report. Don't write findings as you go — you'll repeat yourself. Build a list, dedupe by pattern, then turn it into report bullets.
