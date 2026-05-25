## Pattern: NestJS - Missing Global ExceptionFilter
**Severity:** High
**Boost rule:** N/A
**Dimension:** A (Code-level)

### Detection
Composite check (orchestrator):
1. Is `@nestjs/core` or `@nestjs/common` in `package.json`? If not, SKIP.
2. Look for an ExceptionFilter:
   - Ripgrep command(s):
   - `rg -t ts --files-with-matches "@Catch\("`
   - `rg -t ts --files-with-matches "implements\s+ExceptionFilter"`
   - `rg -t ts --line-number "useGlobalFilters\("`
3. If NestJS present AND none of the above found -> FLAG "no global ExceptionFilter".

#### 5b. Controller throwing plain `Error` instead of `HttpException`
- Ripgrep command(s):
- `rg -t ts -U --multiline-dotall --line-number "@(Controller|Get|Post|Put|Delete|Patch)\([^)]*\)[\s\S]{0,500}?throw\s+new\s+Error\("`

For each match -> FLAG per-occurrence (overlap with `nodejs/03` is OK; this is the NestJS-specific framing).

### Why this matters
- Without a global `ExceptionFilter`, NestJS falls back to the built-in `BaseExceptionFilter` which:
  - Logs to the default logger only
  - Returns generic 500 with no structured error code
  - Does NOT integrate with your error reporting (Sentry, etc.) unless you wire it
- `throw new Error(...)` in a controller -> NestJS does not auto-map to a sensible HTTP status. Always use `HttpException` subclasses (`BadRequestException`, `NotFoundException`, etc.) or your own custom typed exceptions extending `HttpException`.

### Fix template
```after
// src/filters/all-exceptions.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    this.logger.error(exception);
    if (status >= 500) Sentry.captureException(exception);

    response.status(status).json({
      error: {
        code: exception instanceof HttpException ? exception.name : 'INTERNAL',
        message: exception instanceof HttpException ? exception.message : 'Internal server error',
      },
    });
  }
}

// main.ts:
app.useGlobalFilters(new AllExceptionsFilter());
```

### Reference
- `references/best-practices-per-stack.md#nodejs`
- NestJS docs: https://docs.nestjs.com/exception-filters
