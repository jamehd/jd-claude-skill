import { logger } from '../utils/logger';

export async function login(email: string, password: string) {
  // VIOLATION _common/01: log password
  logger.info('login attempt', { email, password });

  // VIOLATION nodejs/03: generic Error throw, no taxonomy
  if (!email) throw new Error('email required');

  // VIOLATION nodejs/02: await outside try/catch in critical path
  const user = await db.findUser(email);
  return user;
}

declare const db: any;
