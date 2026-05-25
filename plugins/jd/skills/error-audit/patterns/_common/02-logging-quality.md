## Pattern: Logging Quality Issues
**Severity:** Medium
**Boost rule:** if in critical_paths -> High
**Dimension:** B (Observability & Logging)

### Detection
Multiple sub-patterns; report each as a separate finding.

#### 2a. Logging only `.message` (loses stack trace + context)
- Ripgrep command(s):
- `rg -t ts -t js --line-number "console\.log\(\w+\.message"`

Catches `console.log(err.message)` and similar. Indicates the catch handler discards the full error (stack, cause chain, custom properties).

#### 2b. Error logged at info level (console.log used for errors)
- Ripgrep command(s):
- `rg -t ts -t js --line-number "console\.log\([^)]*\b(err|error|Error)\b"`

Catches `console.log` with `err`/`error`/`Error` keyword - should use `console.error` or a structured logger at error level so alert routing fires.

#### 2c. Heuristic - empty catch blocks (best-effort)
- Ripgrep command(s):
- `rg -t ts -t js -U --multiline-dotall --line-number "catch\s*\([^)]*\)\s*\{\s*\}"`

NOTE: this only catches whitespace-only catch bodies on adjacent lines. Catch blocks containing only comments are NOT detected (regex limitation - acceptable false-negative since pure-comment catches still indicate intent to swallow).

False-positive guards:
- Skip test files (`.test.*`, `.spec.*`, `__tests__/`)
- Skip if the variable is named `err` but used as a string literal (e.g., `console.log("err: " + msg)`)

### Why this matters
- Logging only `.message` discards the stack trace - the most important debugging artifact
- `console.log` for errors means alert routing rules keyed on error level never fire - silent failures
- Empty catch blocks silently swallow bugs - operational errors and programmer errors both vanish

### Fix template
```before
try { /* ... */ } catch (e) { console.log(e.message); }
```
```after
try { /* ... */ } catch (err) {
  logger.error('operation.failed', { err, context: { /* ids, params */ } });
  throw err; // or wrap in typed error - see references/best-practices-per-stack.md#nodejs-error-classes
}
```

### Test cases
SHOULD match (2a):
- `console.log(e.message);`
- `console.log(error.message);`

SHOULD match (2b):
- `console.log('error: ', err)`
- `console.log({ err })`
- `console.log("Error in handler", error)`

SHOULD match (2c):
- `} catch (e) {}`
- `} catch (e) { }`

Should NOT match:
- `logger.error('op.failed', { err })` (uses error level)
- `console.log('starting')` (no error keyword)
- `console.log('error rate: ', rate)` - WILL match but is acceptable false positive

### Reference
- `references/error-taxonomy.md#anti-patterns`
- `references/best-practices-per-stack.md#nodejs`
