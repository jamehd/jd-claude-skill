# Sensitive Data Patterns

Regex / keyword list used to flag sensitive data appearing in log calls or HTTP response bodies. Match anywhere in an argument or string.

## Keyword categories

### Passwords / credentials (case-insensitive)
- `password`, `passwd`, `pwd`, `pass`
- `mat_khau`, `mat-khau`
- `credential`, `cred`

### Tokens / API keys
- `token`, `access_token`, `refresh_token`, `id_token`
- `jwt`, `bearer`
- `api_key`, `apikey`, `api-key`
- `secret`, `client_secret`
- `private_key`, `privatekey`

### Personally identifiable information (PII)
- `ssn`, `social_security`
- `cccd`, `cmnd` (Vietnamese national ID)
- `credit_card`, `cc_number`, `card_number`
- `cvv`, `cvc`
- `bank_account`

### Should be redacted but often appear
- `email` (when in body of an error log, not as identifier)
- `phone`, `phone_number`
- `ip_address` (in some compliance regimes)
- `date_of_birth`, `dob`

## Regex used by skill

```
\b(password|passwd|pwd|token|jwt|bearer|api[_-]?key|secret|ssn|cccd|cmnd|credit[_-]?card|cvv|cvc|mat[_-]?khau)\b
```

Flags: case-insensitive, word-boundary matched.

## False-positive guards

Skill SKIPS matches when:
- The match is inside a comment (` // password`, `# password`, `/* password */`)
- The match is the LITERAL property name being REDACTED (e.g., `redact: ['password', 'token']` in a logging config)
- The match is inside a `.test.*`, `.spec.*`, `*.example.*`, or test fixture file
- The match is the placeholder string `'***REDACTED***'` or similar

## User override

Users can extend in config:

```yaml
sensitive_patterns:
  add:
    - internal_id
    - user_token_v2
  exempt_files:
    - src/legacy/**  # known false positives during migration
```
