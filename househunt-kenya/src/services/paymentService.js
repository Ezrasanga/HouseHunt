// src/services/paymentService.js

import API from "./api";

export const unlockContact = (data) =>
  API.post("/payments/unlock", data);

export const boostProperty = (data) =>
  API.post("/payments/boost", data);

export const paymentStatus = (id) =>
  API.get(`/payments/${id}`);