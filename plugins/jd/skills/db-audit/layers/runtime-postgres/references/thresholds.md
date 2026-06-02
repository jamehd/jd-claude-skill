# Audit Thresholds Reference

Industry-standard thresholds used to classify findings by severity.

## Performance

| Metric | Critical | High | Medium | Low |
|--------|----------|------|--------|-----|
| Query mean_exec_time | >10s | >1s | >100ms | - |
| Table bloat ratio | - | >50% (table >1GB) | >50% (table >100MB) | >30% |
| Index bloat ratio | - | >50% | >30% | - |
| Unused index size | - | >100MB total | >10MB total | <10MB |
| Cache hit ratio | <90% | <95% | <99% | - |
| FK missing index | - | table >10k rows | table >1k rows | table <1k rows |
| Last vacuum age (hot table) | - | >7 days | >3 days | - |
| Long-running query | >30 min | >5 min | >1 min | - |

## Security

| Issue | Severity |
|-------|----------|
| Public schema CREATE for PUBLIC | Critical (CVE-2018-1058) |
| Trust authentication in pg_hba | Critical |
| No SSL enforcement in production | Critical |
| Superuser count >2 (humans) | Critical |
| md5 authentication | High (deprecated, use scram-sha-256) |
| SECURITY DEFINER function audit | High |
| Roles without password expiry | Medium |
| Dormant roles (login never used) | Low |

## Schema

| Issue | Severity |
|-------|----------|
| Sequence >80% of int4 max | Critical (wraparound imminent) |
| Sequence >80% of int8 max | High |
| Table without primary key | High |
| Table without any indexes (>1k rows) | High |
| FK column nullable on required relationship | Medium |
| CHAR(n) datatype | Medium (use VARCHAR/TEXT) |
| MONEY datatype | Medium (use NUMERIC) |
| TIMESTAMP without TZ in app tables | Medium |
| Stale statistics (last_analyze >7d) | Medium |
| Table >50 columns | Low (denormalization smell) |

## Configuration

| Parameter | Critical | High | Medium |
|-----------|----------|------|--------|
| shared_buffers | <10% RAM | <20% RAM | 25%+ RAM (good) |
| effective_cache_size | <30% RAM | <50% RAM | 50-75% RAM (good) |
| work_mem x max_connections | >RAM (OOM risk) | >50% RAM | - |
| random_page_cost on SSD | 4 (default) | 2.0 | 1.1 (good) |
| max_connections used | >95% | >80% | >70% |

## Operations

| Issue | Critical | High | Medium |
|-------|----------|------|--------|
| Replication lag | >5 min | >1 min | >30s |
| Orphaned replication slot | Retained >10GB | Retained >1GB | Any |
| Database age vs freeze_max | >80% | >70% | >60% |
| Disk usage | >90% | >85% | >75% |
| Last backup | >24h | >12h | >6h |
| Idle in transaction | >30 min | >5 min | >1 min |

## Environment-Adjusted Thresholds

Skill auto-adjusts based on DB size:

- **Small (<10 GB):** Skip bloat checks on tables <100MB
- **Medium (10-100 GB):** Standard thresholds
- **Large (>100 GB):** Higher tolerance (vacuum age 14d instead of 7d), bloat checks skipped on tables <1GB
