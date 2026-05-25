-- =====================================================================
-- AUDIT 03: SCHEMA & DATA QUALITY
-- Covers: PK/FK, datatypes, constraints, naming, sequences
-- Read-only: YES
-- =====================================================================

\set ON_ERROR_STOP off
\pset format aligned
\pset border 2

SELECT '=== SCHEMA AUDIT START ===' AS marker, NOW() AS audit_time;

-- =====================================================================
-- 3.1 TABLES WITHOUT PRIMARY KEY
-- Severity: High
-- =====================================================================
SELECT '--- 3.1 Tables without primary key ---' AS section;

SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    c.reltuples::bigint AS approx_rows,
    pg_size_pretty(pg_relation_size(c.oid)) AS table_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = c.oid AND contype = 'p'
  )
ORDER BY pg_relation_size(c.oid) DESC;

-- =====================================================================
-- 3.2 TABLES WITHOUT ANY INDEX (and >1000 rows)
-- Severity: High
-- =====================================================================
SELECT '--- 3.2 Tables without any index ---' AS section;

SELECT
    schemaname,
    relname AS table_name,
    n_live_tup AS approx_rows,
    pg_size_pretty(pg_relation_size(relid)) AS table_size
FROM pg_stat_user_tables
WHERE relid NOT IN (SELECT indrelid FROM pg_index)
  AND n_live_tup > 1000
ORDER BY n_live_tup DESC;

-- =====================================================================
-- 3.3 SUBOPTIMAL DATATYPES
-- Severity: Medium
-- Checks: CHAR(n), MONEY, TIMESTAMP without TZ
-- =====================================================================
SELECT '--- 3.3 Suboptimal datatypes ---' AS section;

SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    a.attname AS column_name,
    format_type(a.atttypid, a.atttypmod) AS data_type,
    CASE
        WHEN format_type(a.atttypid, a.atttypmod) LIKE 'character(%)' AND a.atttypmod > 5
            THEN 'Use VARCHAR or TEXT instead of CHAR(n) - fixed-pad wastes space'
        WHEN format_type(a.atttypid, a.atttypmod) = 'money'
            THEN 'Use NUMERIC instead of MONEY - locale-dependent'
        WHEN format_type(a.atttypid, a.atttypmod) = 'timestamp without time zone'
            THEN 'Consider TIMESTAMPTZ for application data'
    END AS recommendation
FROM pg_attribute a
JOIN pg_class c ON a.attrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE a.attnum > 0
  AND NOT a.attisdropped
  AND c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND (
        (format_type(a.atttypid, a.atttypmod) LIKE 'character(%)' AND a.atttypmod > 5)
     OR format_type(a.atttypid, a.atttypmod) = 'money'
     OR format_type(a.atttypid, a.atttypmod) = 'timestamp without time zone'
  )
ORDER BY n.nspname, c.relname, a.attnum;

-- =====================================================================
-- 3.4 FK COLUMNS NULLABLE BUT MAY BE REQUIRED
-- Severity: Medium - review whether NULL truly valid
-- =====================================================================
SELECT '--- 3.4 Foreign key columns that allow NULL ---' AS section;

SELECT
    con.conrelid::regclass::text AS table_name,
    a.attname AS column_name,
    a.attnotnull AS not_null,
    con.conname AS constraint_name,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
WHERE con.contype = 'f'
  AND a.attnotnull = false
ORDER BY con.conrelid::regclass::text;

-- =====================================================================
-- 3.5 TABLES WITH TOO MANY COLUMNS (>50)
-- Severity: Low - denormalization smell
-- =====================================================================
SELECT '--- 3.5 Tables with >50 columns ---' AS section;

SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    count(*) AS column_count
FROM pg_attribute a
JOIN pg_class c ON a.attrelid = c.oid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE a.attnum > 0
  AND NOT a.attisdropped
  AND c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
GROUP BY n.nspname, c.relname
HAVING count(*) > 50
ORDER BY count(*) DESC;

-- =====================================================================
-- 3.6 TABLES WITH TOO MANY INDEXES (>10) - write overhead risk
-- Severity: Medium
-- =====================================================================
SELECT '--- 3.6 Tables with >10 indexes ---' AS section;

SELECT
    schemaname,
    tablename,
    count(*) AS index_count,
    pg_size_pretty(sum(pg_relation_size((schemaname || '.' || indexname)::regclass))) AS total_index_size
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
GROUP BY schemaname, tablename
HAVING count(*) > 10
ORDER BY count(*) DESC;

-- =====================================================================
-- 3.7 CHECK CONSTRAINT COVERAGE
-- Severity: Low - opportunity for data quality enforcement
-- =====================================================================
SELECT '--- 3.7 CHECK constraints by table (lowest first = candidates for more) ---' AS section;

SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    count(con.oid) AS check_constraint_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_constraint con ON con.conrelid = c.oid AND con.contype = 'c'
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
GROUP BY n.nspname, c.relname
ORDER BY check_constraint_count, n.nspname, c.relname;

-- =====================================================================
-- 3.8 NAMING CONVENTION VIOLATIONS
-- Severity: Low
-- Flags: CamelCase (requires quoting), special chars, leading digits
-- =====================================================================
SELECT '--- 3.8 Naming convention issues ---' AS section;

SELECT
    n.nspname AS schema_name,
    c.relname AS object_name,
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'i' THEN 'index'
        WHEN 'v' THEN 'view'
        WHEN 'S' THEN 'sequence'
    END AS object_type,
    CASE
        WHEN c.relname ~ '[A-Z]' THEN 'Contains uppercase - requires quoting'
        WHEN c.relname ~ '[^a-z0-9_]' THEN 'Contains special characters'
        WHEN c.relname ~ '^[0-9]' THEN 'Starts with digit'
    END AS issue
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND c.relkind IN ('r', 'i', 'v', 'S')
  AND (c.relname ~ '[A-Z]' OR c.relname ~ '[^a-z0-9_]' OR c.relname ~ '^[0-9]')
ORDER BY n.nspname, c.relname;

-- =====================================================================
-- 3.9 STALE STATISTICS
-- Severity: Medium - planner uses stale data
-- =====================================================================
SELECT '--- 3.9 Stale statistics (>7 days) ---' AS section;

SELECT
    schemaname,
    relname AS table_name,
    n_live_tup AS rows,
    last_analyze,
    last_autoanalyze,
    GREATEST(coalesce(last_analyze, '1970-01-01'::timestamptz), coalesce(last_autoanalyze, '1970-01-01'::timestamptz)) AS most_recent,
    EXTRACT(DAY FROM NOW() - GREATEST(coalesce(last_analyze, '1970-01-01'::timestamptz), coalesce(last_autoanalyze, '1970-01-01'::timestamptz)))::int AS days_old
FROM pg_stat_user_tables
WHERE n_live_tup > 1000
  AND GREATEST(coalesce(last_analyze, '1970-01-01'::timestamptz), coalesce(last_autoanalyze, '1970-01-01'::timestamptz)) < NOW() - INTERVAL '7 days'
ORDER BY days_old DESC;

-- =====================================================================
-- 3.10 SEQUENCES NEARING EXHAUSTION
-- Severity: Critical if int4 sequence >80% of max (2.1B)
-- =====================================================================
SELECT '--- 3.10 Sequences nearing exhaustion ---' AS section;

SELECT
    schemaname,
    sequencename,
    data_type,
    last_value,
    max_value,
    round(100.0 * last_value::numeric / max_value::numeric, 2) AS pct_used
FROM pg_sequences
WHERE last_value IS NOT NULL
  AND 100.0 * last_value::numeric / max_value::numeric > 50.0
ORDER BY pct_used DESC;

-- =====================================================================
-- 3.11 PARTITION HEALTH
-- Severity: Info
-- =====================================================================
SELECT '--- 3.11 Partitioned tables ---' AS section;

SELECT
    n.nspname AS schema_name,
    c.relname AS parent_table,
    count(i.inhrelid) AS partition_count,
    pg_size_pretty(sum(pg_relation_size(i.inhrelid))) AS total_size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_inherits i ON i.inhparent = c.oid
WHERE c.relkind = 'p'
GROUP BY n.nspname, c.relname
ORDER BY count(i.inhrelid) DESC;

-- =====================================================================
-- 3.12 ORPHANED TABLES (no FK ref + no activity)
-- Severity: Low - cleanup candidates
-- =====================================================================
SELECT '--- 3.12 Orphaned tables (no FK references, no recent activity) ---' AS section;

SELECT
    s.schemaname,
    s.relname AS table_name,
    s.n_live_tup AS rows,
    s.seq_scan + coalesce(s.idx_scan, 0) AS total_scans,
    s.n_tup_ins + s.n_tup_upd + s.n_tup_del AS total_writes,
    pg_size_pretty(pg_relation_size(s.relid)) AS table_size
FROM pg_stat_user_tables s
WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.contype = 'f' AND c.confrelid = s.relid
  )
  AND s.seq_scan + coalesce(s.idx_scan, 0) = 0
  AND s.n_tup_ins + s.n_tup_upd + s.n_tup_del = 0
  AND s.n_live_tup > 0
ORDER BY pg_relation_size(s.relid) DESC;

SELECT '=== SCHEMA AUDIT END ===' AS marker, NOW() AS audit_time;
