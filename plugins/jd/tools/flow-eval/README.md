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
