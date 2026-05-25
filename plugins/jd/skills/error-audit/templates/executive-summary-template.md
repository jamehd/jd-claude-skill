# Error Handling Audit - Executive Summary

**Project:** {{ project_name }}
**Date:** {{ date }}
**Auditor:** error-audit skill v1.0

## Risk Assessment

**Overall risk level:** {{ overall_risk }}

{{ overall_risk_explanation_paragraph }}

## Findings at a Glance

```
Critical  {{ bar_critical }}  {{ count_critical }}
High      {{ bar_high }}      {{ count_high }}
Medium    {{ bar_medium }}    {{ count_medium }}
Low       {{ bar_low }}       {{ count_low }}
```

(Each block = 1 finding; truncated at 50.)

## Top 5 Must-Fix Now

{{ for each top_5 }}
{{ index }}. **[{{ severity }}] {{ title }}**
   - Location: `{{ location }}`
   - Business impact: {{ business_impact }}
   - Estimated effort: {{ effort }}
   - Fix file: `{{ fix_file }}`

{{ end }}

## Estimated Total Effort

- Critical fixes: {{ effort_critical }}
- High fixes: {{ effort_high }}
- Medium fixes: {{ effort_medium }}
- Low fixes: {{ effort_low }}

**Total:** {{ effort_total }}

(Buckets: < 1 day, 1-3 days, 1-2 weeks, sprint, multi-sprint.)

## Notification Routing Health

{{ routing_summary_paragraph }}

Issues detected:
{{ for each routing_issue }}
- {{ description }} -> see Finding C.{{ index }}
{{ end }}

## Next Steps

1. Review full report at `./AUDIT-REPORT.md`
2. Address `fixes-critical/` within 24h
3. Schedule `fixes-high/` review for next sprint planning
4. Discuss notification routing matrix with on-call rotation owners

For full findings + code snippets + fix instructions: `./AUDIT-REPORT.md`
