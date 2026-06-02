-- =====================================================================
-- AUDIT 01: PERFORMANCE
-- Covers: slow queries, indexes, bloat, vacuum, cache hit ratio
-- Requires: pg_stat_statements (1.1-1.3), pg_monitor (most others)
-- Read-only: YES
-- =====================================================================

\set ON_ERROR_STOP off
\pset format aligned
\pset border 2

SELECT '=== PERFORMANCE AUDIT START ===' AS marker, NOW() AS audit_time;

SELECT
    current_setting('server_version_num')::int / 10000 AS pg_major_version,
    current_setting('server_version') AS pg_version_string;

-- =====================================================================
-- 1.1 TOP 20 SLOWEST QUERIES BY TOTAL EXECUTION TIME
-- Severity: Critical if mean >10s, High if >1s, Medium if >100ms
-- =====================================================================
SELECT '--- 1.1 Top 20 slowest queries (by total time) ---' AS section;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
        RAISE NOTICE 'SKIP 1.1-1.3: pg_stat_statements extension not installed';
    END IF;
END $$;

SELECT
    LEFT(query, 100) AS query_snippet,
    calls,
    round(mean_exec_time::numeric, 2) AS mean_ms,
    round(total_exec_time::numeric, 2) AS total_ms,
    round((100.0 * total_exec_time / NULLIF(SUM(total_exec_time) OVER (), 0))::numeric, 2) AS pct_total,
    rows
FROM pg_stat_statements
WHERE total_exec_time > 0
ORDER BY total_exec_time DESC
LIMIT 20;

-- =====================================================================
-- 1.2 TOP 10 MOST FREQUENT QUERIES
-- Severity: Info (identifies hot path)
-- =====================================================================
SELECT '--- 1.2 Top 10 most frequent queries ---' AS section;

SELECT
    LEFT(query, 100) AS query_snippet,
    calls,
    round(mean_exec_time::numeric, 2) AS mean_ms,
    round(total_exec_time::numeric, 2) AS total_ms
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 10;

-- =====================================================================
-- 1.3 QUERIES WITH HIGHEST I/O
-- Severity: High if shared_blks_read >1M
-- =====================================================================
SELECT '--- 1.3 Queries with highest I/O ---' AS section;

SELECT
    LEFT(query, 100) AS query_snippet,
    calls,
    shared_blks_read,
    shared_blks_hit,
    round(100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0), 2) AS hit_ratio_pct
FROM pg_stat_statements
WHERE shared_blks_read > 0
ORDER BY shared_blks_read DESC
LIMIT 10;

-- =====================================================================
-- 1.4 UNUSED INDEXES (idx_scan = 0, size > 1MB)
-- Severity: High if total unused index size > 100MB
-- =====================================================================
SELECT '--- 1.4 Unused indexes ---' AS section;

SELECT
    schemaname,
    relname AS table_name,
    indexrelname AS index_name,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    idx_scan AS scans,
    'DROP INDEX ' || quote_ident(schemaname) || '.' || quote_ident(indexrelname) || ';' AS fix_sql
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND pg_relation_size(indexrelid) > 1024 * 1024
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conindid = indexrelid
  )
ORDER BY pg_relation_size(indexrelid) DESC;

-- =====================================================================
-- 1.5 DUPLICATE INDEXES (same columns on same table)
-- Severity: Medium
-- =====================================================================
SELECT '--- 1.5 Duplicate indexes ---' AS section;

SELECT
    schemaname,
    tablename,
    array_agg(indexname) AS duplicate_indexes,
    array_agg(pg_size_pretty(pg_relation_size((schemaname || '.' || indexname)::regclass))) AS sizes,
    indexdef_normalized
FROM (
    SELECT
        schemaname,
        tablename,
        indexname,
        regexp_replace(indexdef, '^CREATE (UNIQUE )?INDEX [^ ]+ ON ', '') AS indexdef_normalized
    FROM pg_indexes
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
) sub
GROUP BY schemaname, tablename, indexdef_normalized
HAVING count(*) > 1;

-- =====================================================================
-- 1.6 FOREIGN KEYS MISSING INDEXES
-- Severity: High if table > 10k rows
-- =====================================================================
SELECT '--- 1.6 Foreign keys without indexes ---' AS section;

