# PostgreSQL Audit Report (SAMPLE)

**Database:** `production_db` @ `db-prod-01.example.com:5432`
**PostgreSQL Version:** 15.4
**Audit Date:** 2026-05-25 14:30:22 UTC
**Audited By:** Claude Code (db-audit skill, runtime/postgres layer)
**DB Size:** 247 GB
**Tables:** 142
**Connection User:** `audit_readonly`

---

## Executive Summary

| Severity | Count | Action SLA |
|----------|-------|-----------|
| Critical | 3 | Immediate (<24h) |
| High     | 12 | <1 week |
| Medium   | 24 | <1 month |
| Low      | 17 | Backlog |

**Top 3 risks:**
1. Public schema CREATE for PUBLIC (CVE-2018-1058) - any logged-in user can hijack queries via search_path attack
2. Orphaned replication slot `analytics_slot` retaining 47 GB WAL - disk fill imminent
3. `transactions_id_seq` at 92% of int4 max - sequence wraparound imminent

**Quick wins (low effort, high impact):**
- Add 5 missing FK indexes (estimated 60% reduction on `order_items` queries)
- Drop 8 unused indexes (free 2.3 GB)
- Run VACUUM FULL on `audit_logs` (bloat 73%, will reclaim 8 GB)

---

## CRITICAL Findings

### C1. Public schema is writable by PUBLIC role
**Category:** Security
**Reference:** CVE-2018-1058
**Affected:** entire database

**Evidence:**
```
 schema_name | grantee | public_can_create | public_can_use
-------------+---------+-------------------+----------------
 public      | PUBLIC  | t                 | t
```

**Impact:** Any logged-in user can create objects in `public` schema, enabling search_path attacks where malicious functions hijack legitimate queries from other users.

**Recommendation:** Revoke CREATE on public schema from PUBLIC role. Create application-specific schemas with explicit grants instead.

**Fix:** See `fixes-critical.sql` § C1

---

### C2. Replication slot `analytics_slot` inactive 14 days
**Category:** Operations
**Affected:** WAL retention

**Evidence:**
```
 slot_name      | active | restart_lsn  | retained_wal | retained_bytes
----------------+--------+--------------+--------------+----------------
 analytics_slot | f      | 0/A7B3F2D8   | 47 GB        | 50465410728
```

**Impact:** Inactive slot prevents WAL recycling. Currently retaining 47 GB. Will cause disk full -> DB stops accepting writes if not addressed within ~3 days at current growth.

**Recommendation:**
1. Verify if downstream consumer still needed
2. If yes: restart consumer, monitor lag
3. If no: `SELECT pg_drop_replication_slot('analytics_slot');`

**Fix:** See `fixes-critical.sql` § C2

---

### C3. Sequence `transactions_id_seq` at 92% of int4 max
**Category:** Schema
**Affected:** `public.transactions` (primary key)

**Evidence:**
```
 schemaname | sequencename        | data_type | last_value  | max_value  | pct_used
------------+---------------------+-----------+-------------+------------+----------
 public     | transactions_id_seq | integer   | 1976543201  | 2147483647 | 92.04
```

**Impact:** When sequence reaches int4 max (~177M more rows), all INSERTs to `transactions` will fail. At current ingestion rate (~2M/day), wraparound in ~88 days.

**Recommendation:** Convert PK and sequence to BIGINT. Requires brief lock; can be done online with `ALTER COLUMN ... SET DATA TYPE bigint USING id::bigint` on PG 14+.

**Fix:** See `fixes-critical.sql` § C3 (REQUIRES MAINTENANCE WINDOW)

---

## HIGH Findings

### H1. Missing index on FK `order_items.product_id`
**Category:** Performance
**Table size:** 18 GB (24M rows)

**Evidence:**
```
seq_scan: 1,247,331
seq_tup_read: 29,847,233,440
idx_scan on product_id: 0
```

**Impact:** Every join `orders -> order_items -> products` does full table scan. Estimated 60% latency reduction with index.

**Fix:** See `fixes-high.sql` § H1
```sql
CREATE INDEX CONCURRENTLY idx_order_items_product_id
  ON order_items (product_id);
```

---

### H2. Unused indexes consuming 2.3 GB
**Category:** Performance
**Affected:** 8 indexes across 6 tables

**Evidence:**
```
 schema | table         | index                       | size    | scans
--------+---------------+-----------------------------+---------+------
 public | users         | idx_users_legacy_login      | 845 MB  | 0
 public | products      | idx_products_old_status     | 412 MB  | 0
 public | events        | idx_events_deprecated_type  | 387 MB  | 0
 ...
```

**Impact:** Wastes 2.3 GB disk + slows down writes (each INSERT/UPDATE/DELETE updates all indexes).

**Fix:** See `fixes-high.sql` § H2 (CONCURRENTLY DROP)

---

[... additional High findings ...]

---

## MEDIUM Findings

### M1. Suboptimal datatypes in `products_legacy`
**Category:** Schema

**Evidence:**
- `sku CHAR(20)` - fixed-pad wastes space, recommend VARCHAR
- `price MONEY` - locale-dependent, recommend NUMERIC(10,2)
- `created_at TIMESTAMP` - no timezone, recommend TIMESTAMPTZ

**Fix:** See `fixes-medium.sql` § M1

---

[... additional Medium findings ...]

---

## LOW Findings

### L1. Naming convention violations
**Category:** Schema
**Count:** 12 tables with mixed-case names requiring quoting

**Evidence:**
```
 table_name      | issue
-----------------+----------------------------------------
 UserProfiles    | Contains uppercase - requires quoting
 OrderDetails    | Contains uppercase - requires quoting
 ...
```

**Impact:** Queries must quote names: `SELECT * FROM "UserProfiles"`. Risk of forgetting quotes -> error.

**Fix:** See `fixes-low.sql` § L1 (rename via ALTER TABLE, requires app code update)

---

## Appendix A: Raw Audit Data

- `raw/01-performance.txt` - Performance query outputs
- `raw/02-security.txt` - Security audit raw
- `raw/03-schema.txt` - Schema audit raw
- `raw/04-configuration.txt` - Configuration values
- `raw/05-operations.txt` - Operations metrics

## Appendix B: Audit Metadata

- **Skipped checks:** 2
  - `4.1 shared_buffers vs RAM`: requires OS RAM info (not available via SQL)
  - `5.10 Last backup`: WAL archiving not configured (`archive_mode = off`)
- **Audit duration:** 2m 47s
- **Queries executed:** 54 / 56
- **Timeout queries:** 0
- **Skill version:** v1.0
