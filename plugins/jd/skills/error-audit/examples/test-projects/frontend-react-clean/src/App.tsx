import { ErrorBoundary } from 'react-error-boundary';
import { Checkout } from './checkout/Checkout';

function AppErrorFallback({ error, resetErrorBoundary }: any) {
  return (
    <div>
      <p>Something went wrong. Please try again.</p>
      <button onClick={resetErrorBoundary}>Reload</button>
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary FallbackComponent={AppErrorFallback}>
      <Checkout />
    </ErrorBoundary>
  );
}
