-- =====================================================================
-- AUDIT 04: CONFIGURATION & TUNING
-- Covers: postgresql.conf parameter analysis, extensions
-- Note: Some checks require OS context (RAM) - flagged for manual review
-- Read-only: YES
-- =====================================================================

\set ON_ERROR_STOP off
\pset format aligned
\pset border 2

SELECT '=== CONFIGURATION AUDIT START ===' AS marker, NOW() AS audit_time;

-- =====================================================================
-- 4.1-4.4 MEMORY PARAMETERS
-- =====================================================================
SELECT '--- 4.1-4.4 Memory parameters ---' AS section;

SELECT
    name,
    setting,
    unit,
    CASE
        WHEN unit = '8kB' THEN pg_size_pretty((setting::bigint * 8192))
        WHEN unit = 'kB' THEN pg_size_pretty((setting::bigint * 1024))
        WHEN unit = '16MB' THEN pg_size_pretty((setting::bigint * 16 * 1024 * 1024))
        ELSE setting
    END AS human_readable,
    short_desc
FROM pg_settings
WHERE name IN (
    'shared_buffers',
    'effective_cache_size',
    'work_mem',
    'maintenance_work_mem',
    'temp_buffers',
    'wal_buffers'
)
ORDER BY name;

-- 4.3 work_mem x max_connections analysis
SELECT '--- 4.3 work_mem x max_connections analysis ---' AS section;

SELECT
    current_setting('work_mem') AS work_mem,
    current_setting('max_connections') AS max_connections,
    pg_size_pretty(
        (current_setting('work_mem')::bigint * 1024 * current_setting('max_connections')::int)
    ) AS theoretical_max_work_mem,
    'If theoretical > 50% RAM, risk of OOM under load' AS warning;

-- =====================================================================
-- 4.5 CONNECTION USAGE vs LIMIT
-- =====================================================================
SELECT '--- 4.5 Connection usage ---' AS section;

SELECT
    current_setting('max_connections')::int AS max_connections,
    count(*) AS current_connections,
    count(*) FILTER (WHERE state = 'active') AS active,
    count(*) FILTER (WHERE state = 'idle') AS idle,
    count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_tx,
    round(100.0 * count(*) / current_setting('max_connections')::numeric, 2) AS pct_used
FROM pg_stat_activity;

-- =====================================================================
-- 4.6 AUTOVACUUM SETTINGS
-- =====================================================================
SELECT '--- 4.6 Autovacuum global settings ---' AS section;

SELECT name, setting, short_desc
FROM pg_settings
WHERE name LIKE 'autovacuum%'
   OR name IN ('vacuum_cost_delay', 'vacuum_cost_limit')
ORDER BY name;

-- Per-table autovacuum overrides
SELECT '--- 4.6b Per-table autovacuum overrides ---' AS section;

SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND c.reloptions IS NOT NULL
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname;

-- =====================================================================
-- 4.7 WAL & CHECKPOINT SETTINGS
-- =====================================================================
SELECT '--- 4.7 WAL & checkpoint configuration ---' AS section;

SELECT name, setting, unit, short_desc
FROM pg_settings
WHERE name IN (
    'wal_level',
    'max_wal_size',
    'min_wal_size',
    'checkpoint_timeout',
    'checkpoint_completion_target',
    'wal_compression',
    'archive_mode',
    'archive_command',
    'synchronous_commit'
)
ORDER BY name;

-- =====================================================================
-- 4.8 LOGGING SETTINGS
-- =====================================================================
SELECT '--- 4.8 Logging configuration ---' AS section;

SELECT name, setting, short_desc
FROM pg_settings
WHERE name IN (
    'log_destination',
    'logging_collector',
    'log_min_duration_statement',
    'log_checkpoints',
    'log_connections',
    'log_disconnections',
    'log_lock_waits',
    'log_temp_files',
    'log_autovacuum_min_duration',
    'log_line_prefix',
    'track_io_timing'
)
ORDER BY name;

-- =====================================================================
-- 4.9 PLANNER COST PARAMETERS (especially random_page_cost)
-- =====================================================================
SELECT '--- 4.9 Planner cost parameters ---' AS section;

SELECT name, setting, short_desc
FROM pg_settings
WHERE name IN (
    'random_page_cost',
    'seq_page_cost',
    'cpu_tuple_cost',
    'cpu_operator_cost',
    'effective_io_concurrency'
)
ORDER BY name;

-- Recommendation
SELECT '--- 4.9b random_page_cost check ---' AS section;

SELECT
    current_setting('random_page_cost') AS current_value,
    CASE
        WHEN current_setting('random_page_cost')::numeric > 2.0
            THEN 'WARN: random_page_cost > 2.0 - if on SSD, set to 1.1'
        ELSE 'OK'
    END AS recommendation;

-- =====================================================================
-- 4.10 INSTALLED EXTENSIONS vs RECOMMENDED
-- =====================================================================
SELECT '--- 4.10 Recommended observability extensions ---' AS section;

WITH recommended AS (
    SELECT unnest(ARRAY[
        'pg_stat_statements',
        'pg_buffercache',
        'pgaudit',
        'auto_explain'
    ]) AS extname
)
SELECT
    r.extname AS recommended_extension,
    CASE
        WHEN e.extname IS NOT NULL THEN 'INSTALLED (v' || e.extversion || ')'
        ELSE 'MISSING'
    END AS status,
    CASE r.extname
        WHEN 'pg_stat_statements' THEN 'Query performance tracking'
        WHEN 'pg_buffercache' THEN 'Shared buffer analysis'
        WHEN 'pgaudit' THEN 'Detailed audit logging for compliance'
        WHEN 'auto_explain' THEN 'Automatic EXPLAIN logging for slow queries'
    END AS purpose
FROM recommended r
LEFT JOIN pg_extension e ON e.extname = r.extname
ORDER BY r.extname;

-- Full installed extension list
SELECT '--- 4.10b All installed extensions ---' AS section;

SELECT extname, extversion FROM pg_extension ORDER BY extname;

SELECT '=== CONFIGURATION AUDIT END ===' AS marker, NOW() AS audit_time;
