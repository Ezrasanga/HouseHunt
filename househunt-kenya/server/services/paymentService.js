import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import Booking from '../models/Booking.js';
import * as provider from './payments/provider.js';
import * as daraja from './darajaService.js';

/**
 * Handle Daraja STK Push callback payload and reconcile payment/booking.
 * This function is idempotent and treats the provider callback as authoritative.
 */
export async function handleMpesaCallback(payload = {}) {
  // Safely navigate into structure
  const stk = payload?.Body?.stkCallback;
  if (!stk || typeof stk !== 'object') {
    // Malformed payload; return without throwing to ack callback
    return { success: true, message: 'Ignored malformed callback' };
  }

  const merchantRequestId = stk.MerchantRequestID || stk.merchantRequestId || '';
  const checkoutRequestId = stk.CheckoutRequestID || stk.checkoutRequestId || '';
  const resultCode = Number(stk.ResultCode ?? stk.resultCode ?? -1);

  if (!checkoutRequestId) {
    // Nothing to reconcile against
    return { success: true, message: 'No CheckoutRequestID' };
  }

  // Find payment by checkoutRequestId
  const maybeQuery = Payment.findOne({ checkoutRequestId });
  let payment;
  if (maybeQuery && typeof maybeQuery.populate === 'function') {
    payment = await maybeQuery.populate('booking');
  } else {
    payment = await maybeQuery;
  }
  if (!payment) {
    // Do not create records; log safe info and return success to stop retries
    // Avoid logging sensitive callback contents
    console.warn('MPESA callback: payment not found for checkoutRequestId', checkoutRequestId);
    return { success: true, message: 'Payment not found' };
  }

  // Idempotency: if already terminal, do not change state
  if (payment.status === 'SUCCESS') {
    return { success: true, message: 'Already processed' };
  }
  if (payment.status === 'FAILED') {
    return { success: true, message: 'Already processed' };
  }

  // Extract callback metadata items into a map
  const items = Array.isArray(stk.CallbackMetadata?.Item) ? stk.CallbackMetadata.Item : [];
  const meta = {};
  for (const it of items) {
    if (!it) continue;
    const name = it.Name || it.name || it.key;
    if (!name) continue;
    meta[name] = it.Value ?? it.value ?? null;
  }

  const mpesaReceipt = meta.MpesaReceiptNumber || meta.MpesaReceipt || meta.MpesaReceiptNo || meta.MpesaReceiptNumber || '';
  const amount = meta.Amount ?? meta.amount ?? null;
  const transDateRaw = meta.TransactionDate ?? meta.transactionDate ?? null;
  const phone = meta.PhoneNumber ?? meta.phone ?? null;

  const parsedDate = (() => {
    if (!transDateRaw) return null;
    const numeric = Number(String(transDateRaw));
    if (Number.isFinite(numeric)) {
      const date = new Date(numeric);
      if (!Number.isNaN(date.getTime())) return date;
    }
    const iso = new Date(String(transDateRaw));
    return Number.isNaN(iso.getTime()) ? null : iso;
  })();

  // Basic reconciliation checks
  if (merchantRequestId && payment.merchantRequestId && String(merchantRequestId) !== String(payment.merchantRequestId)) {
    console.warn('MPESA callback: merchantRequestId mismatch for', checkoutRequestId);
    return { success: true, message: 'Merchant request mismatch' };
  }

  if (amount != null && !isAmountEqual(amount, payment.amount)) {
    console.warn('MPESA callback: amount mismatch for', checkoutRequestId);
    return { success: true, message: 'Amount mismatch' };
  }

  if (phone && payment.phone && !phoneMatches(phone, payment.phone)) {
    console.warn('MPESA callback: phone mismatch for', checkoutRequestId);
    return { success: true, message: 'Phone mismatch' };
  }

  if (resultCode !== 0) {
    payment.merchantRequestId = merchantRequestId || payment.merchantRequestId;
    payment.checkoutRequestId = checkoutRequestId || payment.checkoutRequestId;
    payment.mpesaReceipt = mpesaReceipt || payment.mpesaReceipt || '';
    if (parsedDate) {
      payment.transactionDate = parsedDate;
    }
    payment.status = 'FAILED';
    await payment.save();
    console.warn('MPESA callback: Daraja resultCode != 0 for', checkoutRequestId);
    return { success: true, message: 'Transaction failed' };
  }

  payment.merchantRequestId = merchantRequestId || payment.merchantRequestId;
  payment.checkoutRequestId = checkoutRequestId || payment.checkoutRequestId;
  payment.mpesaReceipt = mpesaReceipt || payment.mpesaReceipt || '';
  if (parsedDate) {
    payment.transactionDate = parsedDate;
  }
  payment.status = 'SUCCESS';
  await payment.save();

  await ensureBookingPaid(payment);

  return { success: true, message: 'Payment reconciled' };
}

