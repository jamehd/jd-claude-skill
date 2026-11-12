# project.yaml reference

`<repo>/project-board/project.yaml` is the single per-project config read by every jd skill and tool.
Node code uses `project-config.mjs` (`loadProjectConfig`, `requirementIdRegex`, `resolveMainBranch`).
Skills that read the YAML directly apply the defaults below.

Behaviour: a missing file yields all defaults (`found: false`); sections may be partial; user values
override defaults per key (lists replace, mappings merge); unknown keys are kept. A wrong type for a
key that has a default, invalid YAML, or an invalid `requirements.id_pattern` throws
`ProjectConfigError` with `file` and `key`. Hooks swallow the error; the board refuses to start.

Required by: `feature-flow`, `plan-batch`, board. Everything else runs on defaults.

| Key | Default | Used by |
|---|---|---|
| `project` | repo folder name | prompts, UI title |
| `git.main` | `origin/HEAD` target, else `main` (`resolveMainBranch`) | board, auto, feature-flow |
| `git.remote_name` | `origin` | board |
| `git.integration` | `pull-request` (or `merge-after-acceptance`) | auto, feature-flow, board |
| `git.branch_pattern` | `feat/<ID>-<slug>` | auto, feature-flow |
| `tasks.id_prefix` | `TASK` | board, plan-batch, feature-flow |
| `requirements.dir` | `docs/requirements` | board, req-check, Stop hook |
| `requirements.subdirs` | `[components, capabilities]` | board, req-check, shared lib |
| `requirements.map` | `.component-map.json` (inside `requirements.dir`) | req-check, Stop hook |
| `requirements.id_pattern` | `[A-Z]{2,6}-R\d+` | shared lib, board, req-check |
| `requirements.headings.description` | `Description` | candidates parser, rescan prompt |
| `requirements.headings.acceptance` | `Acceptance criteria` | candidates parser, rescan prompt |
| `e2e.host` / `e2e.note` / `e2e.contracts` | empty string / empty string / `[]` | board routing, plan-batch, auto |
| `audits.always` | `[jd:error-audit]` | auto, feature-flow, board prompt |
| `audits.when_ui` | `[jd:ui-design-audit]` | auto, feature-flow, board prompt |
| `audits.when_schema` | `[jd:db-audit]` | auto, feature-flow, board prompt |
| `audits.ui_design_source` / `design_system` | none | auto, ui-design-audit |
| `ui_dirs` | none (detected) | ui-design-audit |
| `language.owner` | none (asked at setup) | all replies, board text |
| `language.docs` | `en` | docs, rescan output |
| `models.large_task` / `models.small_task` | `opus` / `sonnet` | auto, feature-flow |
| `limits.fix_attempts` / `rework_rounds` / `features_active` | `3` / `2` / `1` | feature-flow |
| `board.port` | `4400` | board |
| `board.data_dir` | `project-board/data` | board |
| `board.branch_prefix` | `board/` | board |
| `hooks.req_check` | `true` | hooks |
| `hooks.conventions` | `true` | hooks |

Other keys (`paths`, `actions`, `acceptance`, `git.remote`, `git.commit_footer`) are feature-flow
settings with no defaults; see the feature-flow `templates/project.yaml`.