WITH fk_cols AS (
    SELECT
        c.oid AS conoid,
        c.conrelid,
        c.conname,
        c.conkey,
        array_agg(a.attname ORDER BY a.attnum) AS col_names,
        array_agg(a.attnum ORDER BY a.attnum) AS col_nums
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
    GROUP BY c.oid, c.conrelid, c.conname, c.conkey
),
indexed_cols AS (
    SELECT
        i.indrelid,
        (string_to_array(replace(i.indkey::text, ' ', ','), ',')::int[])[1:array_length(i.indkey::int[], 1)] AS first_cols
    FROM pg_index i
)
SELECT
    f.conrelid::regclass::text AS table_name,
    array_to_string(f.col_names, ', ') AS fk_columns,
    f.conname AS constraint_name,
    pg_size_pretty(pg_relation_size(f.conrelid)) AS table_size,
    (SELECT reltuples::bigint FROM pg_class WHERE oid = f.conrelid) AS approx_rows,
    'CREATE INDEX CONCURRENTLY idx_' || replace(f.conrelid::regclass::text, '.', '_') ||
        '_' || array_to_string(f.col_names, '_') ||
        ' ON ' || f.conrelid::regclass::text ||
        ' (' || array_to_string(f.col_names, ', ') || ');' AS fix_sql
FROM fk_cols f
WHERE NOT EXISTS (
    SELECT 1 FROM indexed_cols ic
    WHERE ic.indrelid = f.conrelid
      AND ic.first_cols[1:array_length(f.col_nums, 1)] = f.col_nums
)
ORDER BY pg_relation_size(f.conrelid) DESC;

-- =====================================================================
-- 1.7 SEQUENTIAL SCANS ON LARGE TABLES
-- Severity: High if seq_scan >> idx_scan on tables >100k rows
-- =====================================================================
SELECT '--- 1.7 Sequential scans on large tables ---' AS section;

SELECT
    schemaname,
    relname AS table_name,
    seq_scan,
    idx_scan,
    seq_tup_read,
    n_live_tup AS approx_rows,
    pg_size_pretty(pg_relation_size(relid)) AS table_size,
    CASE
        WHEN seq_scan > 0 AND coalesce(idx_scan, 0) = 0 THEN 'NO INDEX USED'
        WHEN seq_scan > coalesce(idx_scan, 0) * 10 THEN 'SEQ DOMINATES'
        ELSE 'OK'
    END AS verdict
FROM pg_stat_user_tables
WHERE n_live_tup > 10000
  AND seq_scan > 0
  AND (idx_scan IS NULL OR seq_scan > idx_scan * 5)
ORDER BY seq_tup_read DESC
LIMIT 20;

-- =====================================================================
-- 1.8 TABLE BLOAT ESTIMATION (no extension required)
-- Severity: High if bloat >50% on tables >1GB
-- Uses ioguix/pgsql-bloat-estimation-queries methodology
-- =====================================================================
SELECT '--- 1.8 Table bloat estimation ---' AS section;

SELECT
    schemaname,
    tblname AS table_name,
    pg_size_pretty(real_size::bigint) AS table_size,
    pg_size_pretty(bloat_size::bigint) AS bloat_size,
    round((bloat_size * 100 / NULLIF(real_size, 0))::numeric, 1) AS bloat_pct
FROM (
    SELECT
        schemaname,
        tblname,
        bs * tblpages AS real_size,
        (tblpages - est_tblpages_ff) * bs AS bloat_size
    FROM (
        SELECT
            ceil(reltuples / ((bs - page_hdr) * fillfactor / (tpl_size * 100))) + ceil(toasttuples / 4) AS est_tblpages_ff,
            tblpages, fillfactor, bs, schemaname, tblname
        FROM (
            SELECT
                ( 4 + tpl_hdr_size + tpl_data_size + (2 * ma)
                    - CASE WHEN tpl_hdr_size % ma = 0 THEN ma ELSE tpl_hdr_size % ma END
                    - CASE WHEN ceil(tpl_data_size)::int % ma = 0 THEN ma ELSE ceil(tpl_data_size)::int % ma END
                ) AS tpl_size,
                (heappages + toastpages) AS tblpages, reltuples, toasttuples,
                bs, page_hdr, schemaname, tblname, fillfactor
            FROM (
                SELECT
                    ns.nspname AS schemaname,
                    tbl.relname AS tblname,
                    tbl.reltuples,
                    tbl.relpages AS heappages,
                    coalesce(toast.relpages, 0) AS toastpages,
                    coalesce(toast.reltuples, 0) AS toasttuples,
                    coalesce(substring(array_to_string(tbl.reloptions, ' ') FROM 'fillfactor=([0-9]+)')::smallint, 100) AS fillfactor,
                    current_setting('block_size')::numeric AS bs,
                    CASE WHEN version() ~ 'mingw32' OR version() ~ '64-bit|x86_64|ppc64|ia64|amd64' THEN 8 ELSE 4 END AS ma,
                    24 AS page_hdr,
                    23 + CASE WHEN MAX(coalesce(s.null_frac, 0)) > 0 THEN ( 7 + count(s.attname) ) / 8 ELSE 0::int END
                       + CASE WHEN bool_or(att.attname = 'oid' AND att.attnum < 0) THEN 4 ELSE 0 END AS tpl_hdr_size,
                    sum( (1 - coalesce(s.null_frac, 0)) * coalesce(s.avg_width, 0) ) AS tpl_data_size
                FROM pg_attribute AS att
                    JOIN pg_class AS tbl ON att.attrelid = tbl.oid
                    JOIN pg_namespace AS ns ON ns.oid = tbl.relnamespace
                    LEFT JOIN pg_stats AS s ON s.schemaname = ns.nspname AND s.tablename = tbl.relname AND s.inherited = false AND s.attname = att.attname
                    LEFT JOIN pg_class AS toast ON tbl.reltoastrelid = toast.oid
                WHERE att.attnum > 0 AND NOT att.attisdropped
                  AND tbl.relkind in ('r','m')
                  AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
                GROUP BY 1,2,3,4,5,6,7,8,9,10
            ) AS inner_q
        ) AS mid_q
    ) AS outer_q
) AS bloat
WHERE real_size > 1024 * 1024 * 10
  AND bloat_size > 0
