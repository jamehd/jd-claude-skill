-- =====================================================================
-- AUDIT 02: SECURITY & ACCESS
-- Covers: roles, permissions, RLS, SSL, public schema CVE
-- Read-only: YES
-- =====================================================================

\set ON_ERROR_STOP off
\pset format aligned
\pset border 2

SELECT '=== SECURITY AUDIT START ===' AS marker, NOW() AS audit_time;

-- =====================================================================
-- 2.1 SUPERUSER ACCOUNTS
-- Severity: Critical if >2 human accounts
-- =====================================================================
SELECT '--- 2.1 Superuser accounts ---' AS section;

SELECT
    rolname AS role_name,
    rolcanlogin AS can_login,
    rolconnlimit AS connection_limit,
    rolvaliduntil AS password_expires
FROM pg_roles
WHERE rolsuper = true
ORDER BY rolname;

-- =====================================================================
-- 2.2 ROLES WITH ELEVATED PRIVILEGES
-- Severity: High
-- =====================================================================
SELECT '--- 2.2 Roles with elevated privileges ---' AS section;

SELECT
    rolname,
    rolsuper AS super,
    rolcreaterole AS create_role,
    rolcreatedb AS create_db,
    rolbypassrls AS bypass_rls,
    rolreplication AS replication
FROM pg_roles
WHERE (rolcreaterole OR rolcreatedb OR rolbypassrls OR rolreplication)
  AND rolname NOT LIKE 'pg_%'
ORDER BY rolname;

-- =====================================================================
-- 2.3 ROLES WITHOUT PASSWORD EXPIRY
-- Severity: Medium
-- =====================================================================
SELECT '--- 2.3 Login roles without password expiry ---' AS section;

SELECT
    rolname,
    rolvaliduntil,
    CASE
        WHEN rolvaliduntil IS NULL THEN 'NO EXPIRY SET'
        WHEN rolvaliduntil < NOW() THEN 'EXPIRED'
        ELSE 'OK until ' || rolvaliduntil::text
    END AS status
FROM pg_roles
WHERE rolcanlogin = true
  AND rolname NOT LIKE 'pg_%'
ORDER BY rolname;

-- =====================================================================
-- 2.4 PUBLIC SCHEMA PERMISSIONS (CVE-2018-1058)
-- Severity: Critical if PUBLIC has CREATE on public schema
-- =====================================================================
SELECT '--- 2.4 Public schema permissions (CVE-2018-1058) ---' AS section;

SELECT
    n.nspname AS schema_name,
    'PUBLIC' AS grantee,
    has_schema_privilege('public', n.nspname, 'CREATE') AS public_can_create,
    has_schema_privilege('public', n.nspname, 'USAGE') AS public_can_use,
    CASE
        WHEN has_schema_privilege('public', n.nspname, 'CREATE')
        THEN 'CRITICAL: Run "REVOKE CREATE ON SCHEMA public FROM PUBLIC;"'
        ELSE 'OK'
    END AS recommendation
FROM pg_namespace n
WHERE n.nspname = 'public';

-- Detailed grants on all schemas
SELECT '--- 2.4b Detailed schema grants ---' AS section;

SELECT
    grantee,
    object_schema,
    privilege_type
FROM information_schema.usage_privileges
WHERE object_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY object_schema, grantee;

-- =====================================================================
-- 2.5 TABLES WITHOUT ROW LEVEL SECURITY
-- Severity: High (in security-sensitive schemas - user judgment required)
-- =====================================================================
SELECT '--- 2.5 Tables without Row Level Security ---' AS section;

SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    (SELECT count(*) FROM pg_policy WHERE polrelid = c.oid) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND c.relrowsecurity = false
ORDER BY n.nspname, c.relname;

-- =====================================================================
-- 2.6 SSL CONNECTION ENFORCEMENT
-- Severity: Critical in production if SSL not enforced
-- =====================================================================
SELECT '--- 2.6 SSL configuration ---' AS section;

