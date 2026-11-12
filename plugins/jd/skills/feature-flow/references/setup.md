# Setup — project without `project-board/project.yaml`

Use when any feature-flow command runs in a repository that has no `project-board/project.yaml`.

1. Tell the person the project is not set up for feature flow and **offer to create** the files.
   Do nothing else until they agree.
2. On agreement:
   - Copy `templates/project.yaml` to `project-board/project.yaml`.
   - Create the folders named by `paths.features` and `paths.owner_actions`.
   - Create `paths.status` from `templates/status.md` and `paths.scenarios` from
     `templates/scenarios.md`.
   - Board folders (`tasks/`, `status/`, `jobs/`), the board `.gitignore` entries and the board
     server itself are set up by the `jd:project-board` skill; point the person to it instead of
     repeating its steps here.
3. Fill values you can infer from the repository (test, lint and dev commands, main branch, remote,
   design-system file). Mark actions that do not exist yet with `pending: true`.
4. Ask the person only for what cannot be inferred: the owner's language (`language.owner`, left
   empty in the template until answered), the acceptance environment, forbidden actions, and
   whether finished features go through a pull request or are merged by the AI after acceptance
   (`git.integration`). One question at a time.
5. Ask whether existing requirements should become feature stubs (`idea`, with `order` and
   `needs`). Create them if yes.
6. Finish with `/jd:status`.
