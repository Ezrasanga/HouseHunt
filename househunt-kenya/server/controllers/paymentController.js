import * as paymentService from '../services/paymentService.js';
import { recordAuditEvent } from '../services/auditLogService.js';

function sendResponse(res, statusCode, success, message, data = null, errors = []) {
  return res.status(statusCode).json({ success, message, data, errors });
}

function handleError(res, err) {
  if (err?.errors) {
    return sendResponse(res, err.status || 400, false, err.message || 'Request failed', null, err.errors);
  }

  const status = err?.status || 500;
  return sendResponse(res, status, false, status >= 500 ? 'Internal Server Error' : (err?.message || 'Request failed'), null, []);
}

export async function createPropertyPayment(req, res) {
  try {
    const result = await paymentService.createPropertyPayment(req.user, req.body);
    await recordAuditEvent({
      actor: req.user,
      action: 'Property payment created',
      description: `Created a pending ${result.purpose} payment`,
      resourceType: 'payment',
      resourceId: result.id,
    });
    return sendResponse(res, 201, true, 'Property payment request created successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function getPropertyPayment(req, res) {
  try {
    const result = await paymentService.getPropertyPayment(req.user, req.params.propertyId, req.query.purpose);
    return sendResponse(res, 200, true, 'Property payment fetched successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function listUnlockedPropertyIds(req, res) {
  try {
    const propertyIds = await paymentService.listUnlockedPropertyIds(req.user);
    return sendResponse(res, 200, true, 'Unlocked properties fetched successfully', { propertyIds }, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function getPropertyPaymentFees(_req, res) {
  try {
    return sendResponse(res, 200, true, 'Property payment fees fetched successfully', paymentService.getPropertyPaymentFees(), []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function getPropertyPaymentById(req, res) {
  try {
    const payment = await paymentService.getPropertyPaymentById(req.user, req.params.paymentId);
    return sendResponse(res, 200, true, 'Property payment fetched successfully', payment, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function initiateStkPush(req, res) {
  try {
    const result = await paymentService.initiateStkPush(req.user, req.params.paymentId, req.body.phone);
    await recordAuditEvent({
      actor: req.user,
      action: 'M-PESA STK requested',
      description: 'Initiated an M-PESA STK Push',
      resourceType: 'payment',
      resourceId: req.params.paymentId,
    });
    return sendResponse(res, 200, true, 'Property payment STK Push initiated successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function queryStkPushStatus(req, res) {
  try {
    const result = await paymentService.queryStkPushStatus(req.user, req.params.paymentId);
    await recordAuditEvent({
      actor: req.user,
      action: 'M-PESA STK status queried',
      description: `Daraja STK query completed with result code ${result.resultCode ?? 'pending'}`,
      resourceType: 'payment',
      resourceId: req.params.paymentId,
    });
    return sendResponse(res, 200, true, 'Property payment status checked successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function mpesaCallback(req, res) {
  try {
    const payload = req.body;
    const result = await paymentService.handleMpesaCallback(payload);
    await recordAuditEvent({
      action: 'M-PESA callback received',
      description: `Daraja callback processed: ${String(result?.message || 'processed').slice(0, 120)}`,
      resourceType: 'payment',
      outcome: result?.success === false ? 'FAILURE' : 'SUCCESS',
    });
    // Acknowledge quickly — Daraja expects a 200
    return res.status(200).json({ success: true, message: 'Callback processed', data: result });
  } catch (err) {
    console.error('mpesaCallback error', err && err.message);
    return res.status(500).json({ success: false, message: 'Callback processing failed' });
  }
}
