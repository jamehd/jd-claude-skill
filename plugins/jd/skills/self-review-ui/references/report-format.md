# Report Format

The report is the *product* of this skill. Make it scannable, actionable, and honest. The reader should be able to:

1. Tell in 5 seconds whether the work is ready to ship.
2. Find the most important fix in 15 seconds.
3. Click any file path and land on the offending line.

## Structure

Use this exact structure. Skip sections that have zero entries — never pad.

```markdown
# UI Self-Review · <date> · <branch or commit short SHA if known>

**Scope:** <N> files reviewed under <path(s)>
**Mode:** <design-system | default | both>
**Verdict:** <PASS | NEEDS_WORK | BLOCKED>

---

## Summary

- <one line — what's good>
- <one line — what's the biggest concern>
- <one line — recommended next action>

---

## Blockers (N)

### <category, e.g. "Loading states">

- **<one-line title>** — <one-sentence rule violated>
  - Location: `path/to/file.tsx:42`
  - Evidence: `<one-line excerpt of the offending code>`
  - Fix: <one-sentence fix>

(repeat per finding)

---

## Majors (N)

(same shape as Blockers)

---

## Minors (N)

(same shape, can be more compact — often one line each)

---

## Nits (N)

(only include if useful; can be a flat bulleted list)

---

## Questions for the human

- <subjective decision that needs human judgment>
- <ambiguous rule interpretation>

(only if applicable)

---

## Prioritized fix list

If you addressed only the top items, the verdict would move to <PASS / NEEDS_WORK / closer-to-PASS>.

1. <Blocker / Major item>
2. ...
3. ...

(5–10 items, ordered by impact-to-effort ratio)
```

## Field rules

### Verdict

- **PASS** — zero blockers, ≤ 3 majors that are isolated. Ready to merge from a UI-quality perspective.
- **NEEDS_WORK** — some majors, or many minors with a pattern. Should be addressed before merging to main.
- **BLOCKED** — at least one blocker. Do not ship.

Be honest. A NEEDS_WORK with a clear top-3 is more useful than a generous PASS.

### Finding title

A title is a noun phrase, < 60 characters, with a hint of severity. Examples:

- Good: "Primary CTA missing hover state"
- Good: "Hardcoded `bg-yellow-400` on save button"
- Good: "Submit button doesn't disable during in-flight request"
- Bad: "There's an issue with the button" (too vague)
- Bad: "I noticed that the save button on the admin sites page doesn't have a hover state which violates the design system rule about interactive elements" (too long)

### Location

Always `path/to/file.ext:line`. If the violation spans multiple lines, use the start line.

If the violation is project-wide (e.g., "no buttons in the codebase have hover states"), use `<global>` and list 2–3 representative files instead of every file.

### Evidence

A single line, copied verbatim from the source. Use backticks for inline code. If the line is long, truncate with `…` but keep the offending part visible:

```
className="bg-yellow-400 hover:bg-yellow-500 …"
```

### Fix

One sentence. An imperative. Do not write code blocks — the developer will write the fix. The skill recommends; it does not implement.

Good: "Replace `bg-yellow-400` with the semantic token `bg-primary`."
Good: "Add a `hover:` style — e.g., `hover:bg-mortar/40` for cards."
Bad: "Here's the corrected code: ```tsx ... ```" (overreach)
Bad: "Consider possibly maybe using a token here." (mushy)

## Counting

Always include the count in parentheses next to the section title. Reader scans by count.

If a category has > 10 findings, list the top 5 in full and then write:

> Plus 7 more of this pattern in: `path/a.tsx`, `path/b.tsx`, `path/c.tsx`, ...

Don't list 50 identical findings — group them.

## Negative findings

If a category was checked and is clean, mention it briefly in the Summary. This builds trust:

> "Cursor affordance: clean across reviewed files."

Especially valuable in re-runs when you fixed something in the previous iteration.

## Tone examples

**Tone to use:**

> ### Loading states
>
> - **Submit button doesn't disable during in-flight request** — user can double-submit, causing duplicate worker records.
>   - Location: `src/app/admin/workers/new/page.tsx:88`
>   - Evidence: `<button onClick={handleCreate}>저장</button>`
>   - Fix: Add `disabled={isSubmitting}` and render a spinner when `isSubmitting` is true.

**Tone to avoid:**

> I went through the file and I think there might be an issue with the submit button. It looks like it could potentially allow the user to click it multiple times in a row which might lead to duplicate records being created, although I'd want to verify this is actually happening in practice...

The first is a fact stated cleanly. The second is a hedge.

## Length

Aim for one screen of report (roughly 60–100 lines) for a typical review. If the report is longer:

- Are you padding minors? Cut.
- Are there 30 instances of the same pattern? Group them.
- Are you including rule explanations? Don't — cite the rule once at the top, then reference it.

If the codebase legitimately needs a long report, split the response: top section is the summary + blockers + majors. Then offer: "Want me to expand into the minors and nits?"

## Re-run diff

On a re-run, lead with what changed since the previous report:

> **Since previous review:**
> - 4 blockers fixed (✓ submit loading on workers form, ✓ destructive confirm on delete site, ...)
> - 2 new blockers introduced (✗ hardcoded color in new attendance card, ...)
> - 8 of 12 majors still present (no change)

That delta is the first thing the human wants to see.
