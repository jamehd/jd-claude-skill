# Default UI Quality Checklist

Use this checklist when no project-specific design system document exists, OR alongside the design-system check as a baseline of universal UI quality.

These rules are framework-agnostic but cite React/Tailwind specifics where relevant. Adapt to the project's stack.

---

## 1. Button states (the big one)

Every button — primary, secondary, ghost, icon — must visibly differ in these states:

- **Default** — at rest
- **Hover** — pointer over the button (`hover:` in Tailwind, `:hover` in CSS)
- **Active / pressed** — finger/mouse held down (`active:` / `:active`). Often translate + shadow change.
- **Focus** — keyboard focus visible (`focus-visible:` ring). Critical for accessibility.
- **Disabled** — non-interactive state (`disabled:`). Lower opacity OR muted background + `cursor-not-allowed`.
- **Loading** — async action in flight. Spinner + disabled + ideally same width to prevent layout shift.

How to audit:

```
# Find buttons missing hover
Grep for: <button.*className=.*(?!hover:)
Grep for: <Button(?![^>]*disabled)

# Find onClick handlers missing loading discipline
Grep for: onClick=.*await
```

Then open each match and verify the state actually exists. A button with `hover:bg-gray-100` has hover. A button with no `hover:` class probably doesn't.

**Severity:** missing hover on a primary CTA is a Major. Missing focus ring is a Blocker (a11y). Missing loading on a submit button is a Blocker (user double-submits).

---

## 2. Cursor affordance

Pointer should communicate what's interactive:

| Element | Cursor |
|---------|--------|
| `<button>`, clickable card, clickable row | `cursor-pointer` |
| `<a>` (native link) | default (already pointer) |
| `<button disabled>`, disabled link | `cursor-not-allowed` |
| Loading state | `cursor-wait` |
| Text input | default (already `text`) |
| Drag handle | `cursor-grab` / `cursor-grabbing` |

How to audit:

```
# Native button missing cursor-pointer (default <button> cursor is arrow on most platforms when no role)
<button(?![^>]*cursor-pointer)

# Click handler on a div without cursor
<div[^>]*onClick(?![^>]*cursor-pointer)

# Disabled without cursor-not-allowed
disabled(?![^>]*not-allowed)
```

**Severity:** Major. Wrong cursor is the kind of polish issue that makes a product feel amateur.

---

## 3. Loading states

Every async surface needs a loading affordance. The rule of thumb: if the operation takes more than ~200ms, show something.

Required loading states:

- **Initial page load** — skeleton screen or top-of-page progress bar, not blank.
- **List/table data fetch** — skeleton rows or spinner inside the list.
- **Form submit** — button shows spinner, button disabled, fields disabled (to prevent edits during in-flight).
- **Mutation buttons** (delete, approve, etc.) — same as submit.
- **Lazy-loaded images** — placeholder (blur, gradient, color) until the image arrives.
- **Modal opens with async data** — spinner inside the modal body until ready.

How to audit:

```
# fetch() / axios / SWR / react-query usage without a loading flag exposed
useEffect.*fetch
const \{.*data.*\} = use(SWR|Query)\(
```

For each, find the consumer and verify it renders a loading state. Missing loading in a top-level data fetch is a Blocker.

**Anti-pattern to flag:** code that uses `isLoading && <Spinner />` but doesn't disable the buttons inside the form — user can double-submit.

---

## 4. Empty states

When a list / table / search result returns zero items, do NOT show a blank box. Show:

- An icon or illustration (calm, not alarming)
- A short message in the user's language ("No documents yet" / "Chưa có tài liệu nào")
- A CTA when appropriate ("Create the first one →")

How to audit:

```
# Lists that render data directly without an empty fallback
items\.map\(
data\.map\(
```

For each, check if there's a `data.length === 0` branch above. If not, flag.

**Severity:** Major — empty states show up early in real use (every new user sees them).

---

## 5. Error states

Failed requests need user-visible feedback. Categories:

- **Network errors** — "Couldn't connect. Check your connection and try again." + Retry button.
- **Validation errors** — inline, next to the offending field, with a clear message ("Phone number must be 10 digits").
- **Authorization errors (403)** — clear message + path to resolve ("You don't have permission. Contact your manager.").
- **Not-found (404)** — friendly page, link back to home.
- **Server errors (5xx)** — generic "Something went wrong, please try again" + the ability to retry. Never expose stack traces.

How to audit:

```
# Catch blocks that silently swallow errors
\.catch\(\(\) => \{\}\)
\.catch\(\([^)]*\) => console
```

For each `try/catch` or `.catch(...)`, confirm the error reaches the user. Console-only error reporting is a Major violation.

---

## 6. Form discipline

Every form should have:

