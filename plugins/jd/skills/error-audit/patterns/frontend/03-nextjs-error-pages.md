## Pattern: Next.js - Missing Error Pages
**Severity:** High
**Boost rule:** N/A
**Dimension:** A (Code-level), E (User-facing)

### Detection
Composite check (orchestrator):

1. Is `next` in `package.json`? If not, SKIP.
2. Detect router style:
   - App Router: `app/` directory exists
   - Pages Router: `pages/` directory exists
3. Check required files:

#### For App Router
- `app/error.tsx` (or `.jsx`/`.ts`/`.js`) - per-route error boundary
- `app/global-error.tsx` - catches layout errors
- `app/not-found.tsx` - 404 handler

For each missing file -> FLAG.

#### For Pages Router
- `pages/_error.tsx` (or `.jsx`/`.ts`/`.js`)
- `pages/404.tsx`
- `pages/500.tsx`

Ripgrep command(s):
- `rg --files | rg "^app/(error|global-error|not-found)\.(tsx|jsx|ts|js)$"`
- `rg --files | rg "^pages/(_error|404|500)\.(tsx|jsx|ts|js)$"`

### Why this matters
Next.js does NOT auto-generate these files. Without them:
- Server-side errors return a default Next.js error page leaking framework version
- Client-side rendering errors crash the entire route subtree with no fallback
- 404s look like 500s (confusing to users)

These files are tiny but critical UX surface.

### Fix template
```after
// app/error.tsx (App Router)
'use client';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div>
      <h2>Something went wrong</h2>
      <p>We've been notified. Please try again or contact support.</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

```after
// app/global-error.tsx (catches layout errors too)
'use client';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  Sentry.captureException(error);
  return (
    <html>
      <body>
        <h2>Application crashed</h2>
        <p>Please reload.</p>
      </body>
    </html>
  );
}
```

### Reference
- `references/best-practices-per-stack.md#nextjs-app-router`
- Next.js docs: https://nextjs.org/docs/app/api-reference/file-conventions/error
