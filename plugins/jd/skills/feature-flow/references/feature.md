# /jd:feature <ID or free text>

1. Read `paths.status`, every `feature.md`, `paths.scenarios`, `paths.owner_actions`.
2. Identify the feature:
   - An existing ID or alias → that feature.
   - Free text → create the next `NEW-NNN` feature from `templates/feature.md` with status `idea`,
     the request quoted verbatim in `brief.md`, and `order` after the last queued feature unless the
     owner named a position.
   - Unclear → ask one question and stop.
3. Check `needs`. Each ID is looked up among features and owner actions; an **unknown** ID →
   report it and stop. A need that is not done → report what is missing, propose an order, stop.
   Exception: a feature need in `building` or `acceptance` allows drafting (never building).
4. Draft `brief.md` and `acceptance.md` from the templates. If a `brief.md` already exists,
   keep its content (goal, checks, "Delivers", needs) and merge it into the template structure
   instead of overwriting it.
   - Use the owner's words, the design docs in `paths.design_docs`, and existing scenarios.
   - Scenarios must be observable in `acceptance.environment`, with timing where it matters.
   - Find features that touch the same behaviour; add intersection scenarios; list them under
     Overlaps.
   - Fill "Quality budgets" (see `quality.md`): numeric budgets for latency, resources and
     stability on every user-facing path, long-running process and money path, each with its
     condition and the action that measures it; otherwise "none" with the reason. Add one
     `<ID>-Q<n>` row per budget to `acceptance.md`.
   - Set the risk tier and its reason, and the suite (`gate` or `nightly`) of every scenario and
     budget (`tiers.md`). A scenario that must observe a long real-time wait gets a scaled `gate`
     version and the real-time check in `nightly`.
   - Size check: more than `limits.feature_new_scenarios` new scenarios → split into features that
     can each be accepted alone, and offer the split under Open questions.
   - List every owner step (accounts, credentials, devices, real sites) under "Owner steps" with
     the step it blocks, so the owner can prepare them at approval.
   - Every decision the docs do not settle goes under Open questions with a recommendation.
   - Use superpowers:brainstorming as self Q&A only; do not run its interactive questions.
5. Add the scenario IDs to `paths.scenarios` with state `proposed`.
6. Set `brief-review` in `feature.md` and the status file.
7. Reply in `language.owner`: goal, risk tier, scenarios in plain words, owner steps, open
   questions; ask for an explicit approval or corrections.

On explicit approval (words, or the owner typing `/jd:build <ID>`): write
`Approved by owner: <date>` in the brief and `approvedAt` in `feature.md`, set this feature's
scenarios to `approved`, and continue with `build.md` if asked.
