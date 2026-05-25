# Stack Detection Rules

The skill detects which stacks are present in the target project. Detection determines which `patterns/<stack>/` folders run.

## Rules (evaluated in order)

### Node.js
- File exists: `package.json`
- -> Mark stack `nodejs` present

#### Node.js framework sub-detection (from `package.json` `dependencies` + `devDependencies`)
- `@nestjs/*` -> `nodejs/nestjs`
- `express` -> `nodejs/express`
- `fastify` -> `nodejs/fastify`
- (Multiple may apply; all matching pattern files run.)

### Go
- File exists: `go.mod`
- -> Mark stack `go` present

### Frontend
- `package.json` deps include `react` or `react-dom` -> `frontend/react`
- `package.json` deps include `vue` -> `frontend/vue`
- `package.json` deps include `next` -> `frontend/nextjs` (also implies React)
- `package.json` deps include `@vue/cli-service` or `nuxt` -> `frontend/vue` (Nuxt implies Vue)

### Monorepo
- `package.json` contains `"workspaces"` field -> mark as monorepo
- For each workspace path, run detection recursively
- Report per-workspace + aggregate

## Output format

```json
{
  "stacks": [
    { "id": "nodejs", "frameworks": ["nestjs"] },
    { "id": "frontend", "frameworks": ["react"] }
  ],
  "monorepo": false,
  "workspaces": []
}
```

For monorepo:

```json
{
  "stacks": [],
  "monorepo": true,
  "workspaces": [
    { "path": "packages/api", "stacks": [{ "id": "nodejs", "frameworks": ["nestjs"] }] },
    { "path": "packages/web", "stacks": [{ "id": "frontend", "frameworks": ["react"] }] }
  ]
}
```

## Patterns folder mapping

| Detected stack | Pattern folder run |
|----------------|--------------------|
| `nodejs` | `patterns/nodejs/01-*`, `02-*`, `03-*` (always) |
| `nodejs/express` | `patterns/nodejs/04-express.md` |
| `nodejs/nestjs` | `patterns/nodejs/05-nestjs.md` |
| `nodejs/fastify` | `patterns/nodejs/06-fastify.md` |
| `go` | `patterns/go/*` |
| `frontend/react` | `patterns/frontend/01-*`, `04-*`, `05-*` |
| `frontend/vue` | `patterns/frontend/02-*`, `04-*`, `05-*` |
| `frontend/nextjs` | `patterns/frontend/01-*`, `03-*`, `04-*`, `05-*` |
| (any stack) | `patterns/_common/*` always run |

## No-stack fallback

If NO supported stack is detected:
- Run `patterns/_common/*` only
- Include warning in report: "No supported stack detected (Node.js, Go, or frontend). Stack-specific patterns skipped. Detected: <list any files seen>."
