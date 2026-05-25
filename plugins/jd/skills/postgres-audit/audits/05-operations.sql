-- =====================================================================
-- AUDIT 05: OPERATIONS
-- Covers: connections, locks, replication, disk, backup signals
-- Read-only: YES
-- =====================================================================

\set ON_ERROR_STOP off
\pset format aligned
\pset border 2

SELECT '=== OPERATIONS AUDIT START ===' AS marker, NOW() AS audit_time;

-- =====================================================================
-- 5.1 CONNECTION COUNT BY STATE
-- Severity: Critical if >90% of max_connections
-- =====================================================================
SELECT '--- 5.1 Connections by state ---' AS section;

SELECT
    coalesce(state, 'unknown') AS state,
    count(*) AS connections,
    array_agg(DISTINCT usename) AS users,
    array_agg(DISTINCT application_name) FILTER (WHERE application_name != '') AS apps
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY state
ORDER BY count(*) DESC;

-- =====================================================================
-- 5.2 IDLE IN TRANSACTION (long-running)
-- Severity: Critical if >5 min (holds locks)
-- =====================================================================
SELECT '--- 5.2 Idle in transaction sessions ---' AS section;

SELECT
    pid,
    usename,
    application_name,
    client_addr,
    state,
    state_change,
    EXTRACT(EPOCH FROM (NOW() - state_change))::int AS idle_seconds,
    LEFT(query, 200) AS last_query
FROM pg_stat_activity
WHERE state IN ('idle in transaction', 'idle in transaction (aborted)')
  AND state_change < NOW() - INTERVAL '1 minute'
ORDER BY state_change ASC;

-- =====================================================================
-- 5.3 CURRENT LOCKS & BLOCKING SESSIONS
-- Severity: High if blocked >1 min
-- =====================================================================
SELECT '--- 5.3 Blocked queries ---' AS section;

SELECT
    blocked.pid AS blocked_pid,
    blocked.usename AS blocked_user,
    blocking.pid AS blocking_pid,
    blocking.usename AS blocking_user,
    LEFT(blocked.query, 100) AS blocked_query,
    LEFT(blocking.query, 100) AS blocking_query,
    EXTRACT(EPOCH FROM (NOW() - blocked.query_start))::int AS blocked_seconds
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE blocked.wait_event_type = 'Lock';

-- =====================================================================
-- 5.4 REPLICATION LAG (if replica)
-- Severity: Critical >5min, High >1min
-- =====================================================================
SELECT '--- 5.4 Replication lag (master view) ---' AS section;

SELECT
    client_addr,
    client_hostname,
    state,
    sync_state,
    pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn)) AS sent_lag,
    pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), write_lsn)) AS write_lag,
    pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), flush_lsn)) AS flush_lag,
    pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) AS replay_lag,
    write_lag, flush_lag, replay_lag
FROM pg_stat_replication;

-- If running on a standby
SELECT '--- 5.4b Standby replay status (if on replica) ---' AS section;

SELECT
    CASE WHEN pg_is_in_recovery() THEN
        EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp()))::int
        ELSE NULL
    END AS replay_lag_seconds,
    pg_is_in_recovery() AS is_standby,
    pg_last_wal_receive_lsn() AS last_received,
    pg_last_wal_replay_lsn() AS last_replayed;

-- =====================================================================
-- 5.5 REPLICATION SLOTS (orphaned = WAL bloat)
-- Severity: Critical if retained_bytes > 10GB
-- =====================================================================
SELECT '--- 5.5 Replication slots ---' AS section;

SELECT
    slot_name,
    slot_type,
    database,
    active,
    pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal,
    pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS retained_bytes
FROM pg_replication_slots
ORDER BY pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) DESC NULLS LAST;

-- =====================================================================
-- 5.6 DATABASE AGE (transaction wraparound risk)
-- Severity: Critical at 80% of autovacuum_freeze_max_age
-- =====================================================================
SELECT '--- 5.6 Transaction wraparound risk ---' AS section;

SELECT
    datname AS database_name,
    age(datfrozenxid) AS xid_age,
    current_setting('autovacuum_freeze_max_age')::bigint AS max_age,
    round(100.0 * age(datfrozenxid) / current_setting('autovacuum_freeze_max_age')::numeric, 2) AS pct_to_wraparound
FROM pg_database
WHERE datallowconn
ORDER BY age(datfrozenxid) DESC;

-- =====================================================================
-- 5.7 DISK USAGE & DATABASE SIZE
-- Severity: High if any DB approaching tablespace limit
-- =====================================================================
SELECT '--- 5.7 Database sizes ---' AS section;

SELECT
    d.datname AS database_name,
    pg_size_pretty(pg_database_size(d.datname)) AS size,
    pg_database_size(d.datname) AS size_bytes
FROM pg_database d
WHERE d.datallowconn
ORDER BY pg_database_size(d.datname) DESC;

-- Tablespace usage
SELECT '--- 5.7b Tablespaces ---' AS section;

SELECT
    spcname AS tablespace,
    pg_tablespace_location(oid) AS location,
    pg_size_pretty(pg_tablespace_size(oid)) AS used
FROM pg_tablespace
ORDER BY pg_tablespace_size(oid) DESC NULLS LAST;

-- =====================================================================
-- 5.8 TOP 20 LARGEST TABLES
-- Severity: Info
-- =====================================================================
SELECT '--- 5.8 Top 20 largest tables ---' AS section;

SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
    pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
    pg_size_pretty(pg_indexes_size(c.oid)) AS index_size,
    c.reltuples::bigint AS approx_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 20;

-- =====================================================================
-- 5.9 LARGEST INDEXES (cross-reference with 1.4 unused)
-- Severity: Info
-- =====================================================================
SELECT '--- 5.9 Top 20 largest indexes ---' AS section;

SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size((schemaname || '.' || indexname)::regclass)) AS index_size
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_relation_size((schemaname || '.' || indexname)::regclass) DESC
LIMIT 20;

-- =====================================================================
-- 5.10 LAST BACKUP / WAL ARCHIVING STATUS
-- Severity: Critical if no archiving and no recent backup signal
-- =====================================================================
SELECT '--- 5.10 WAL archiving status (pg_stat_archiver) ---' AS section;

SELECT
    archived_count,
    last_archived_wal,
    last_archived_time,
    failed_count,
    last_failed_wal,
    last_failed_time,
    stats_reset,
    EXTRACT(EPOCH FROM (NOW() - last_archived_time))::int AS seconds_since_last_archive
FROM pg_stat_archiver;

-- Check if any backup tools currently running
SELECT '--- 5.10b Active backup processes ---' AS section;

SELECT
    pid,
    usename,
    application_name,
    backend_start,
    state
FROM pg_stat_activity
WHERE application_name ILIKE '%backup%'
   OR application_name ILIKE '%basebackup%'
   OR application_name ILIKE '%pgbackrest%'
   OR application_name ILIKE '%barman%';

SELECT '=== OPERATIONS AUDIT END ===' AS marker, NOW() AS audit_time;
