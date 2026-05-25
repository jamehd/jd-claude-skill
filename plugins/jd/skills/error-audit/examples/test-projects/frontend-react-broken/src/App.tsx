import { Checkout } from './checkout/Checkout';

// VIOLATION frontend/01: no ErrorBoundary at app root
export function App() {
  return (
    <div>
      <Checkout />
    </div>
  );
}
