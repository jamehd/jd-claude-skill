import { ErrorBoundary } from 'react-error-boundary';
import { useQuery } from '@tanstack/react-query';

function CheckoutError({ error, resetErrorBoundary }: any) {
  return (
    <div>
      <p>Checkout unavailable: {error.message}</p>
      <button onClick={resetErrorBoundary}>Retry</button>
    </div>
  );
}

function CheckoutInner() {
  const { data, error, isError, refetch } = useQuery({
    queryKey: ['cart'],
    queryFn: async () => {
      const r = await fetch('/api/cart');
      if (!r.ok) throw new Error(`Cart fetch failed: ${r.status}`);
      return r.json();
    },
  });

  if (isError) return <div>Error loading cart. <button onClick={() => refetch()}>Retry</button></div>;
  return <div>{data?.total}</div>;
}

export function Checkout() {
  return (
    <ErrorBoundary FallbackComponent={CheckoutError}>
      <CheckoutInner />
    </ErrorBoundary>
  );
}
