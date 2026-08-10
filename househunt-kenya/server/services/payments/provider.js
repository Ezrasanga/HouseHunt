let initiatePaymentRequest = async function (paymentPayload) {
  // This is a provider-agnostic stub for the payment flow.
  // Daraja or another provider integration can be implemented here later.
  return {
    provider: 'stub',
    startedAt: new Date(),
    metadata: {
      bookingId: paymentPayload?.bookingId,
    },
  };
};

export function setInitiatePaymentRequest(fn) {
  initiatePaymentRequest = fn;
}

export { initiatePaymentRequest };
