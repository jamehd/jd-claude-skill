# flow-eval

Replays a project's private eval cases against two versions of the `jd` plugin and compares the scores. `stage.mjs` builds the throwaway copy each run uses; `run.mjs` drives `claude plugin eval` through WSL.

## Case layout

Cases live in the project, never in this repo: `<project>/project-board/evals/<case-name>/`.

```
<case-name>/
  prompt.md         the task given to the agent
  case.yaml         optional settings; stage.mjs writes the `plugins:` entry
  graders/*.md      one grader per correction or known finding
  ground-truth.md   what a correct result looks like (kept beside the case)
```

- One grader per correction the owner made or known finding; name it after the finding.
- Noise graders, which catch false positives and padding, are named `noise-*.md`.
- Nothing from a project's cases is committed under `plugins/jd/`.

## Running

```bash
node <plugin>/tools/flow-eval/run.mjs --project <repo> [--old <ref>] [--new WORKTREE] [--plugin-repo <path>] [--cases <dir>] [--max-cost-usd 25] [--runs 3] [--model <name>]
```

- `--old` defaults to `main`; `--new WORKTREE` uses the working copy. Refs are resolved to a commit sha for the history key; a `WORKTREE` side always runs.
- `--plugin-repo` must be a checkout of the plugin repo; the default (the repo containing this script) works only when run from that checkout.
- `--cases <dir>` overrides the case folder (default `<project>/project-board/evals`).
- A case is `incomplete` when it errored, has no scored grader, finished fewer than `--runs` runs, or never ran (it is in the case folder but missing from a result). Cases that finished every run are compared even when the cost cap stopped the run early.
- `--max-cost-usd` defaults to 25 per version; ten cases at three runs on sonnet cost about $19.
- The history key includes `--runs`; a result recorded with another run count is not reused.
- A case is `worse` (or `better`) when its score moves by 0.34 or more, two runs in three for a one-finding case. A single flipped run is normal noise: it shows in Gained/Lost but keeps the verdict `same`. Noise graders never appear in Gained/Lost.
- Exit codes: `0` no regression, `1` at least one case is `worse`, `3` no case is worse but at least one is `incomplete`, `2` error.
- A run may take up to 6 hours. On timeout or Ctrl-C the staged copy can be left in the system temp folder (`%TEMP%\jd-stage-*`); delete it.
- Runs use `--ablation none`, `--scaffold` (cases build their workspace with `context.scaffold_script`) and `--allow-tools Write Edit`. Bash is never granted: WSL has no sandbox tools, so a Bash grant makes runs be refused.
- `--model <name>` is passed through to `claude plugin eval` when given (e.g. `--model sonnet`).
- An empty `cases` array in the result means the cases failed to load; check the case folder and `case.yaml`.
- Staging fails before any paid run when superpowers is missing from `~/.claude/plugins/installed_plugins.json`.

To stage only: `node <plugin>/tools/flow-eval/stage.mjs --repo <plugin repo> --cases <cases dir> [--ref <git ref|WORKTREE>]`.

## Loading superpowers

`claude plugin eval` only loads `plugins:` entries that sit inside the containment root (the plugin directory passed as the target). An absolute path to the installed superpowers (`~/.claude/plugins/cache/...`) is rejected with `outside the containment root`, so the case fails to load and nothing runs.

The method that works:

1. Stage a copy of `plugins/jd` in a scratch directory, e.g. `<staging>/jd/`.
2. Copy the installed superpowers (`installPath` of `superpowers@claude-plugins-official` in `~/.claude/plugins/installed_plugins.json`) to `<staging>/jd/.eval-deps/superpowers/`. This copy lives only in staging, never in the repo.
3. List both plugins in each case's `case.yaml`, relative to the case directory:

   ```yaml
   plugins:
     - "../.."
     - "../../.eval-deps/superpowers"
   ```

4. Run from Windows through WSL with `/mnt/<drive>/...` paths:

   ```bash
   wsl.exe -d Ubuntu-24.04 --exec bash -lc '<claude plugin eval /mnt/c/.../staging/jd --json <out>.json --output-dir <out dir> --scaffold --allow-tools Write Edit --ablation none --threshold 0 --max-cost-usd <usd> --runs <n> --trust-plugin --no-publish>'
   ```

`suite.plugins[]` in `aggregate-result.json` then lists both `jd` and `superpowers` with their versions, and the with-arm session sees superpowers skills under their `superpowers:` namespace.