SELECT name, setting
FROM pg_settings
WHERE name IN ('ssl', 'ssl_cert_file', 'ssl_key_file', 'ssl_ca_file', 'ssl_min_protocol_version');

-- Active connections - how many using SSL
SELECT '--- 2.6b Active SSL connections ---' AS section;

SELECT
    ssl,
    count(*) AS connection_count
FROM pg_stat_ssl
GROUP BY ssl
ORDER BY ssl DESC;

-- =====================================================================
-- 2.7 AUTHENTICATION METHODS (requires pg_read_server_files)
-- Severity: High if md5 used (deprecated since PG 14)
-- =====================================================================
SELECT '--- 2.7 Authentication methods (pg_hba_file_rules) ---' AS section;

SELECT
    type,
    database,
    user_name,
    address,
    auth_method,
    options
FROM pg_hba_file_rules
WHERE auth_method NOT IN ('reject')
ORDER BY line_number;

-- =====================================================================
-- 2.8 INSTALLED EXTENSIONS AUDIT
-- Severity: Medium (review trust level of each)
-- =====================================================================
SELECT '--- 2.8 Installed extensions ---' AS section;

SELECT
    e.extname AS extension,
    e.extversion AS version,
    n.nspname AS schema,
    e.extrelocatable AS relocatable,
    pg_catalog.obj_description(e.oid, 'pg_extension') AS description
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
ORDER BY e.extname;

-- =====================================================================
-- 2.9 DEFAULT PRIVILEGES AUDIT
-- Severity: Medium
-- =====================================================================
SELECT '--- 2.9 Default privileges ---' AS section;

SELECT
    pg_get_userbyid(defaclrole) AS owner_role,
    n.nspname AS schema_name,
    CASE defaclobjtype
        WHEN 'r' THEN 'tables'
        WHEN 'S' THEN 'sequences'
        WHEN 'f' THEN 'functions'
        WHEN 'T' THEN 'types'
        WHEN 'n' THEN 'schemas'
    END AS object_type,
    defaclacl AS default_acl
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
ORDER BY owner_role, schema_name;

-- =====================================================================
-- 2.10 SECURITY DEFINER FUNCTIONS (privilege escalation risk)
-- Severity: High - review each function carefully
-- =====================================================================
SELECT '--- 2.10 SECURITY DEFINER functions ---' AS section;

SELECT
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_userbyid(p.proowner) AS owner,
    CASE p.prosecdef WHEN true THEN 'SECURITY DEFINER' ELSE 'INVOKER' END AS security,
    pg_get_function_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS returns
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef = true
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, p.proname;

-- =====================================================================
-- 2.11 AUDIT LOGGING CONFIGURED (pgaudit extension)
-- Severity: Medium in production environments
-- =====================================================================
SELECT '--- 2.11 Audit logging (pgaudit) ---' AS section;

SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgaudit')
            THEN 'INSTALLED'
        ELSE 'NOT INSTALLED - recommended for production'
    END AS pgaudit_status;

SELECT name, setting
FROM pg_settings
WHERE name LIKE 'pgaudit.%'
ORDER BY name;

-- =====================================================================
-- 2.12 DORMANT LOGIN ROLES (cleanup candidates)
-- Severity: Low - reduces attack surface
-- =====================================================================
SELECT '--- 2.12 Login roles list (for cleanup review) ---' AS section;

SELECT
    r.rolname,
    r.rolvaliduntil,
    r.rolconnlimit,
    (SELECT count(*) FROM pg_stat_activity WHERE usename = r.rolname) AS active_now
FROM pg_roles r
WHERE r.rolcanlogin = true
  AND r.rolname NOT LIKE 'pg_%'
ORDER BY r.rolname;

SELECT '=== SECURITY AUDIT END ===' AS marker, NOW() AS audit_time;
