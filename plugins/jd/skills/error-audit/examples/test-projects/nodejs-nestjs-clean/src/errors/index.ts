export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: Error,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super('VALIDATION', message, undefined, meta);
  }
}

export class PaymentError extends AppError {}