ORDER BY bloat_size DESC
LIMIT 20;

-- =====================================================================
-- 1.9 INDEX SIZE vs TABLE SIZE (proxy for bloat / over-indexing)
-- Severity: High if index_to_table_pct >100% on large tables
-- =====================================================================
SELECT '--- 1.9 Index size analysis ---' AS section;

SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size((schemaname || '.' || indexname)::regclass)) AS index_size,
    pg_size_pretty(pg_relation_size((schemaname || '.' || tablename)::regclass)) AS table_size,
    round(100.0 * pg_relation_size((schemaname || '.' || indexname)::regclass) /
          NULLIF(pg_relation_size((schemaname || '.' || tablename)::regclass), 0), 2) AS index_to_table_pct
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  AND pg_relation_size((schemaname || '.' || indexname)::regclass) > 1024 * 1024
ORDER BY pg_relation_size((schemaname || '.' || indexname)::regclass) DESC
LIMIT 20;

-- =====================================================================
-- 1.10 CACHE HIT RATIO
-- Severity: Critical <90%, High <95%, Medium <99%
-- =====================================================================
SELECT '--- 1.10 Cache hit ratio (database-wide) ---' AS section;

SELECT
    'tables' AS object_type,
    sum(heap_blks_read) AS disk_reads,
    sum(heap_blks_hit) AS cache_hits,
    round(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) AS hit_ratio_pct
FROM pg_statio_user_tables
UNION ALL
SELECT
    'indexes',
    sum(idx_blks_read),
    sum(idx_blks_hit),
    round(100.0 * sum(idx_blks_hit) / NULLIF(sum(idx_blks_hit) + sum(idx_blks_read), 0), 2)
FROM pg_statio_user_indexes;

-- =====================================================================
-- 1.11 VACUUM / AUTOVACUUM STATUS
-- Severity: High if last_vacuum >7d on hot tables
-- =====================================================================
SELECT '--- 1.11 Vacuum / autovacuum status ---' AS section;

SELECT
    schemaname,
    relname AS table_name,
    n_live_tup AS live_rows,
    n_dead_tup AS dead_rows,
    round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze,
    EXTRACT(DAY FROM NOW() - GREATEST(coalesce(last_vacuum, '1970-01-01'::timestamptz), coalesce(last_autovacuum, '1970-01-01'::timestamptz))) AS days_since_vacuum
FROM pg_stat_user_tables
WHERE n_live_tup > 1000
ORDER BY n_dead_tup DESC
LIMIT 30;

-- =====================================================================
-- 1.12 LONG-RUNNING QUERIES (currently active >5 min)
-- Severity: Critical
-- =====================================================================
SELECT '--- 1.12 Long-running queries ---' AS section;

SELECT
    pid,
    usename,
    application_name,
    client_addr,
    state,
    EXTRACT(EPOCH FROM (NOW() - query_start))::int AS duration_sec,
    LEFT(query, 200) AS query
FROM pg_stat_activity
WHERE state = 'active'
  AND query_start < NOW() - INTERVAL '5 minutes'
  AND pid <> pg_backend_pid()
ORDER BY query_start ASC;

SELECT '=== PERFORMANCE AUDIT END ===' AS marker, NOW() AS audit_time;