function normalizeId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (value?.toString && typeof value.toString === 'function') {
      const stringValue = value.toString();
      if (stringValue && stringValue !== '[object Object]') return stringValue;
    }
    if (value._id) return normalizeId(value._id);
    if (value.id) return normalizeId(value.id);
  }
  return null;
}

function normalizePhone(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^0(7|1)\d{8}$/.test(raw)) {
    return `254${raw.slice(1)}`;
  }
  if (/^\+2547\d{8}$/.test(raw)) {
    return raw.slice(1);
  }
  if (/^2547\d{8}$/.test(raw)) {
    return raw;
  }
  return null;
}

function phoneMatches(a, b) {
  const normalizedA = normalizePhone(a);
  const normalizedB = normalizePhone(b);
  if (!normalizedA || !normalizedB) return false;
  return normalizedA === normalizedB;
}

function isAmountEqual(a, b) {
  const amountA = Number(a);
  const amountB = Number(b);
  if (!Number.isFinite(amountA) || !Number.isFinite(amountB)) return false;
  return Math.abs(amountA - amountB) < 0.001;
}

async function ensureBookingPaid(payment) {
  try {
    const bookingId = payment.booking?._id || payment.booking;
    if (!bookingId) return;
    const booking = await Booking.findById(bookingId);
    if (!booking) return;
    if (String(booking._id) !== String(bookingId)) return;
    if (booking.paymentStatus !== 'PAID') {
      booking.paymentStatus = 'PAID';
      await booking.save();
    }
  } catch (e) {
    console.warn('MPESA callback: failed to ensure booking PAID', e && e.message);
  }
}

function parsePagination(query = {}) {
  const page = Number.parseInt(String(query.page || '1'), 10);
  const limit = Number.parseInt(String(query.limit || '10'), 10);
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(100, limit) : 10,
  };
}

function buildPagination(page, limit, total) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

