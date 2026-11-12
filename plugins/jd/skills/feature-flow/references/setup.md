# Setup — project without `project-board/project.yaml`

Use when any feature-flow command runs in a repository that has no `project-board/project.yaml`.

1. Tell the person the project is not set up for feature flow and **offer to create** the files.
   Do nothing else until they agree.
2. On agreement:
   - Copy `templates/project.yaml` to `project-board/project.yaml`.
   - Create the folders named by `paths.features`, `paths.tasks`, `paths.owner_actions`.
   - Create `paths.status` from `templates/status.md` and `paths.scenarios` from
     `templates/scenarios.md`.
   - Add `jobs/` and `auto.json` to `project-board/data/.gitignore`; add `.board-worktrees/` to the
     root `.gitignore`.
3. Fill values you can infer from the repository (test, lint and dev commands, main branch, remote,
   design-system file). Mark actions that do not exist yet with `pending: true`.
4. Ask the person only for what cannot be inferred: the owner's language, the acceptance
   environment, forbidden actions. One question at a time.
5. Ask whether existing requirements should become feature stubs (`idea`, with `order` and
   `needs`). Create them if yes.
6. Finish with `/jd:status`.
