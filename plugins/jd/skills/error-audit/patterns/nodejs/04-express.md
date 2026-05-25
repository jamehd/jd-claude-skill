## Pattern: Express - Missing Error Middleware
**Severity:** High
**Boost rule:** N/A (already High; affects all routes)
**Dimension:** A (Code-level)

### Detection
Composite check (orchestrator):
1. Is `express` in `package.json` dependencies? If not, SKIP this pattern.
2. Look for the 4-arg error middleware signature `(err, req, res, next)`:
   - Ripgrep command(s):
   - `rg -t ts -t js -U --multiline-dotall --line-number "app\.use\(\s*(?:function\s*)?\(?\s*err\s*[,:]\s*\w+\s*[,:]\s*\w+\s*[,:]\s*\w+"`
   - `rg -t ts -t js -U --multiline-dotall --line-number "function\s+\w+\s*\(\s*err\s*[,:][^)]*req[^)]*res[^)]*next"`
3. If `express` present AND no 4-arg middleware found -> FLAG.

### Why this matters
Express only treats a function as error middleware if it has EXACTLY 4 parameters: `(err, req, res, next)`. Without one, errors thrown in route handlers are silently swallowed (sync) or call the default handler that returns the stack trace as the response body (async via `express-async-errors`) - both bad.

### Fix template
```after
// src/middleware/error-handler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  logger.error('http.error', { err, path: req.path, method: req.method });

  if (err instanceof AppError) {
    return res.status(400).json({
      error: { code: err.code, message: err.message },
    });
  }

  return res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong on our side.' },
  });
}

// src/app.ts - register LAST (after all routes):
app.use(errorHandler);
```

### Reference
- `references/best-practices-per-stack.md#nodejs`
- Express docs: https://expressjs.com/en/guide/error-handling.html
