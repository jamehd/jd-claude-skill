import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  // VIOLATION _common/04: stack trace exposed to user (security leak)
  res.status(500).json({
    error: err.message,
    stack: err.stack,
  });
}
