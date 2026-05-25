import { ValidationError } from '../errors';
import { logger } from '../utils/logger';

export async function login(email: string, password: string) {
  if (!email) throw new ValidationError('email required');

  try {
    const user = await db.findUser(email);
    logger.info('login.attempt', { email }); // no password
    return user;
  } catch (err) {
    logger.error('login.failed', { err, email });
    throw err;
  }
}

declare const db: any;
