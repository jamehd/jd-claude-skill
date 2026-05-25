---
name: error-audit
description: Use when user wants to audit error handling, error logging, error notification routing, or user-facing error messages in a codebase. Triggers on phrases like "audit error handling", "review error coverage", "check error logging", "audit lỗi", "kiểm tra error handling". Supports Node.js/TypeScript, Go, and Frontend (React/Vue/Next.js). Outputs Markdown report + fix files classified by severity. Read-only — never modifies code or calls external APIs.
---

# Error Handling Audit

Audit error handling across four dimensions and produce a classified Markdown report + per-finding fix files.

## When to use
- "audit error handling"
- "review error coverage"
- "check error logging"
- "audit error notification routing"
- "kiểm tra error handling" / "audit lỗi"
- Pre-release error system review
- Post-incident review to find gaps

## What this skill does
1. Detects project stacks (Node/Go/Frontend) and critical paths (payment/auth/...)
2. Runs pattern checks across 4 dimensions: Code (A), Logging (B), Routing (C), User Messaging (E)
3. Classifies findings Critical/High/Medium/Low (boosted in critical paths)
4. Outputs `AUDIT-REPORT.md` + `EXECUTIVE-SUMMARY.md` + per-finding fix files + raw scan output
5. Read-only — does NOT modify code, does NOT call external APIs

## Workflow

### Step 1 — Preflight
- Verify `ripgrep` available: `rg --version`. If missing, abort with install instructions.
- Verify target project: there must be at least one of `package.json`, `go.mod`, or a `src/` directory.
- Look for `error-audit.config.yaml` at project root.

### Step 2 — Stack Detection
- Follow rules in `detectors/stack-detection.md`.
- Output a structured list of detected stacks (and workspaces for monorepos).

### Step 3 — Critical Path Auto-Detection
- Scan directory + file paths for keywords listed in `references/critical-path-keywords.md`.
- Output a list of matched paths.

### Step 4 — User Confirmation Gate
- If `error-audit.config.yaml` exists: load it, skip the gate.
- Otherwise: present detected stacks + critical paths to the user and ask for confirmation or override.
- The user may also opt to save the confirmed config for re-runs.

### Step 5 — Pattern Execution
- Always run `patterns/_common/*`.
- Run `patterns/<stack>/*` for each detected stack (per mapping in `detectors/stack-detection.md`).
- Fail-safe: a single pattern's failure logs an error in `raw/skipped-patterns.json` and DOES NOT abort the audit.
- For each pattern: read the `Ripgrep command(s):` block, execute, collect output. Apply false-positive guards described in the pattern file.

### Step 6 — Classify Findings
- Each match becomes a Finding with the pattern's base severity.
- Apply the boost rule from `references/severity-classification.md`: if file path matches any `critical_paths` entry, severity = base + 1 (capped at Critical).
- Cross-check with `references/severity-classification.md` rubric for any composite checks.

### Step 7 — Generate Output
Create `<project_root>/<output_dir>/<YYYY-MM-DD-HH-MM-SS>/` (default `output_dir`: `error-audit-report`) with:
- `AUDIT-REPORT.md` (filled-in `templates/report-template.md`)
- `EXECUTIVE-SUMMARY.md` (filled-in `templates/executive-summary-template.md`)
- `fixes-critical/`, `fixes-high/`, `fixes-medium/`, `fixes-low/` — one `.md` per finding (filled-in `templates/fix-template.md`)
- `raw/detected-stacks.json`, `raw/critical-paths-used.json`, `raw/config-effective.yaml`, `raw/grep-<pattern>.txt`, `raw/skipped-patterns.json`

Display summary to user:
```
Audit complete. Findings:
  Critical: 3
  High: 12
  Medium: 28
  Low: 41
Report: ./error-audit-report/2026-05-25-14-30-00/AUDIT-REPORT.md
```

## Edge cases
1. Stack not supported → `_common/` only + warning
2. Monorepo → per-workspace + aggregate
3. Empty `critical_paths` → no boosting; mention in report
4. Large codebase (>10k files) → cap raw output, full list in `raw/`
5. Multiple keywords match → highest severity wins
6. Config file syntax error → fail fast with clear error
7. No findings → "clean" report + recommend manual review
8. Repeat runs → timestamped output folders
9. Custom logger → respect `log_function_names` in config
10. Test files → skipped by default

## Output safety
- Output dir is git-ignored by default (skill prompts to add `error-audit-report/` to `.gitignore` if not present).
- Snippets in fix files use the smallest necessary context — no full file dumps.
- Stack traces are NOT included in the report.

## Non-goals
- Does NOT audit business-logic coverage (that's `business-flow-coverage` skill, planned v2)
- Does NOT auto-apply fixes
- Does NOT call Sentry/Datadog APIs (filesystem-only in v1)
- Does NOT execute project code

## References
- Severity rubric: `references/severity-classification.md`
- Error taxonomy: `references/error-taxonomy.md`
- Routing matrix: `references/notification-routing-guide.md`
- Best practices: `references/best-practices-per-stack.md`
- Critical-path keywords: `references/critical-path-keywords.md`
- Sensitive-data patterns: `references/sensitive-data-patterns.md`