- Each input paired with a `<label>` (or `aria-label` if visually hidden).
- Required fields visibly marked.
- Submit button disabled when the form is invalid (or shows validation on submit attempt — pick one style and be consistent).
- Submit button shows loading + disabled during in-flight.
- Success path — confirmation (toast, redirect, inline message). Never silent.
- Failure path — error displayed, fields keep their values (don't wipe user input on error).
- Autofocus on the primary field for short forms.
- Sensible input types (`type="email"`, `type="tel"`, `inputMode="numeric"`).

How to audit:

```
# Forms without labels
<input(?![^>]*aria-label)(?![^>]*id=)
<form(?![^>]*aria-label)

# Submit handlers that don't await + don't disable
onSubmit=.*async
```

---

## 7. Accessibility (a11y) baseline

Not a full a11y audit, but catch the obvious offenders:

- Semantic HTML — `<button>` for actions, `<a>` for navigation, `<nav>` / `<main>` / `<aside>` landmarks.
- `alt` on every `<img>` (use `alt=""` for purely decorative).
- `aria-label` on icon-only buttons.
- Focus indicator visible (never `outline: none` without a replacement).
- Color contrast ≥ 4.5:1 for normal text (eyeball it; flag obviously low-contrast text).
- Form errors announced (`aria-describedby` linking input to error message).
- Headings in hierarchical order (no jumping from `<h1>` to `<h4>`).
- Skip links on long pages.

How to audit:

```
# Click handlers on non-button elements
<div[^>]*onClick
<span[^>]*onClick

# Images without alt
<img(?![^>]*alt=)
<Image(?![^>]*alt=)

# Icon-only buttons (icon child but no aria-label and no visible text)
<button[^>]*>\s*<(Icon|svg)
```

---

## 8. Responsive design

- Touch targets ≥ 44×44px on mobile (the iOS HIG floor). 48px recommended.
- No horizontal scroll at 320px width unless the content is intentionally horizontal (tables, carousels).
- Breakpoints used consistently — pick `sm/md/lg/xl` or `mobile/tablet/desktop` and stick to it.
- Text legible — body ≥ 14px on mobile, headings scale down sensibly.
- Modals don't break on small screens (no fixed widths > 320px without scroll).

How to audit:

```
# Fixed widths that may break mobile
w-\[(4[0-9][0-9]|[5-9][0-9][0-9]|1[0-9]{3})px\]
max-w-(2|3|4|5|6|7)xl(?!.*sm:)

# Small touch targets
h-(6|7|8)(\s|$)  # height < 36px
```

---

## 9. Performance hygiene

- Images use the framework's image component (`next/image`, `<Image />`) — gives lazy loading, sizing, format conversion.
- Below-the-fold content lazy-loaded (`loading="lazy"` or dynamic import).
- No obviously expensive computation in render (heavy `useMemo` candidates).
- Lists with > 100 items virtualized.
- No `fetch` chains in `useEffect` that should be parallelized.

How to audit:

```
<img\b(?!.*loading)
useEffect\(\(\) => \{[^}]*fetch[^}]*fetch  # sequential fetches
\.map\([^)]*\) => \{[^}]*useState  # state inside loop — usually a bug
```

---

## 10. Visual consistency

- Spacing scale — use Tailwind defaults (`mt-2`, `mt-4`, `mt-6`) instead of `mt-[13px]`. Arbitrary values are a yellow flag.
- Color values — confirm consistent shades. "Five almost-grays" across the app is a defect even if each one looks fine in isolation.
- Border radius — pick a system (0 / 2 / 4 / 8 / full) and stick to it.
- Shadows — same. Two shadows that exist for the same conceptual elevation should be the same shadow.
- Typography — pick a type scale, stick to it.

How to audit:

```
# Arbitrary spacing
m[trblxy]?-\[
p[trblxy]?-\[

# Arbitrary radius
rounded-\[

# Inline font sizes
text-\[
```

Each arbitrary value is a candidate violation. Read context — sometimes the arbitrary value is justified (e.g., aligning to a fixed external element).

---

## 11. Destructive action confirmation

Any action that deletes, terminates, cancels, or is otherwise irreversible should require confirmation:

- A modal with "Are you sure?" + the consequence stated explicitly
- OR a hold-to-confirm button ("Hold to delete — 2s")
- OR a typed confirmation for the most severe ("type DELETE to confirm")

How to audit:

```
# Buttons or handlers that imply destructive action
(delete|remove|cancel|terminate|reset|wipe|destroy)
```

For each, trace to the onClick. Is there a confirmation step? If not, flag.

**Severity:** Blocker for irreversible actions (account deletion). Major for soft-destructive (cancel subscription with grace period).

---

## 12. Internationalization (if applicable)

If the project has i18n (Vietnamese / Korean / English in the example):

- Visible strings are not hardcoded in JSX. They flow through the i18n function (`t("...")`, `<Trans>`).
- Dates and times use `Intl.DateTimeFormat` or a wrapper that respects locale.
- Numbers use `Intl.NumberFormat`.
- Pluralization uses the i18n library's plural support, not `count + (count === 1 ? " item" : " items")`.
- Right-to-left support (if any RTL language is supported).
- No string concatenation that breaks translation: `"Hello " + name` should be `t("greeting", { name })`.

How to audit:

```
# Plain string literals in JSX (likely candidates for i18n)
>\s*[A-Za-z]{4,}.*<

# Hardcoded English in components
">Submit<|>Cancel<|>Save<|>Delete<
```

Many false positives here — but the candidates are worth scanning.

---

## Severity calibration (default mode)

- **Blocker** — broken user experience. Missing loading on submit (double-submit risk). Missing focus ring (keyboard users can't use the app). Missing confirmation on destructive action. Color contrast that fails WCAG AA on critical text.
- **Major** — visibly wrong or inconsistent. Missing hover state on a primary button. Hardcoded color where a token exists. Empty state is a blank box.
- **Minor** — polish drift. Arbitrary spacing values. Inconsistent border radius. Missing `cursor-pointer` on a div-button.
- **Nit** — opinion. Spacing could be tighter. Icon could be larger. Use sparingly — too many nits make the report unreadable.

When in doubt, err toward Minor rather than Major. A clear Major lands; a stretched-Major gets ignored.
