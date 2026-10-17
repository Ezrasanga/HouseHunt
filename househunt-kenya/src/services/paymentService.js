import api from "./api";

export async function createPropertyPayment(payload) {
  const response = await api.post("/api/payments/property", payload);
  return response.data?.data;
}

export async function getPropertyPayment(propertyId, purpose) {
  const response = await api.get(`/api/payments/property/${propertyId}`, { params: { purpose } });
  return response.data?.data || null;
}

export async function getUnlockedPropertyIds() {
  const response = await api.get("/api/payments/unlocks");
  return response.data?.data?.propertyIds || [];
}

export async function getPropertyPaymentFees() {
  const response = await api.get("/api/payments/fees");
  return response.data?.data;
}

export async function getPropertyPaymentById(paymentId) {
  const response = await api.get(`/api/payments/property-payments/${paymentId}`);
  return response.data?.data;
}

export async function initiateStkPush(paymentId, phone) {
  const response = await api.post(`/api/payments/property-payments/${paymentId}/stk-push`, { phone });
  return response.data?.data;
}

export async function queryStkPushStatus(paymentId) {
  const response = await api.post(`/api/payments/property-payments/${paymentId}/stk-query`);
  return response.data?.data;
}