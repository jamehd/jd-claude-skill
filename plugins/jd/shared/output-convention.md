# Output convention (shared by all jd skills)

One rule for where skill output goes, so a project stays tidy no matter how many jd skills run in it.

## Two kinds of output

1. Contracts and config — the source of truth, version-controlled. Live at the repo root, committed:
   - `error-standard.yaml`, `db-standard.yaml`
   - `db-audit.config.json`, `error-audit.config.yaml`
   These are inputs and standards, not output. Never move them under the reports root.

2. Reports and plans — transient, regenerable. Audit reports, fix files, raw scan output, discovery notes, migration plans. These all go under ONE namespaced root.

Scaffolded source code (for example an architect skill writing `src/errors/`) is real code, not a report. It goes where the project's code goes, not under the reports root.

## The reports root

All transient skill output goes under `.jd/`, one subfolder per skill, then a timestamp:

```
.jd/
  db-audit/<YYYY-MM-DD-HHMMSS>/
  error-audit/<YYYY-MM-DD-HHMMSS>/
  ui-design-audit/<YYYY-MM-DD-HHMMSS>/
  architect-error-system-design/<YYYY-MM-DD-HHMMSS>/
```

Rules:
- Subfolder name equals the skill name.
- Each run gets its own UTC timestamp folder; never overwrite a previous run.
- "Compare with last report" diffs against the most recent timestamp under the skill's subfolder.
- On first write, ensure `.jd/` is in the project's `.gitignore` (add the single line if missing). Do not add per-skill ignore lines.

## For skill authors

- Resolve the output base as `.jd/<skill-name>/<timestamp>/`.
- If a skill exposes an output-dir config, its default is `.jd/<skill-name>`; an override replaces only the base, the `<timestamp>` is still appended.
- A skill that reports inline by default (no files) writes nothing here unless the user asks; when it does, it follows this same path.
