# Usage / Rate-limit Panel — Design Spec

Date: 2026-06-12
Status: approved (brainstorm session with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board` (board tool feature).

## Purpose

The owner wants visibility into their AI plan usage on the board to control token
spend. The board runs headless `claude` jobs on a Claude subscription (flat plan,
no API key). This surfaces the usage signals the board CAN observe from each job's
stream — the plan's rate-limit status + reset, and the token/cost the board's own
jobs consumed — without claiming data it cannot get.

## Feasibility (what is and isn't available)

Investigated the actual data sources:

- **NOT available:** a precise "X% of the Max plan's weekly/monthly limit used".
  `claude` has no usage/billing subcommand and there is no local file exposing the
  subscription's aggregate limit/remaining. The panel will NOT claim this.
- **Available from each job's `--output-format stream-json` stream:**
  - `rate_limit_event` lines carry `rate_limit_info`:
    `{ status, rateLimitType (e.g. "five_hour"), resetsAt (unix seconds),
    overageStatus, isUsingOverage }`. This is the real plan rate-limit signal.
  - The terminal `result` event carries cumulative `usage`
    (`input_tokens`, `output_tokens`, `cache_read_input_tokens`,
    `cache_creation_input_tokens`) and `total_cost_usd`.
- **`total_cost_usd` is informational** (an API-pricing proxy), not real billing —
  the subscription is flat. The panel labels it as such; token counts are the
  meaningful control metric.

Scope limit: the board only sees its OWN jobs' streams, so consumption totals are
"what the board consumed", not the whole account.

## Data capture

### Rate-limit snapshot (runner)
- `events.ts` `normalizeLine` gains a `rate_limit` ConsoleEvent kind parsed from a
  `{ type: 'rate_limit_event', rate_limit_info: {...} }` line.
- The runner keeps `lastRateLimit?: RateLimitSnapshot` updated whenever a job stream
  yields a `rate_limit` event (the line processor already iterates normalized events
  for the console hub — hook the capture there).
- Persist `lastRateLimit` to `data/usage.json` (best-effort, like `auto.json`) so it
  survives a restart; `resetsAt` is absolute so a loaded snapshot stays meaningful.
  Load it in the constructor (try/catch → undefined).

```ts
interface RateLimitSnapshot {
  status: string            // "allowed" | "limited" | ...
  rateLimitType: string     // "five_hour" | ...
  resetsAt: number          // unix seconds
  isUsingOverage: boolean
  capturedAt: string        // ISO, when the board last saw it
}
```

### Per-job usage (runner + Job)
- `Job` gains optional `usage?: JobUsage` and `costUsd?: number`:

```ts
interface JobUsage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number }
```

- When a job stream yields the `result` event, capture cumulative `usage` + cost
  onto the `Job` (in the same place the runner reads `total_cost_usd` today) and
  `persist(job)` so it lands in `data/jobs/<id>.json`. Interrupted/failed jobs
  without a `result` simply have no `usage` (excluded from totals).

## Aggregation — `GET /api/usage`

Returns:

```ts
interface UsageReport {
  rateLimit: RateLimitSnapshot | null
  windows: {
    fiveHour: UsageBucket   // jobs that ended within the current rate-limit window
    today: UsageBucket      // jobs that ended today (server local date)
    total: UsageBucket      // all jobs with usage
  }
}
interface UsageBucket { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; costUsd: number; jobs: number }
```

- Computed by scanning the runner's jobs (which carry `usage`/`costUsd`/`endedAt`).
- `fiveHour` window start = `rateLimit.resetsAt - 5h` when a `five_hour` snapshot is
  present, else "last 5 hours from now"; a job counts if its `endedAt` ≥ window
  start. `today` = jobs whose `endedAt` is the server's current date. `total` = all
  jobs with `usage`.
- Buckets sum the four token fields + `costUsd` and count jobs.

The route lives next to the other read routes; it reads `runner` state (no new
store concept). `board_update` already broadcasts on job completion, so the UI
re-fetches `/api/usage` then.

## UI — `UsagePanel`

A compact card in the header row (alongside `KpiStrip` / `AutoControl` / `SettingsPanel`):

- **Rate-limit line:** a status pill — `allowed` → ok token, anything else → danger
  token (e.g. "limited", overage) — plus the window label (`5h`) and a **"Reset sau
  HH:MM:SS"** countdown to `resetsAt` that ticks client-side (a 1s interval). If
  `isUsingOverage`, show an "overage" marker. If `rateLimit` is null (no job seen
  yet), show "chưa có dữ liệu".
- **Consumption line:** `Cửa sổ 5h: {in+out} token · ${cost} (tham khảo)` with a
  smaller secondary line `Hôm nay {…} · Tổng {…}`. Token display sums input+output
  (cache shown in a tooltip/title). `$` carries a title noting it is informational,
  not real billing.
- Fetches `GET /api/usage` on mount, on `board_update`, and the countdown re-renders
  locally each second. Tokens-only per the Aurora design system; numbers formatted
  compactly (e.g. `1.2M`, `340k`).
- `api.ts`: `getUsage()`.
- `DESIGN_SYSTEM.md`: note the usage panel + the informational-cost caveat.

## Error handling

- No `rate_limit_event` ever seen → `rateLimit: null`; the panel shows "chưa có dữ
  liệu" and only the consumption totals (which may be all-zero on a fresh board).
- `usage.json` missing/corrupt → `lastRateLimit` undefined; never crashes boot.
- A malformed `rate_limit_event`/`result` line → skipped by the try/catch in
  normalize/capture; does not break the job.
- Token-count fields absent on an older job file → treated as 0.

## Testing

- `events.ts` (vitest): a `rate_limit_event` line normalizes to a `rate_limit`
  event with the parsed fields; a `result` line still yields the existing
  `turn_result` (unchanged) and exposes usage for capture.
- Runner: a job whose stream includes a `result` with `usage` persists `usage` +
  `costUsd` on the Job; `lastRateLimit` updates from a `rate_limit` event and
  persists to/loads from `usage.json`; aggregation buckets (fiveHour/today/total)
  sum correctly and respect the window start; interrupted jobs (no usage) are
  excluded.
- Routes: `GET /api/usage` shape — `rateLimit` (or null) + three buckets with the
  token/cost/jobs fields.
- UI: not unit-tested beyond types; typecheck + `vite build ui` + grep-gate green.
- Full suite + typecheck stay green.

## Out of scope

- Account-wide usage across non-board `claude` sessions or claude.ai.
- A precise plan limit / percent-remaining (not locally available).
- Hard enforcement (blocking dispatch at a token budget) — display only. (`maxAuto`
  + concurrency remain the throttles; a budget gate could be a later feature.)
- Historical charts / time-series (single current snapshot + three roll-ups only).