function sanitizePayment(payment) {
  if (!payment) return null;
  const plain = payment.toObject ? payment.toObject() : payment;
  return {
    id: normalizeId(plain.id || plain._id),
    booking: plain.booking,
    tenant: plain.tenant,
    landlord: plain.landlord,
    amount: plain.amount,
    currency: plain.currency,
    method: plain.method,
    status: plain.status,
    phone: plain.phone,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

function validateCreatePayload(payload = {}) {
  const errors = [];
  const amount = payload.amount;
  const currency = payload.currency;
  const method = payload.method;
  const bookingId = payload.bookingId;
  const phone = payload.phone;

  if (!bookingId) {
    errors.push({ field: 'bookingId', message: 'Booking ID is required' });
  } else if (!mongoose.Types.ObjectId.isValid(String(bookingId))) {
    errors.push({ field: 'bookingId', message: 'Booking ID is invalid' });
  }

  if (amount === undefined || amount === null || amount === '') {
    errors.push({ field: 'amount', message: 'Amount is required' });
  } else if (typeof Number(amount) !== 'number' || Number(amount) <= 0) {
    errors.push({ field: 'amount', message: 'Amount must be a positive number' });
  }

  if (!currency) {
    errors.push({ field: 'currency', message: 'Currency is required' });
  } else if (!['KES', 'USD', 'EUR'].includes(String(currency).toUpperCase())) {
    errors.push({ field: 'currency', message: 'Currency must be one of KES, USD, EUR' });
  }

  if (!method) {
    errors.push({ field: 'method', message: 'Payment method is required' });
  } else if (!['MPESA', 'CARD', 'BANK'].includes(String(method).toUpperCase())) {
    errors.push({ field: 'method', message: 'Payment method must be MPESA, CARD, or BANK' });
  }

  if (phone && typeof phone !== 'string') {
    errors.push({ field: 'phone', message: 'Phone must be a string' });
  }

  return { success: errors.length === 0, errors };
}

export async function createPayment(user, payload = {}) {
  if (!user?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (user.role !== 'TENANT') {
    const error = new Error('Only tenants may initiate payments');
    error.status = 403;
    throw error;
  }

  const validation = validateCreatePayload(payload);
  if (!validation.success) {
    const error = new Error('Validation failed');
    error.status = 400;
    error.errors = validation.errors;
    throw error;
  }

  const booking = await Booking.findById(payload.bookingId).populate('property', 'owner');
  if (!booking) {
    const error = new Error('Booking not found');
    error.status = 404;
    throw error;
  }

  if (normalizeId(booking.tenant) !== normalizeId(user.id)) {
    const error = new Error('You may only pay for your own booking');
    error.status = 403;
    throw error;
  }

  if (booking.status !== 'APPROVED') {
    const error = new Error('Payment may only be initiated for approved bookings');
    error.status = 400;
    throw error;
  }

  if (booking.paymentStatus === 'PAID') {
    const error = new Error('No further payment is required for a paid booking');
    error.status = 400;
    throw error;
  }

  const amount = Number(payload.amount);
  if (amount <= 0) {
    const error = new Error('Amount must be a positive number');
    error.status = 400;
    error.errors = [{ field: 'amount', message: 'Amount must be greater than 0' }];
    throw error;
  }

  const existingPending = await Payment.findOne({ booking: booking._id, status: 'PENDING' });
  if (existingPending) {
    const error = new Error('There is already an active pending payment for this booking');
    error.status = 409;
    throw error;
  }

  const payment = await Payment.create({
    booking: booking._id,
    tenant: booking.tenant,
    landlord: booking.landlord,
    amount,
    currency: String(payload.currency).toUpperCase(),
    method: String(payload.method).toUpperCase(),
    phone: payload.phone ? String(payload.phone).trim() : '',
    status: 'PENDING',
  });

  await provider.initiatePaymentRequest({
    paymentId: payment._id,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    phone: payment.phone,
    bookingId: payment.booking,
    tenantId: payment.tenant,
    landlordId: payment.landlord,
  });

  return sanitizePayment(payment);
}

export async function getPaymentById(user, paymentId) {
  if (!user?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(String(paymentId))) {
    const error = new Error('Payment ID is invalid');
    error.status = 400;
    throw error;
  }

  const payment = await Payment.findById(paymentId)
    .populate('booking', 'tenant landlord property status paymentStatus')
    .lean();

  if (!payment) {
    const error = new Error('Payment not found');
    error.status = 404;
    throw error;
  }

  const ownerCheck = normalizeId(payment.tenant) === normalizeId(user.id);
  const landlordCheck = normalizeId(payment.landlord) === normalizeId(user.id);
  if (user.role === 'ADMIN' || ownerCheck || landlordCheck) {
    return sanitizePayment(payment);
  }

  const error = new Error('You do not have permission to access this payment');
  error.status = 403;
  throw error;
}

export async function listPayments(user, query = {}) {
  if (!user?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  const filter = {};
  const { page, limit } = parsePagination(query);

  if (query.status) {
    const normalized = String(query.status).toUpperCase();
    if (!['PENDING', 'SUCCESS', 'FAILED'].includes(normalized)) {
      const error = new Error('Invalid payment status filter');
      error.status = 400;
      throw error;
    }
    filter.status = normalized;
  }

  if (query.bookingId) {
    if (!mongoose.Types.ObjectId.isValid(String(query.bookingId))) {
      const error = new Error('Booking ID filter is invalid');
      error.status = 400;
      throw error;
    }
    filter.booking = query.bookingId;
  }

  if (query.tenantId) {
    if (!mongoose.Types.ObjectId.isValid(String(query.tenantId))) {
      const error = new Error('Tenant ID filter is invalid');
      error.status = 400;
      throw error;
    }
    filter.tenant = query.tenantId;
  }

  if (query.landlordId) {
    if (!mongoose.Types.ObjectId.isValid(String(query.landlordId))) {
      const error = new Error('Landlord ID filter is invalid');
      error.status = 400;
      throw error;
    }
    filter.landlord = query.landlordId;
  }

  if (user.role === 'TENANT') {
    filter.tenant = user.id;
  } else if (user.role === 'LANDLORD') {
    filter.landlord = user.id;
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Payment.countDocuments(filter),
  ]);

  return {
    payments: payments.map(sanitizePayment),
    pagination: buildPagination(page, limit, total),
  };
}

export async function listPaymentsByBookingId(user, bookingId, query = {}) {
  if (!user?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(String(bookingId))) {
    const error = new Error('Booking ID is invalid');
    error.status = 400;
    throw error;
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    const error = new Error('Booking not found');
    error.status = 404;
    throw error;
  }

  const isTenant = normalizeId(booking.tenant) === normalizeId(user.id);
  const isLandlord = normalizeId(booking.landlord) === normalizeId(user.id);

  if (user.role !== 'ADMIN' && !isTenant && !isLandlord) {
    const error = new Error('You do not have permission to view payments for this booking');
    error.status = 403;
    throw error;
  }

  const filter = { booking: booking._id };
  const { page, limit } = parsePagination(query);

  if (query.status) {
    const normalized = String(query.status).toUpperCase();
    if (!['PENDING', 'SUCCESS', 'FAILED'].includes(normalized)) {
      const error = new Error('Invalid payment status filter');
      error.status = 400;
      throw error;
    }
    filter.status = normalized;
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Payment.countDocuments(filter),
  ]);

  return {
    payments: payments.map(sanitizePayment),
    pagination: buildPagination(page, limit, total),
  };
}

export async function initiateStkPush(user, paymentId, phoneRaw) {
  if (!user?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (user.role !== 'TENANT') {
    const error = new Error('Only tenants may initiate STK Push');
    error.status = 403;
    throw error;
  }

  // Allow non-ObjectId test ids; call findById and handle chainable or promise results
  const raw = Payment.findById(paymentId);
  let payment;
  if (raw && typeof raw.populate === 'function') {
    payment = await raw.populate('booking');
  } else {
    payment = await raw;
    if (payment && typeof payment.populate === 'function') {
      payment = await payment.populate('booking');
    }
  }
  if (!payment) {
    const error = new Error('Payment not found');
    error.status = 404;
    throw error;
  }

  const normalize = (v) => (v && v.toString ? v.toString() : v);
  if (normalize(payment.tenant) !== normalize(user.id)) {
    const error = new Error('You may only initiate STK Push for your own payment');
    error.status = 403;
    throw error;
  }

  const booking = await Booking.findById(payment.booking);
  if (!booking) {
    const error = new Error('Associated booking not found');
    error.status = 404;
    throw error;
  }

  if (normalize(booking.tenant) !== normalize(user.id)) {
    const error = new Error('Booking does not belong to authenticated tenant');
    error.status = 403;
    throw error;
  }

  if (String(payment.method).toUpperCase() !== 'MPESA') {
    const error = new Error('Payment method is not MPESA');
    error.status = 400;
    throw error;
  }

  if (payment.status !== 'PENDING') {
    const error = new Error('STK Push may only be initiated for pending payments');
    error.status = 400;
    throw error;
  }

  if (Number(payment.amount) <= 0) {
    const error = new Error('Invalid payment amount');
    error.status = 400;
    throw error;
  }

  if (String(payment.currency).toUpperCase() !== 'KES') {
    const error = new Error('Currency must be KES for STK Push');
    error.status = 400;
    throw error;
  }

  if (payment.checkoutRequestId || payment.merchantRequestId) {
    const error = new Error('An STK Push has already been initiated for this payment');
    error.status = 409;
    throw error;
  }

  // Validate and normalize phone
  if (!phoneRaw || typeof phoneRaw !== 'string') {
    const error = new Error('Phone number is required');
    error.status = 400;
    throw error;
  }

  const phone = phoneRaw.trim();
  // Accept 07XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX
  let normalized;
  if (/^0(7|1)\d{8}$/.test(phone)) {
    // 07XXXXXXXX or 01? (keep only 07 for Kenya mobile)
    normalized = `254${phone.slice(1)}`;
  } else if (/^\+2547\d{8}$/.test(phone)) {
    normalized = phone.replace(/^\+/, '');
  } else if (/^2547\d{8}$/.test(phone)) {
    normalized = phone;
  } else {
    const error = new Error('Invalid Kenyan phone number');
    error.status = 400;
    throw error;
  }

  // Avoid logging the phone; only keep normalized for request

  // Build account reference: HH-<paymentId short>
  const accRef = `HH-${String(payment._id).slice(0, 8)}`;

  // Call Daraja
  let darajaResp;
  try {
    darajaResp = await daraja.initiateSTKPush({ amount: payment.amount, phone: normalized, accountReference: accRef, transactionDesc: `Payment ${accRef}` });
  } catch (err) {
    // Map daraja errors to 502 or preserve status
    const error = new Error(err.message || 'STK Push failed');
    error.status = err.status || 502;
    throw error;
  }

  // Store provider identifiers
  payment.merchantRequestId = darajaResp.merchantRequestId || '';
  payment.checkoutRequestId = darajaResp.checkoutRequestId || '';
  // Do not change payment.status
  await payment.save();

  return {
    paymentId: String(payment._id),
    checkoutRequestId: payment.checkoutRequestId,
    merchantRequestId: payment.merchantRequestId,
    responseDescription: darajaResp.responseDescription,
  };
}
