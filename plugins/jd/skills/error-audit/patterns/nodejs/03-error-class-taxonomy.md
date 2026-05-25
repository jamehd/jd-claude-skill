## Pattern: Missing Error Class Taxonomy
**Severity:** Medium
**Boost rule:** if in critical_paths -> High
**Dimension:** A (Code-level)

### Detection
- Ripgrep command(s):
- `rg -t ts -t js --line-number "throw\s+new\s+Error\("`

Composite check by orchestrator:
1. Count occurrences of `throw new Error(` across the codebase (call it N)
2. Count custom error class definitions: `rg -t ts -t js --count "class\s+\w+\s+extends\s+(Error|AppError|HttpException|BaseError)"`
3. If ratio `N / (custom_class_count + 1) > 3` -> FLAG codebase-level "missing error taxonomy"
4. Each individual `throw new Error(` in critical_paths -> FLAG per-occurrence

### Why this matters
Generic `Error` throws cannot be distinguished by `instanceof` or `errors.code` checks. Callers cannot:
- Map error -> HTTP status code (was it 404 or 500?)
- Decide retry vs alert (validation error vs network failure)
- Localize user message (is this user-fixable or system bug?)
- Triage in Sentry (all show as "Error" with no grouping)

A typed taxonomy (`ValidationError`, `NotFoundError`, `PaymentError`, etc.) inheriting from a base `AppError` enables all of the above.

### Fix template
```before
if (!email) throw new Error('email required');
```
```after
// src/errors/index.ts
export class AppError extends Error {
  constructor(public code: string, message: string, public cause?: Error) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class ValidationError extends AppError {
  constructor(message: string) { super('VALIDATION', message); }
}

// caller:
if (!email) throw new ValidationError('email required');
```

See `references/best-practices-per-stack.md#nodejs-typed-error-class-hierarchy`.

### Test cases
SHOULD match:
- `throw new Error('email required')`
- `throw new Error(msg)`

Should NOT match:
- `throw new ValidationError(...)` (typed error)
- `throw new HttpException(...)` (NestJS typed)

### Reference
- `references/error-taxonomy.md`
- `references/best-practices-per-stack.md#nodejs`
