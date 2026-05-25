-- =====================================================================
-- POSTGRES AUDIT - {SEVERITY} FIXES
-- Generated: {TIMESTAMP}
-- Database: {DB_NAME}
--
-- WARNING: REVIEW EACH FIX BEFORE EXECUTING
-- WARNING: TEST ON STAGING FIRST
-- WARNING: TAKE BACKUP BEFORE RUNNING
--
-- Run individually:
--   psql "$DB_URL" -f fixes-{severity}.sql -v ON_ERROR_STOP=1
--
-- Or run individual fix by line range:
--   sed -n '20,45p' fixes-{severity}.sql | psql "$DB_URL"
-- =====================================================================

\timing on
\set ON_ERROR_STOP on

-- =====================================================================
-- {FIX_ID}. {FIX_TITLE}
-- =====================================================================
-- Risk: {NONE|LOW|MEDIUM|HIGH}
-- Downtime: {NONE|REQUIRES MAINTENANCE WINDOW|FULL OUTAGE}
-- Rollback: {SQL statement to reverse, or "CANNOT" if irreversible}
--
-- Pre-conditions:
--   1. {requirement}
--   2. {requirement}
--
-- Side effects:
--   - {what else might change}
-- =====================================================================

BEGIN;

-- Verify current state BEFORE applying
SELECT 'BEFORE' AS step;
-- {verification_query};

-- Apply fix
-- {FIX_SQL}

-- Verify state AFTER applying
SELECT 'AFTER' AS step;
-- {verification_query};

COMMIT;
-- ROLLBACK;  -- Uncomment to test without applying

-- =====================================================================
-- END OF FIX {FIX_ID}
-- =====================================================================
