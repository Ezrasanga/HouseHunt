import api from "./api";

export async function createPayment(payload) {
  const response = await api.post("/api/payments", payload);
  return response.data?.data;
}

export async function getPaymentsByBooking(bookingId, params = {}) {
  const response = await api.get(`/api/payments/booking/${bookingId}`, { params });
  return {
    payments: response.data?.data?.payments || [],
    pagination: response.data?.data?.pagination || null,
  };
}

export async function getPayment(paymentId) {
  const response = await api.get(`/api/payments/${paymentId}`);
  return response.data?.data;
}

export async function initiateStkPush(paymentId, phone) {
  const response = await api.post(`/api/payments/${paymentId}/stk-push`, { phone });
  return response.data?.data;
}

export async function queryStkPushStatus(paymentId) {
  const response = await api.post(`/api/payments/${paymentId}/stk-query`);
  return response.data?.data;
}