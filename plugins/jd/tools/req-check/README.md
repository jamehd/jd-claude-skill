# req-check

Zero-dependency drift checker: fails when code mapped to a component changed
without a matching requirement. Run with Node ≥18, no build, no install.

## The `Req:` contract

Every behavior-changing commit carries a git trailer:

```
Req: CAFE-R3                              # touches an existing requirement
Req: CAFE-R9                              # NEW requirement — add its heading to the doc in this same change
Req: CAFE-R3, DL-R5                       # multiple
Req: none — refactor, no behavior change  # explicit exemption, reason REQUIRED
```

## Usage

```bash
node cli.mjs --range origin/main..HEAD   # hard check over a commit range (pre-push, CI)
node cli.mjs --worktree --advisory       # heuristic reminder, never blocks (Stop hook)
```

Exits 0 silently in any repo without `docs/requirements/.component-map.json`.

## Per-project config

`docs/requirements/.component-map.json` maps path globs to a requirements doc and
its ID prefixes. See the consuming project for an example.

## Tests

```bash
node --test lib/*.test.mjs cli.test.mjs ../../shared/requirements.test.mjs
```
