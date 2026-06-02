# PostgreSQL Version Compatibility Matrix

## Supported versions

| Version | Status | Notes |
|---------|--------|-------|
| 17.x | Full | All queries native |
| 16.x | Full | |
| 15.x | Full | Tested baseline |
| 14.x | Full | |
| 13.x | Full | Minimum recommended |
| 12.x | Partial | pg_stat_statements columns differ (see below) |
| 11.x | Partial | No pg_monitor role - manual grants required |
| 10.x | Partial | Limited generated columns audit |
| <10 | Unsupported | Suggest upgrade before audit |

## Query adaptations by version

### pg_stat_statements columns (PG 13 change)
- PG 13+: `total_exec_time`, `mean_exec_time`, `min_exec_time`, `max_exec_time`
- PG <13: `total_time`, `mean_time`, `min_time`, `max_time`

Skill detects version with:
```sql
SELECT current_setting('server_version_num')::int / 10000 AS major_version;
```

And selects query variant accordingly.

### pg_monitor role (PG 10+)
Available from PG 10. For PG <10, must manually grant:
- `GRANT SELECT ON pg_stat_*` (each relevant view)
- `GRANT SELECT ON pg_authid` (for security audit)

### GENERATED columns (PG 12+)
Datatype audit (3.3) for `GENERATED AS IDENTITY` only checks PG 10+.

### Logical replication slots (PG 10+)
Operations check 5.5 skips on PG <10.

### Pre-flight version check

```sql
DO $$
DECLARE
    v_major int := current_setting('server_version_num')::int / 10000;
BEGIN
    IF v_major < 10 THEN
        RAISE EXCEPTION 'PostgreSQL % is not supported. Minimum: 10. Recommended: 13+.', v_major;
    ELSIF v_major < 13 THEN
        RAISE WARNING 'PostgreSQL % has partial support. Some checks will be skipped or adapted.', v_major;
    END IF;
END $$;
```
