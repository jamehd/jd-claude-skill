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
node <plugin>/tools/flow-eval/run.mjs --project <repo> [--old <ref>] [--new WORKTREE] [--max-cost-usd 15] [--runs 3]
```

- `--old` defaults to the last released version; `--new WORKTREE` uses the working copy.
- Runs use `--ablation none`.
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
   wsl.exe -d Ubuntu-24.04 -- claude plugin eval /mnt/c/.../staging/jd --json <out>.json --max-cost-usd <usd> --threshold 0 --trust-plugin --no-publish
   ```

`suite.plugins[]` in `aggregate-result.json` then lists both `jd` and `superpowers` with their versions, and the with-arm session sees superpowers skills under their `superpowers:` namespace. The no-plugin baseline arm (default `--ablation with-without`) runs with neither plugin.
