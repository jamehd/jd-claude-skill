# Cross-reference: static + runtime

When both layers run, correlate their findings before writing the report. This is the reason the two layers live in one skill: each layer alone gives half the picture, and the correlation is what makes a finding actionable with confidence.

Match findings by `(table, column)`. The static layer reports in Prisma terms (model, field); map them to physical names through `@@map`/`@map` before matching.

## Rules

| Static finding | Runtime finding on same table/column | Result |
|----------------|--------------------------------------|--------|
| Missing FK index (P1) | High sequential scans / FK with no index (perf, schema 3.x) | Merge. Raise severity. Attach runtime scan counts as evidence. Fix in schema. |
| Missing FK index (P1) | No matching runtime signal (cold table) | Keep as static. Severity stays at the static default. |
| Declared index exists | Unused index (perf) | Merge. The schema declares an index production never scans — question or drop it, fix in schema. |
| Timezone-naive timestamps (P2) | `timestamp without time zone` (schema 3.3) | Merge into one systemic finding. Fix in schema (`@db.Timestamptz`), not as a bare `ALTER`. |
| Lossy/unbounded type (P4) | Suboptimal datatype (schema 3.3) | Merge. Fix in schema. |
| Soft-delete without partial index (P3) | Low cache hit / heavy scans on the live-row query | Raise to the runtime severity. Fix is a raw-SQL partial index. |
| (none) | Bloat, vacuum age, config, replication, connections | Runtime only. These have no schema representation. Keep as runtime. |
| Nullable-but-required FK (P6) | NULLs present in that column | Confirm the rule, then keep with runtime evidence. |

## Reporting

- A merged finding is labeled `[static + runtime]` and carries both the schema lines and the runtime numbers.
- A single-layer finding is labeled `[static]` or `[runtime]`.
- The executive summary highlights merged findings first: they are the ones confirmed from two independent angles, so they carry the least doubt.

## When only one layer ran

No correlation. Label every finding with its single source layer. Do not imply runtime confirmation for a static-only run, or schema context for a runtime-only run.
