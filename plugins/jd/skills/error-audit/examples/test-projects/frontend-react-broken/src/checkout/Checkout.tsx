import { useEffect, useState } from 'react';

// VIOLATION frontend/01: critical route (checkout) without nested ErrorBoundary
// VIOLATION frontend/04: fetch without .catch, no user error display
export function Checkout() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/cart').then(r => r.json()).then(setData);
  }, []);

  return <div>{data?.total}</div>;
}
