# Reason categories

Every brief correction, rework note and stop gets exactly one slug. Metrics group by it.

| Slug | Meaning |
|---|---|
| `missed-requirement` | The brief left out something the owner needed |
| `wrong-scope` | The brief covered too much, too little or the wrong feature |
| `wrong-assumption` | The AI assumed something the owner did not intend |
| `quality-budget` | A crash, leak or performance budget was missing or wrong |
| `ux-wording` | Labels, messages or layout |
| `defect` | The build does not do what the accepted scenario says |
| `environment` | Missing tool, credential, service or data |
| `other` | None of the above; say why in the note |

## Turning a correction into an eval case

A new owner correction or audit finding that a future build should not repeat becomes an eval case under `project-board/evals/<case-name>/`: a `prompt.md`, one grader per correction or finding, and a `ground-truth.md`. Layout and run command: `<plugin>/tools/flow-eval/README.md`. Cases stay in the project repository, never in the plugin.
