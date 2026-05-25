## Pattern: React - Missing Error Boundaries
**Severity:** High
**Boost rule:** Critical for app-root or critical_path
**Dimension:** A (Code-level), E (User-facing)

### Detection
Composite check (orchestrator):

#### 1a. App root without ErrorBoundary
1. Find the app entry: `App.tsx`, `App.jsx`, `main.tsx`, `index.tsx`
2. Ripgrep command(s):
- `rg -t tsx -t ts -t jsx -t js --files-with-matches "ErrorBoundary|componentDidCatch"`
3. If React in `package.json` AND none of the entry files contain `ErrorBoundary` or `componentDidCatch` -> FLAG (Critical).

#### 1b. Critical-route component without nested ErrorBoundary
For each file inside critical_paths (e.g., `src/checkout/`, `src/payment/`):
- Check if it contains `<ErrorBoundary` wrap.
- If not -> FLAG per-file (High, boosted to Critical if file is in critical_paths).

### Why this matters
Without an ErrorBoundary at the app root, ANY component render error tears down the entire React tree -> blank white screen -> user sees nothing -> total UX failure. With one, you can show a fallback UI and call `Sentry.captureException`.

Critical routes (checkout, payment) deserve nested boundaries so an error in one widget does NOT take down the whole flow.

### Fix template
```after
// App.tsx
import { ErrorBoundary } from 'react-error-boundary';

function AppErrorFallback({ error, resetErrorBoundary }: any) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <p>Please reload the page. If the problem persists, contact support.</p>
      <button onClick={resetErrorBoundary}>Reload</button>
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary FallbackComponent={AppErrorFallback} onError={Sentry.captureException}>
      <Routes>{/* ... */}</Routes>
    </ErrorBoundary>
  );
}
```

For per-route nesting:
```after
<Route path="/checkout" element={
  <ErrorBoundary FallbackComponent={CheckoutErrorFallback}>
    <Checkout />
  </ErrorBoundary>
} />
```

### Reference
- `references/best-practices-per-stack.md#react`
- https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
