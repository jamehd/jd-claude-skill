import { PaymentError } from '../errors';
import { logger } from '../utils/logger';

export async function chargeCustomer(customerId: string, amount: number, paymentMethodToken: string) {
  try {
    const result = await chargeProvider.charge(amount, paymentMethodToken);
    return await saveTransaction(result);
  } catch (err) {
    logger.error('payment.charge_failed', { err, customerId, amount });
    throw new PaymentError('CHARGE_FAILED', 'Failed to charge customer', err as Error);
  }
}

declare const chargeProvider: any;
declare function saveTransaction(r: any): any;
