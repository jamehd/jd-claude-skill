import { logger } from '../utils/logger';

export async function chargeCustomer(customerId: string, amount: number, paymentMethodToken: string) {
  // VIOLATION nodejs/01: .then without .catch
  return chargeProvider.charge(amount, paymentMethodToken).then(result => saveTransaction(result));
}

export async function refundCustomer(transactionId: string) {
  try {
    await chargeProvider.refund(transactionId);
  } catch (e) {
    // VIOLATION _common/02: swallow catch (loses stack + context)
    console.log(e.message);
  }
}

export async function logPayment(customerId: string, password: string, amount: number) {
  // VIOLATION _common/01: log sensitive data (password)
  logger.info('payment attempt', { customerId, password, amount });
}

declare const chargeProvider: any;
declare function saveTransaction(r: any): any;
