import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  logger.error('http.error', { err, path: req.path });

  if (err instanceof AppError) {
    return res.status(400).json({ error: { code: err.code, message: err.message } });
  }
  // Generic error: do NOT leak stack
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
}
