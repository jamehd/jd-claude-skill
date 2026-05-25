# PostgreSQL Best Practices Summary

Condensed reference of best practices the audit checks against. Sources: PostgreSQL official docs, Crunchy Data, DigitalOcean, Percona.

## Performance

- Index every foreign key column (avoids lock contention on parent updates/deletes)
- Avoid `SELECT *` in production; use explicit column lists
- Use `EXPLAIN (ANALYZE, BUFFERS)` for query tuning
- Vacuum aggressively on hot tables (lower `autovacuum_vacuum_scale_factor`)
- Set `random_page_cost = 1.1` on SSD storage
- Monitor cache hit ratio - target >99% for OLTP workloads
- Use connection pooler (PgBouncer) when >100 active connections expected
- Use `CREATE INDEX CONCURRENTLY` on production tables to avoid locks
- Partition very large tables (>100GB) by date or hash

## Security

- Never grant CREATE on public schema to PUBLIC (CVE-2018-1058)
- Use scram-sha-256, not md5 (md5 deprecated since PG 14)
- Enforce SSL in production (`ssl=on`, `hostssl` in pg_hba)
- Limit superusers to 2-3 humans + automation accounts
- Audit SECURITY DEFINER functions - they bypass row-level security
- Enable Row Level Security on multi-tenant tables
- Use pgaudit extension for compliance logging
- Rotate passwords; set `rolvaliduntil`
- Drop unused login roles (reduce attack surface)
- Avoid storing secrets in pg_settings (use environment vars)

## Schema design

- Always define primary keys
- Use `BIGINT` (not INT) for high-volume tables - avoid wraparound
- Use `GENERATED AS IDENTITY` (PG 10+) instead of SERIAL
- Use `TIMESTAMPTZ` instead of TIMESTAMP for app data
- Use `NUMERIC` for money, not MONEY type (locale-dependent)
- Use `TEXT` or `VARCHAR` without length limit, not `CHAR(n)`
- Define CHECK constraints for enum-like fields
- NOT NULL on FK columns when relationship is required
- Index expressions used in WHERE clauses, not just columns
- Use partial indexes for selective queries
- Consider GIN/GiST indexes for JSONB and full-text search

## Configuration

- `shared_buffers` = 25% of RAM (cap around 8GB even on big servers)
- `effective_cache_size` = 50-75% of RAM (hint to query planner)
- `work_mem` = (RAM * 0.25) / max_connections (conservative starting point)
- `maintenance_work_mem` = 1-2 GB on production
- `wal_compression = on`
- `log_min_duration_statement = 1000` (log queries over 1s)
- `track_io_timing = on` for performance diagnosis
- `synchronous_commit = off` only if you can tolerate up to 200ms data loss
- `huge_pages = try` on Linux for large shared_buffers

## Operations

- Daily full backup + continuous WAL archiving (PITR-ready)
- Test backup restore quarterly
- Monitor replication lag <30s
- Drop orphaned replication slots immediately (cause WAL bloat)
- Alert on connection count >80% of max_connections
- Track database age - vacuum freeze before 80% of `autovacuum_freeze_max_age`
- Monitor disk space, alert at 85%
- Log slow queries (>1s) for ongoing tuning
- Use `pg_dump` only for small databases; use `pg_basebackup`/`pgbackrest` for production

## Common Anti-patterns

- Using `OFFSET` for pagination on large tables (use keyset pagination)
- `SELECT COUNT(*)` on huge tables (use approximate from pg_class.reltuples)
- Many small `INSERT` statements (use COPY or batch INSERT)
- Long-running transactions blocking vacuum
- Indexes on low-cardinality columns (gender, boolean)
- ORM-generated queries with N+1 patterns
- Storing JSON as TEXT instead of JSONB
- Not using prepared statements for repeated queries
