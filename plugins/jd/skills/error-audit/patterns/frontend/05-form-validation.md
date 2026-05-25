## Pattern: Form Submit Without User Error Feedback
**Severity:** Medium
**Boost rule:** if in critical_paths -> High
**Dimension:** E (User-facing)

### Detection
Heuristic - requires composite check by orchestrator.

- Ripgrep command(s):
- `rg -t ts -t tsx -t jsx -t js -U --multiline-dotall --line-number "(onSubmit|handleSubmit)\s*=\s*\{?\s*(?:async\s+)?\([^)]*\)\s*=>?\s*\{[\s\S]{0,300}?catch"`

For each match: check the catch block for any of:
- `setError(...)`, `setErrorMessage(...)`, `setFormError(...)` - explicit error state set
- `toast.error(...)`, `notify.error(...)`, `showError(...)` - notification call
- `<Alert>`, `<ErrorMessage>` rendered

If catch block contains ONLY `console.log` / `console.error` / `return` -> FLAG (caught the error, no user feedback).

Also flag if loading state (`setLoading(true)`) is set before submit but NOT reset (`setLoading(false)`) in the catch -> form stuck in loading state on error.

### Why this matters
A form that submits, fails, and shows the user nothing:
- User does not know if submit worked
- User clicks again -> double-submit -> duplicate orders
- Or user gives up -> lost conversion
- Or user contacts support -> CS cost

Worse: a loading spinner that never resets after a failed submit -> the form looks broken forever.

### Fix template
```before
const onSubmit = async (data) => {
  setLoading(true);
  try {
    await api.submit(data);
    setSuccess(true);
  } catch (err) {
    console.error(err);
  }
  setLoading(false); // moved outside catch - but doesn't run on early-return in catch
};
```
```after
const onSubmit = async (data) => {
  setLoading(true);
  setError(null);
  try {
    await api.submit(data);
    setSuccess(true);
  } catch (err) {
    console.error('form.submit.failed', err);
    setError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
  } finally {
    setLoading(false); // ALWAYS resets
  }
};

// In JSX:
{error && <Alert severity="error">{error}</Alert>}
<button disabled={loading}>{loading ? 'Submitting...' : 'Submit'}</button>
```

### Reference
- `references/best-practices-per-stack.md#react`
- `references/error-taxonomy.md`
