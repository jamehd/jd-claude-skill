# /jd:status

Read `project.yaml`, `paths.status`, every `paths.features/*/feature.md` and
`paths.owner_actions`. Change nothing. Reply in `language.owner`, short:

1. Active now: the feature in `building` or `acceptance`, its current step, counters (task fix
   attempts, `featureFixAttempts`, `reworkRound`).
2. Waiting for the owner: briefs in `brief-review`, features in `acceptance`, stop reports, owner
   actions with `status: waiting`.
3. Next in queue: up to three features by `order` with any unmet `needs`.
4. Done: count and the latest three.
5. One recommended next action, as a command the owner can type.
