## Pattern: Unhandled Promise Rejection
**Severity:** High
**Boost rule:** Critical if in critical_paths
**Dimension:** A (Code-level)

### Detection
- Ripgrep command(s):
- `rg -t ts -t js --line-number "\.then\([^)]*\)"`

For each match returned, the orchestrator checks: is `.catch(` or `.finally(` called on the same chain (within 3 lines after)? If not -> FLAG.

False-positive guards:
- Skip test files (`.test.*`, `.spec.*`, `__tests__/`)
- Skip if chained `.catch` exists on the next 1-3 lines (the orchestrator post-processes)

### Why this matters
In Node.js 15+, unhandled promise rejections terminate the process by default. Before that, they silently swallow the error and confuse debugging. In browsers, unhandled rejections fire `window.onunhandledrejection` but most apps do not handle that event.

Any `.then()` that can throw must have a `.catch()` somewhere on the chain.

### Fix template
```before
chargeProvider.charge(amount).then(saveTransaction);
```
```after
chargeProvider.charge(amount)
  .then(saveTransaction)
  .catch(err => {
    logger.error('charge.failed', { err, amount });
    throw new PaymentError('CHARGE_FAILED', 'Charge failed', err);
  });
```

### Test cases
SHOULD match (and flag):
- `foo().then(x => bar(x))` - no `.catch`

Should NOT flag:
- `foo().then(x => bar(x)).catch(err => log(err))`
- `try { await foo().then(bar); } catch (e) { ... }` (awaited inside try)

### Reference
- `references/error-taxonomy.md#operational-vs-programmer`
- `references/best-practices-per-stack.md#nodejs-error-classes`
