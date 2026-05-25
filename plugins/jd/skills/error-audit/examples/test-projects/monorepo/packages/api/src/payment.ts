import { logger } from './logger';
export async function pay(password: string) {
  // VIOLATION _common/01
  logger.info('pay', { password });
}
declare const logger: any;
