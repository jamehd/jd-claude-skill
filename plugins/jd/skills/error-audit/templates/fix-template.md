# Fix [{{ id }}] - {{ title }}

**Severity:** {{ severity }}{{ if boosted }} (boosted from {{ base_severity }} - in critical_path `{{ critical_path }}`){{ end }}
**Dimension:** {{ dimension }} ({{ dimension_name }})
**Pattern ID:** `{{ pattern_id }}`

## Affected files

{{ for each affected_file }}
- `{{ path }}:{{ line }}` - {{ snippet_one_line }}
{{ end }}

## Before

```{{ lang }}
{{ before_snippet }}
```

## After

```{{ lang }}
{{ after_snippet }}
```

## Why this matters

{{ why_paragraph }}

## Manual apply steps

{{ for each step }}
{{ index }}. {{ step_text }}
{{ end }}

## Verification

After applying:

```bash
{{ verification_command }}
```

Expected: {{ verification_expected }}

## Reference

{{ for each reference }}
- `{{ reference_link }}`
{{ end }}
