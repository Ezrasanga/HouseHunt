import * as paymentService from '../services/paymentService.js';

function sendResponse(res, statusCode, success, message, data = null, errors = []) {
  return res.status(statusCode).json({ success, message, data, errors });
}

function handleError(res, err) {
  if (err?.errors) {
    return sendResponse(res, err.status || 400, false, err.message || 'Request failed', null, err.errors);
  }

  return sendResponse(res, err?.status || 500, false, err?.message || 'Internal Server Error', null, []);
}

export async function createPayment(req, res) {
  try {
    const result = await paymentService.createPayment(req.user, req.body);
    return sendResponse(res, 201, true, 'Payment request created successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function getPayment(req, res) {
  try {
    const payment = await paymentService.getPaymentById(req.user, req.params.id);
    return sendResponse(res, 200, true, 'Payment fetched successfully', payment, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function listPayments(req, res) {
  try {
    const result = await paymentService.listPayments(req.user, req.query);
    return sendResponse(res, 200, true, 'Payments fetched successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function listPaymentsByBooking(req, res) {
  try {
    const result = await paymentService.listPaymentsByBookingId(req.user, req.params.bookingId, req.query);
    return sendResponse(res, 200, true, 'Booking payments fetched successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function initiateStkPush(req, res) {
  try {
    const result = await paymentService.initiateStkPush(req.user, req.params.paymentId, req.body.phone);
    return sendResponse(res, 200, true, 'STK Push initiated successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function mpesaCallback(req, res) {
  try {
    const payload = req.body;
    const result = await paymentService.handleMpesaCallback(payload);
    // Acknowledge quickly — Daraja expects a 200
    return res.status(200).json({ success: true, message: 'Callback processed', data: result });
  } catch (err) {
    // Always respond 200 to avoid retries when we intentionally ignore
    console.error('mpesaCallback error', err && err.message);
    return res.status(200).json({ success: true });
  }
}
