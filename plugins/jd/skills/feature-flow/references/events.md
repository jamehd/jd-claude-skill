# Flow events

The `flow-view` pane (`/flow`) and the status line draw the timeline from
`<paths.data>/flow-events.jsonl`. It holds one JSON line per event and new lines are only
ever appended. Every event is written by the tool, never by hand, so the timestamps are real:

```bash
node <plugin>/tools/flow-event/event.mjs --repo <repository root> \
  --feature <ID> --phase <phase> --event <event> [--step "<text>"] [--note "<text>"]
```

`<plugin>` is two folders above this skill. A failing call is reported in the reply and never
stops the flow. The file is state like the others: commit it with the feature's other files.

| Phase | Covers |
|---|---|
| `brief` | `feature.md`: drafting the brief and scenarios, and owner corrections |
| `build` | `build.md` steps 1-6 and 8-10 |
| `verify` | `build.md` step 7, and step 9 when it repeats step 7 |
| `acceptance` | waiting for the owner's verdict, the PR and a long soak |
| `rework` | a verdict with notes, until the rework build starts |
| `stopped` | a stop report is open |
| `done` | the feature is `done` |

| Event | When |
|---|---|
| `start` | a phase or a step starts (`--step "build 5"`, `--step "T-012"`) |
| `pass` / `fail` | a task, a review or a verification ends; `fail` carries the counter in `--note` |
| `wait` | the flow waits for a person (Gate A, Gate B, PR merge, an owner action) |
| `resume` | a person answered and the flow continues |
| `stop` | a stop report was written; `--note` holds its reason slug |
| `done` | the feature was accepted and integrated |

The pane draws the full roadmap (brief, Gate A, build steps 1-10, Gate B, done), so `--step`
follows fixed spellings: `build <n>` for each step of `build.md` (a fix inside step 7 keeps
`build 7`), the task ID (`T-012`) for task events in step 5, and no step for `brief`,
`acceptance` and `done` events.

Write an event at each of these points, in the same step that updates the status file:

- Every time "Current step" changes: `start` with that step.
- Every status change in `feature.md`: `start` of the matching phase (`stopped` writes `stop`;
  `done` writes `done`).
- Every task in `build.md` step 5: `start` when it is set `ai_running`, `pass` when it is set
  `review`, `fail` on each counted attempt.
- Gate A and Gate B: `wait` when the reply asks the owner, `resume` when the explicit answer
  arrives.
