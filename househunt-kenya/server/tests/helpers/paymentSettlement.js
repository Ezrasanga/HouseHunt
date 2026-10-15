export function mockBookingSettlement(Booking, booking) {
  Booking.updateOne = async (filter, update) => {
    if (Array.isArray(update)) {
      const totalDue = Number(booking.totalDue);
      booking.paymentStatus = Number.isFinite(totalDue) && totalDue > 0 && booking.amountPaid < totalDue
        ? 'PARTIAL'
        : 'PAID';
      return { modifiedCount: 1, matchedCount: 1 };
    }

    const alreadySettled = (booking.settledPaymentIds || []).some(id => String(id) === String(filter.settledPaymentIds.$ne));
    if (booking.status !== 'APPROVED' || alreadySettled) return { modifiedCount: 0 };

    booking.amountPaid = Number(booking.amountPaid || 0) + update.$inc.amountPaid;
    booking.settledPaymentIds = [...(booking.settledPaymentIds || []), update.$addToSet.settledPaymentIds];
    return { modifiedCount: 1 };
  };
  Booking.exists = async filter => {
    const exists = String(booking._id) === String(filter._id)
      && (booking.settledPaymentIds || []).some(id => String(id) === String(filter.settledPaymentIds));
    return exists ? { _id: booking._id } : null;
  };
}

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
