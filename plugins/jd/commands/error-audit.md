---
description: Audit error handling across code patterns, logging, notification routing, and user-facing messages — produces severity-classified Markdown report + per-finding fix files. Supports Node.js/TypeScript, Go, and Frontend (React/Vue/Next.js).
argument-hint: "[optional: scope path, stack filter (nodejs|go|frontend), or 'dry-run' to list checks without running]"
---

# Error Handling Audit

Invoke the `jd:error-audit` skill to audit error handling across four dimensions (code patterns, observability, notification routing, user messaging).

**Arguments:** $ARGUMENTS

Steps:
1. Load the `jd:error-audit` skill via the Skill tool.
2. If `$ARGUMENTS` is empty:
   - Look for `error-audit.config.yaml` at project root; if present, use it and skip the confirmation gate.
   - Otherwise, run stack detection + critical-path detection and present the result for confirmation before scanning.
3. If `$ARGUMENTS` is a directory path, restrict the scan scope to that path.
4. If `$ARGUMENTS` matches `nodejs`, `go`, or `frontend`, restrict pattern execution to that stack's `patterns/<stack>/*` (plus `_common/*`).
5. If `$ARGUMENTS` is `dry-run`, list the patterns that would run + estimated scan size; do NOT execute.
6. After scanning, generate the timestamped report folder (`error-audit-report/<YYYY-MM-DD-HH-MM-SS>/`) with `AUDIT-REPORT.md`, `EXECUTIVE-SUMMARY.md`, per-severity `fixes-*/` folders, and `raw/`.
7. Print the severity counts + path to the report at the end.

Read-only. Do not modify source code. Do not call external APIs. If `ripgrep` is missing, abort with install instructions.
