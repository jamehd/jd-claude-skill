# Settings Panel — Design Spec

Date: 2026-06-12
Status: approved (brainstorm session with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board` (board tool feature).

## Purpose

Concurrency (`BOARD_MAX_JOBS`) is env-only: changing it needs a board restart,
which interrupts running jobs, and the value is not persisted. The owner wants to
tune operational knobs from the UI without a restart. This adds a Settings panel
that edits concurrency, `maxAuto`, and the auto failure threshold at runtime, all
persisted so they survive a restart.

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Scope | One consolidated Settings panel: `maxConcurrent` (parallel jobs), `maxAuto`, `failureThreshold`. Model / claudeBin / tick interval are out of scope. |
| Runtime vs restart | All three apply at runtime — no restart. Raising `maxConcurrent` immediately pumps the queue; lowering it lets running jobs finish and only caps new dispatch. |
| Persistence | Extend the existing `auto.json` to also hold `maxConcurrent`. It becomes the runner-settings file. |
| Env precedence | On boot `maxConcurrent = persisted ?? config.maxConcurrentJobs` (the `BOARD_MAX_JOBS` env, default 1). A UI-set value persists and overrides the env on subsequent boots — solving "env not persisted". |
| API | Extend `POST /api/auto` to accept `maxConcurrent` and `failureThreshold` (already accepts `enabled`, `maxAuto`). `GET /api/auto` already returns `maxConcurrent`; add `failureThreshold` to `AutoState`. No new route. |
| UI | A ⚙ gear button in the header opens a Settings popover with three number inputs + Save. `AutoControl` slims to the toggle + status (+ resume); the `maxAuto` input moves into Settings. |
| Bounds | `maxConcurrent` 1–8 (footgun guard on a 6-core box), `maxAuto` ≥ 1, `failureThreshold` ≥ 1. Out-of-range → 400. |

## Runner changes

`JobRunner` currently reads the immutable `this.deps.maxConcurrent` in `pump()` and
`autoTick()`. Make the limit a mutable field:

- Add `private maxConcurrent: number`, seeded in the constructor as
  `persisted maxConcurrent ?? deps.maxConcurrent`. Replace `this.deps.maxConcurrent`
  reads in `pump()`/`autoTick()`/`getAuto()` with `this.maxConcurrent`.
- `setMaxConcurrent(n)`: clamp/validate (caller validates 1–8), set the field,
  persist, then `pump()` so a raised limit starts queued jobs immediately. Lowering
  never cancels running jobs.
- `loadAuto()` also restores `maxConcurrent` (if present and ≥ 1). `persistAuto()`
  also writes `maxConcurrent`. The constructor seeds the field from the loaded value
  or falls back to `deps.maxConcurrent`.

`auto.json` shape becomes:

```jsonc
{ "enabled": false, "maxAuto": 10, "failureThreshold": 3, "maxConcurrent": 3 }
```

`setAuto({ enabled?, maxAuto?, maxConcurrent?, failureThreshold? })` handles all
four. `maxConcurrent`/`failureThreshold` changes persist and (for `maxConcurrent`)
re-pump. `failureThreshold` (≥ 1) updates the auto pause threshold live.

`AutoState` gains `failureThreshold: number` (already carries `maxConcurrent`).

## API

| Route | Behavior |
|---|---|
| `GET /api/auto` | Returns `AutoState` now including `failureThreshold`. |
| `POST /api/auto` | Body `{ enabled?, maxAuto?, maxConcurrent?, failureThreshold? }`. Validates `maxConcurrent` ∈ [1,8], `maxAuto` ≥ 1, `failureThreshold` ≥ 1 → else 400. Applies via `runner.setAuto(...)`, persists, returns the new `AutoState`, broadcasts `board_update`. |

`maxConcurrent` outside [1,8] or `failureThreshold < 1` → 400 with a clear message
(matching the existing `maxAuto < 1` → 400 path).

## UI

- **`SettingsPanel.tsx`** (new): a ⚙ button in the header; clicking opens a popover
  (click-outside / Esc closes, like the drawer) with three labelled number inputs —
  *Số task song song* (min 1, max 8), *maxAuto* (min 1), *Ngưỡng tạm dừng auto*
  (min 1) — seeded from `GET /api/auto`, and a **Lưu** button that calls
  `api.setAuto({ maxConcurrent, maxAuto, failureThreshold })` and shows a saved/error
  state. Tokens-only per the Aurora design system.
- **`AutoControl.tsx`**: remove the `maxAuto` number input; keep the Bật/Tắt toggle,
  the status label (`Đang chạy {dispatched}/{maxAuto}` / `Tạm dừng — {reason}`), and
  the Tiếp tục (resume) button. It still reads `GET /api/auto` and re-fetches on
  `board_update`.
- **`App.tsx`**: mount `<SettingsPanel />` in the header next to `AutoControl`.
- **`api.ts`**: `setAuto` already exists; widen its patch type to
  `{ enabled?, maxAuto?, maxConcurrent?, failureThreshold? }`.
- **`DESIGN_SYSTEM.md`**: note the gear/Settings popover pattern.

## Error handling

- Out-of-range values → 400; the panel surfaces the message and keeps the old value.
- Lowering `maxConcurrent` below the current running count never kills jobs; the
  panel may note "áp dụng cho job mới" when relevant (optional copy).
- `auto.json` missing/corrupt → defaults as today; `maxConcurrent` falls back to the
  env/default. Never crashes boot.

## Testing

- Runner (vitest, fake spawn): `setMaxConcurrent` raises the limit and a queued job
  starts on the same tick (pump); lowering caps new dispatch but leaves running jobs;
  `getAuto().maxConcurrent` reflects the runtime value; `loadAuto` restores a
  persisted `maxConcurrent` over the `deps` default; `persistAuto` writes all four
  keys; `setAuto` accepts `maxConcurrent`/`failureThreshold`; `failureThreshold`
  change affects the pause point.
- Routes: `POST /api/auto` sets `maxConcurrent`/`failureThreshold`; rejects
  `maxConcurrent` 0 and 9 (→ 400) and `failureThreshold` 0 (→ 400); `GET` returns
  `failureThreshold`.
- UI: not unit-tested beyond types; typecheck + `vite build ui` + grep-gate green.
- Full suite + typecheck stay green.

## Out of scope

- claude model / claudeBin / tick-interval configuration.
- A general key/value settings store (only these three runner knobs).
- Per-task overrides of concurrency.
- Changing the review/merge gate.
