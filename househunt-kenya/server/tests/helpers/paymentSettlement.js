export function mockDarajaVerification(daraja, {
  checkoutRequestId,
  merchantRequestId,
  resultCode,
  resultDescription = '',
}) {
  daraja.__setStkQuery(async () => ({
    checkoutRequestId,
    merchantRequestId,
    resultCode,
    resultDescription,
  }));
}

export function mockPaymentSettlement(Payment, payment) {
  Payment.updateOne = async (filter, update) => {
    const statusMatches = typeof filter.status === 'string'
      ? payment.status === filter.status
      : !filter.status?.$in || filter.status.$in.includes(payment.status);
    const identifiersMatch = String(filter.checkoutRequestId) === String(payment.checkoutRequestId)
      && String(filter.merchantRequestId) === String(payment.merchantRequestId);
    if (String(filter._id) !== String(payment._id) || !statusMatches || !identifiersMatch) {
      return { modifiedCount: 0 };
    }
    Object.assign(payment, update.$set);
    return { modifiedCount: 1 };
  };
}
