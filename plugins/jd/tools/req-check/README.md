# req-check

Zero-dependency drift checker: fails when code mapped to a component changed
without a matching requirement. Run with Node ≥18, no build, no install.

## The `Req:` contract

Every behavior-changing commit carries a git trailer:

```
Req: API-R3                               # touches an existing requirement
Req: API-R9                               # NEW requirement — add its heading to the doc in this same change
Req: API-R3, WEB-R5                       # multiple
Req: none — refactor, no behavior change  # explicit exemption, reason REQUIRED
```

## Usage

```bash
node cli.mjs --range origin/main..HEAD   # hard check over a commit range (pre-push, CI)
node cli.mjs --worktree --advisory       # heuristic reminder, never blocks (Stop hook)
```

Exits 0 silently outside a git repository and in any repo without the component map file.

## Per-project config

Settings come from `<repo>/project-board/project.yaml` (all optional, see
`shared/project-config.md`):

```yaml
requirements:
  dir: docs/requirements          # requirements root
  subdirs: [components, capabilities]
  map: .component-map.json        # relative to dir
  id_pattern: '[A-Z]{2,6}-R\d+'    # requirement ID regex
hooks:
  req_check: true                 # false disables the Stop hook
```

The component map maps path globs to a requirements doc and its ID prefixes; see
`component-map.example.json`. The Stop hook prints advisory output as a JSON
`systemMessage` (`--system-message`) and never blocks.

## Tests

```bash
node --test lib/*.test.mjs cli.test.mjs ../../shared/requirements.test.mjs
```
