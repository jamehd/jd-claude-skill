# Error Handling Audit Report

**Project:** {{ project_name }}
**Date:** {{ date }} {{ time }}
**Skill version:** error-audit v1.0
**Stacks detected:** {{ stacks_csv }}
**Critical paths used:** {{ critical_paths_csv }}  ({{ critical_paths_source }})
**Config source:** {{ config_source }}

---

## Executive Summary

- Critical: {{ count_critical }}
- High: {{ count_high }}
- Medium: {{ count_medium }}
- Low: {{ count_low }}

**Total findings:** {{ count_total }}

## Top 5 Must-Fix Now

{{ for each top_5 finding }}
{{ index }}. [{{ severity }}] {{ title }} at `{{ location }}` -> see `{{ fix_file }}`
{{ end }}

---

## Findings by Dimension

### A. Code-level Patterns

{{ for each finding in dimension_a }}
#### Finding A.{{ index }} - {{ title }}
**Severity:** {{ severity }}{{ if boosted }} (boosted from {{ base_severity }} - in critical_path `{{ critical_path }}`){{ end }}
**Pattern:** `{{ pattern_id }}`
**Location:** `{{ file }}:{{ line }}`
**Code:**
```{{ lang }}
{{ snippet }}
```
**Why:** {{ why_short }}
**Fix:** See `fixes-{{ severity_lower }}/{{ fix_file }}`

{{ end }}

### B. Observability & Logging
{{ ... same structure ... }}

### C. Notification & Routing
{{ ... same structure ... }}

### E. User-facing Messaging
{{ ... same structure ... }}

---

## Coverage Matrix

| Pattern | Files scanned | Findings | Skipped reason |
|---------|---------------|----------|----------------|
{{ for each pattern_run }}
| {{ pattern_id }} | {{ files_scanned }} | {{ findings_count }} | {{ skip_reason | '-' }} |
{{ end }}

## Patterns Skipped

{{ for each skipped }}
- `{{ pattern_id }}` - {{ reason }}
{{ end }}

---

## Recommendations Summary

{{ for each recommendation }}
{{ index }}. {{ text }} -> see `{{ reference_link }}`
{{ end }}

---

## How to use this report

1. Fix Critical first (security / money loss). SLA: 24h. See `fixes-critical/`.
2. Schedule High for current sprint. SLA: 1 week. See `fixes-high/`.
3. Add Medium to backlog. See `fixes-medium/`.
4. Review Low monthly. See `fixes-low/`.

For severity rubric and rationale, see `references/severity-classification.md`.
For notification routing baseline (who to alert), see `references/notification-routing-guide.md`.
