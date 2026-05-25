# Walkthrough: Running error-audit on Your Project

## 1. Prerequisites
- ripgrep installed (`rg --version`)
- A project to audit (Node.js, Go, or Frontend)

## 2. Invoke the skill
In Claude Code: "audit error handling in this project"

## 3. The first time (no config)
The skill will:
1. Detect your stacks (e.g., `nodejs/nestjs`, `frontend/react`)
2. Auto-detect critical paths (e.g., `src/payment/**`, `src/auth/**`)
3. Show you the list and ask: "Look right?"

Your options:
- Confirm → audit proceeds
- Override paths → say which to add/remove
- Save config → creates `error-audit.config.yaml` so next time skips this step

## 4. Reading the output
After ~30 seconds (depending on codebase size):
- Open `error-audit-report/<timestamp>/EXECUTIVE-SUMMARY.md` first (1 page)
- Then `AUDIT-REPORT.md` for full findings
- For each Critical, open the matching file in `fixes-critical/`

## 5. Fixing findings
Each fix file has:
- Before / After code snippet
- Why this matters
- Manual apply steps (you apply the fix; skill never auto-modifies)
- Verification command
- Links to reference docs

## 6. Re-running
After fixing some findings:
```
"audit error handling again"
```
Skill creates a new timestamped folder. Compare against previous to track progress.

## 7. Adding your own patterns
See `sample-report.md` for the format. Drop new pattern files into `patterns/<stack>/` and they auto-run.

## 8. Common questions

**Q: Skill flagged something that is not actually a bug. What do I do?**
A: Add a `skip_patterns: [pattern_id]` entry in your config, with a comment explaining why.

**Q: Skill missed something. Can I add a pattern?**
A: Yes - add a `.md` file to `patterns/<stack>/` following the format. It will be auto-discovered.

**Q: Can I run on a specific subdirectory only?**
A: Configure `include_paths` in `error-audit.config.yaml`.

**Q: Does the skill modify my code?**
A: No. Read-only. It generates a report + fix files (Markdown). You apply fixes manually.

**Q: Does the skill send my code anywhere?**
A: No. All analysis is local via `ripgrep`. No network calls in v1.
