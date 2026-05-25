-- =====================================================================
-- One-time setup: Create read-only audit role
-- Run as superuser (postgres) once per database before running audit.
--
-- Usage:
--   1. Edit CHANGE_ME password below
--   2. Replace <dbname> with your database name
--   3. Run: psql -U postgres -d <dbname> -f setup-audit-role.sql
-- =====================================================================

\set ON_ERROR_STOP on

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_readonly') THEN
        CREATE ROLE audit_readonly LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
        RAISE NOTICE 'Created role audit_readonly';
    ELSE
        RAISE NOTICE 'Role audit_readonly already exists - skipping creation';
    END IF;
END
$$;

-- Replace :dbname using psql variable substitution or edit before running
GRANT CONNECT ON DATABASE :"DBNAME" TO audit_readonly;
GRANT USAGE ON SCHEMA public TO audit_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO audit_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO audit_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO audit_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO audit_readonly;

-- Grant SELECT on all non-public schemas too (for multi-schema apps)
DO $$
DECLARE
    sch text;
BEGIN
    FOR sch IN SELECT nspname FROM pg_namespace
               WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'public', 'pg_toast')
                 AND nspname NOT LIKE 'pg_temp_%'
                 AND nspname NOT LIKE 'pg_toast_temp_%'
    LOOP
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO audit_readonly', sch);
        EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO audit_readonly', sch);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT ON TABLES TO audit_readonly', sch);
        RAISE NOTICE 'Granted access on schema: %', sch;
    END LOOP;
END
$$;

-- Monitoring role (PG 10+)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pg_monitor') THEN
        GRANT pg_monitor TO audit_readonly;
        RAISE NOTICE 'Granted pg_monitor to audit_readonly';
    ELSE
        RAISE WARNING 'pg_monitor role not available (PG <10) - manual grants needed';
    END IF;
END
$$;

-- pg_stat_statements (if installed)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
        EXECUTE 'GRANT SELECT ON pg_stat_statements TO audit_readonly';
        RAISE NOTICE 'Granted SELECT on pg_stat_statements';
    ELSE
        RAISE WARNING 'pg_stat_statements extension not installed - performance audits limited';
    END IF;
END
$$;

-- Read-only enforcement at session level
ALTER ROLE audit_readonly SET default_transaction_read_only = on;
ALTER ROLE audit_readonly SET statement_timeout = '30s';
ALTER ROLE audit_readonly SET lock_timeout = '2s';
ALTER ROLE audit_readonly SET idle_in_transaction_session_timeout = '10s';

-- Verification
SELECT
    rolname,
    rolsuper AS is_super,
    rolcreaterole AS can_create_role,
    rolcreatedb AS can_create_db,
    rolcanlogin AS can_login
FROM pg_roles WHERE rolname = 'audit_readonly';

-- Test the role can connect and read but not write
\echo '----'
\echo 'Setup complete. Test with: psql -U audit_readonly -d <dbname> -c "SELECT current_user;"'
\echo 'Remember to change the password before production use.'
