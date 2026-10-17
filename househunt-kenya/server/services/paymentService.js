import mongoose from 'mongoose';
import process from 'node:process';
import Payment from '../models/Payment.js';
import Property from '../models/Property.js';
import PropertyUnlock from '../models/PropertyUnlock.js';
import * as daraja from './darajaService.js';

/**
 * Handle Daraja STK Push callbacks and reconcile payment benefits.
 * This function is idempotent and verifies callback results against Daraja.
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
  const payment = await Payment.findOne({ checkoutRequestId });
  if (!payment) {
    // Do not create records; log safe info and return success to stop retries
    // Avoid logging sensitive callback contents
    console.warn('MPESA callback: payment not found for checkoutRequestId', checkoutRequestId);
    return { success: true, message: 'Payment not found' };
  }

  if (payment.status === 'SUCCESS' || (payment.status === 'FAILED' && resultCode !== 0)) {
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

  if (resultCode === 0) {
    if (!merchantRequestId || !payment.merchantRequestId || String(merchantRequestId) !== String(payment.merchantRequestId)) {
      console.warn('MPESA callback: missing or mismatched merchantRequestId for', checkoutRequestId);
      return { success: true, message: 'Merchant request mismatch' };
    }
    if (!mpesaReceipt || amount == null || (payment.phone && !phone)) {
      console.warn('MPESA callback: incomplete success metadata for', checkoutRequestId);
      return { success: true, message: 'Incomplete callback metadata' };
    }
  }

  const providerResult = await daraja.querySTKPush({ checkoutRequestId });
  if (
    providerResult.checkoutRequestId !== checkoutRequestId ||
    providerResult.merchantRequestId !== merchantRequestId ||
    providerResult.resultCode !== resultCode
  ) {
    console.warn('MPESA callback: Daraja verification mismatch for', checkoutRequestId);
    return { success: true, message: 'Daraja verification pending' };
  }

  if (resultCode !== 0) {
    const update = {
      status: 'FAILED',
      merchantRequestId,
      checkoutRequestId,
    };
    if (mpesaReceipt) update.mpesaReceipt = mpesaReceipt;
    if (parsedDate) update.transactionDate = parsedDate;
    await Payment.updateOne(
      { _id: payment._id, status: 'PENDING', checkoutRequestId, merchantRequestId },
      { $set: update }
    );
    console.warn('MPESA callback: Daraja resultCode != 0 for', checkoutRequestId);
    return { success: true, message: 'Transaction failed' };
  }

  const paymentGranted = await grantPaymentBenefit(payment);
  if (!paymentGranted) {
    return {
      success: true,
      message: 'Payment reconciliation pending',
    };
  }

  const update = {
    status: 'SUCCESS',
    merchantRequestId,
    checkoutRequestId,
    mpesaReceipt,
  };
  if (parsedDate) update.transactionDate = parsedDate;
  await Payment.updateOne(
    { _id: payment._id, checkoutRequestId, merchantRequestId, status: { $in: ['PENDING', 'FAILED'] } },
    { $set: update }
  );
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
  if (/^0[17]\d{8}$/.test(raw)) {
    return `254${raw.slice(1)}`;
  }
  if (/^\+254[17]\d{8}$/.test(raw)) {
    return raw.slice(1);
  }
  if (/^254[17]\d{8}$/.test(raw)) {
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

async function grantPaymentBenefit(payment) {
  const purpose = payment.purpose || 'BOOKING';
  // Historical booking payments keep their transaction record without changing bookings.
  if (purpose === 'BOOKING') return true;

  if (purpose === 'CONTACT_UNLOCK') {
    try {
      await PropertyUnlock.findOneAndUpdate(
        { tenant: payment.tenant, property: payment.property },
        { $setOnInsert: { tenant: payment.tenant, property: payment.property, payment: payment._id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return true;
    } catch (error) {
      if (error?.code === 11000) {
        return Boolean(await PropertyUnlock.exists({ tenant: payment.tenant, property: payment.property }));
      }
      throw error;
    }
  }

  if (purpose === 'LISTING_BOOST') {
    const featuredUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const result = await Property.updateOne(
      {
        _id: payment.property,
        owner: payment.landlord,
        isApproved: true,
        status: 'AVAILABLE',
        featuredPayment: { $ne: payment._id },
      },
      { $set: { featured: true, featuredUntil, featuredPayment: payment._id } }
    );
    if (result.modifiedCount > 0) return true;

    const property = await Property.findOne({ _id: payment.property, featuredPayment: payment._id });
    return Boolean(property);
  }

  console.error('Payment has unsupported purpose during settlement', purpose);
  return false;
}

function configuredFee(environmentKey, defaultAmount) {
  const configured = process.env[environmentKey];
  if (configured === undefined || configured === '') return defaultAmount;
  const amount = Number(configured);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    const error = new Error(`${environmentKey} must be a positive whole number of KES`);
    error.status = 500;
    throw error;
  }
  return amount;
}

export function getPropertyPaymentFees() {
  return {
    unlockFee: configuredFee('PROPERTY_UNLOCK_FEE_KES', 100),
    boostFee: configuredFee('PROPERTY_BOOST_FEE_KES', 200),
  };
}

function sanitizePayment(payment) {
  if (!payment) return null;
  const plain = payment.toObject ? payment.toObject() : payment;
  return {
    id: normalizeId(plain.id || plain._id),
    property: normalizeId(plain.property),
    purpose: plain.purpose,
    payer: normalizeId(plain.payer || plain.tenant),
    tenant: plain.tenant,
    landlord: plain.landlord,
    amount: plain.amount,
    currency: plain.currency,
    method: plain.method,
    status: plain.status,
    hasStkPush: Boolean(plain.checkoutRequestId || plain.merchantRequestId),
    phone: plain.phone,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

export async function createPropertyPayment(user, payload = {}) {
  if (!user?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  const purpose = String(payload.purpose || '').toUpperCase();
  const propertyId = String(payload.propertyId || '');
  if (!['CONTACT_UNLOCK', 'LISTING_BOOST'].includes(purpose)) {
    const error = new Error('Payment purpose must be CONTACT_UNLOCK or LISTING_BOOST');
    error.status = 400;
    throw error;
  }
  if (!mongoose.Types.ObjectId.isValid(propertyId)) {
    const error = new Error('Property ID is invalid');
    error.status = 400;
    throw error;
  }
  if (String(payload.currency || '').toUpperCase() !== 'KES' || String(payload.method || '').toUpperCase() !== 'MPESA') {
    const error = new Error('Property payments must use M-PESA in KES');
    error.status = 400;
    throw error;
  }
  if (payload.phone !== undefined && typeof payload.phone !== 'string') {
    const error = new Error('Phone must be a string');
    error.status = 400;
    throw error;
  }

  const isUnlock = purpose === 'CONTACT_UNLOCK';
  const expectedRole = isUnlock ? 'TENANT' : 'LANDLORD';
  if (user.role !== expectedRole) {
    const error = new Error(isUnlock ? 'Only tenants may unlock property contacts' : 'Only landlords may boost listings');
    error.status = 403;
    throw error;
  }

  const property = await Property.findById(propertyId);
  if (!property) {
    const error = new Error('Property not found');
    error.status = 404;
    throw error;
  }
  if (!property.isApproved || property.status !== 'AVAILABLE') {
    const error = new Error('Only approved available properties can be paid for');
    error.status = 409;
    throw error;
  }

  const ownerId = normalizeId(property.owner);
  if (!ownerId) {
    const error = new Error('Property owner could not be determined');
    error.status = 409;
    throw error;
  }
  if (!isUnlock && ownerId !== normalizeId(user.id)) {
    const error = new Error('You may only boost your own property');
    error.status = 403;
    throw error;
  }

  if (isUnlock && await PropertyUnlock.exists({ tenant: user.id, property: property._id })) {
    const error = new Error('You have already unlocked this property');
    error.status = 409;
    throw error;
  }
  if (!isUnlock && property.featuredUntil && property.featuredUntil > new Date()) {
    const error = new Error('This property already has an active boost');
    error.status = 409;
    throw error;
  }

  const existingPending = await Payment.findOne({
    property: property._id,
    purpose,
    payer: user.id,
    status: 'PENDING',
  });
  if (existingPending) {
    return sanitizePayment(existingPending);
  }

  const { unlockFee, boostFee } = getPropertyPaymentFees();
  const payment = await Payment.create({
    purpose,
    payer: user.id,
    tenant: isUnlock ? user.id : null,
    landlord: ownerId,
    property: property._id,
    amount: isUnlock ? unlockFee : boostFee,
    currency: 'KES',
    method: 'MPESA',
    phone: payload.phone ? payload.phone.trim() : '',
    status: 'PENDING',
  });
  return sanitizePayment(payment);
}

export async function getPropertyPayment(user, propertyId, purposeRaw) {
  if (!user?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }
  if (!mongoose.Types.ObjectId.isValid(String(propertyId))) {
    const error = new Error('Property ID is invalid');
    error.status = 400;
    throw error;
  }
  const purpose = String(purposeRaw || '').toUpperCase();
  if (!['CONTACT_UNLOCK', 'LISTING_BOOST'].includes(purpose)) {
    const error = new Error('Payment purpose must be CONTACT_UNLOCK or LISTING_BOOST');
    error.status = 400;
    throw error;
  }

  const payment = await Payment.findOne({
    property: propertyId,
    purpose,
    payer: user.id,
    status: 'PENDING',
  }).sort('-createdAt');
  return payment ? sanitizePayment(payment) : null;
}

export async function listUnlockedPropertyIds(user) {
  if (!user?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }
  if (user.role !== 'TENANT') {
    const error = new Error('Only tenants may list unlocked properties');
    error.status = 403;
    throw error;
  }
  const unlocks = await PropertyUnlock.find({ tenant: user.id }).select('property').lean();
  return unlocks.map(unlock => normalizeId(unlock.property));
}

export async function getPropertyPaymentById(user, paymentId) {
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

  const payment = await Payment.findOne({
    _id: paymentId,
    purpose: { $in: ['CONTACT_UNLOCK', 'LISTING_BOOST'] },
  });

  if (!payment) {
    const error = new Error('Payment not found');
    error.status = 404;
    throw error;
  }

  const ownerCheck = normalizeId(payment.payer || payment.tenant) === normalizeId(user.id);
  const landlordCheck = normalizeId(payment.landlord) === normalizeId(user.id);
  if (user.role === 'ADMIN' || ownerCheck || landlordCheck) {
    return sanitizePayment(payment);
  }

  const error = new Error('You do not have permission to access this payment');
  error.status = 403;
  throw error;
}

export async function initiateStkPush(user, paymentId, phoneRaw) {
  if (!user?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  const payment = await Payment.findOne({
    _id: paymentId,
    purpose: { $in: ['CONTACT_UNLOCK', 'LISTING_BOOST'] },
  });
  if (!payment) {
    const error = new Error('Payment not found');
    error.status = 404;
    throw error;
  }

  const normalize = (v) => (v && v.toString ? v.toString() : v);
  const purpose = payment.purpose;
  const payerId = normalize(payment.payer || payment.tenant);
  if (payerId !== normalize(user.id)) {
    const error = new Error('You may only initiate STK Push for your own payment');
    error.status = 403;
    throw error;
  }

  const expectedRole = purpose === 'CONTACT_UNLOCK' ? 'TENANT' : 'LANDLORD';
  if (user.role !== expectedRole) {
    const error = new Error(`Only ${expectedRole.toLowerCase()}s may initiate this property payment`);
    error.status = 403;
    throw error;
  }
  const property = await Property.findById(payment.property);
  if (!property || !property.isApproved || property.status !== 'AVAILABLE') {
    const error = new Error('This property is no longer approved and available for payment');
    error.status = 409;
    throw error;
  }
  if (purpose === 'LISTING_BOOST' && normalize(property.owner) !== normalize(user.id)) {
    const error = new Error('You may only boost your own property');
    error.status = 403;
    throw error;
  }
  if (purpose === 'CONTACT_UNLOCK' && normalize(property.owner) === normalize(user.id)) {
    const error = new Error('Property owners do not need to unlock their own contacts');
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

  if (!Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0) {
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
  if (/^0[17]\d{8}$/.test(phone)) {
    normalized = `254${phone.slice(1)}`;
  } else if (/^\+254[17]\d{8}$/.test(phone)) {
    normalized = phone.replace(/^\+/, '');
  } else if (/^254[17]\d{8}$/.test(phone)) {
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
  payment.phone = normalized;
  // Do not change payment.status
  await payment.save();

  return {
    paymentId: String(payment._id),
    checkoutRequestId: payment.checkoutRequestId,
    merchantRequestId: payment.merchantRequestId,
    responseDescription: darajaResp.responseDescription,
  };
}

export async function queryStkPushStatus(user, paymentId) {
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

  const payment = await Payment.findOne({
    _id: paymentId,
    purpose: { $in: ['CONTACT_UNLOCK', 'LISTING_BOOST'] },
  });
  if (!payment) {
    const error = new Error('Payment not found');
    error.status = 404;
    throw error;
  }
  if (normalizeId(payment.payer || payment.tenant) !== normalizeId(user.id)) {
    const error = new Error('You may only query your own payment');
    error.status = 403;
    throw error;
  }
  const purpose = payment.purpose;
  const expectedRole = purpose === 'LISTING_BOOST' ? 'LANDLORD' : 'TENANT';
  if (user.role !== expectedRole) {
    const error = new Error(`Only ${expectedRole.toLowerCase()}s may query this payment`);
    error.status = 403;
    throw error;
  }
  if (String(payment.method).toUpperCase() !== 'MPESA') {
    const error = new Error('Payment method is not MPESA');
    error.status = 400;
    throw error;
  }
  if (payment.status !== 'PENDING') {
    return {
      payment: sanitizePayment(payment),
      resultCode: null,
      resultDescription: '',
    };
  }
  if (!payment.checkoutRequestId || !payment.merchantRequestId) {
    const error = new Error('No Daraja STK request is associated with this payment');
    error.status = 409;
    throw error;
  }

  const result = await daraja.querySTKPush({ checkoutRequestId: payment.checkoutRequestId });
  if (
    result.checkoutRequestId !== payment.checkoutRequestId ||
    result.merchantRequestId !== payment.merchantRequestId
  ) {
    console.warn('MPESA STK query: request identifier mismatch for payment', String(payment._id));
    const error = new Error('Daraja returned a mismatched STK request');
    error.status = 502;
    throw error;
  }

  if (result.resultCode === 0) {
    const paymentGranted = await grantPaymentBenefit(payment);
    if (!paymentGranted) {
      return {
        payment: sanitizePayment(payment),
        resultCode: result.resultCode,
        resultDescription: 'Payment reconciliation pending',
      };
    }
    await Payment.updateOne(
      { _id: payment._id, checkoutRequestId: payment.checkoutRequestId, merchantRequestId: payment.merchantRequestId, status: { $in: ['PENDING', 'FAILED'] } },
      { $set: { status: 'SUCCESS' } }
    );
    payment.status = 'SUCCESS';
  } else if (result.resultCode !== null && result.resultCode !== 0) {
    const updateResult = await Payment.updateOne(
      { _id: payment._id, checkoutRequestId: payment.checkoutRequestId, merchantRequestId: payment.merchantRequestId, status: 'PENDING' },
      { $set: { status: 'FAILED' } }
    );
    if (updateResult.modifiedCount > 0) {
      payment.status = 'FAILED';
    } else {
      const latestPayment = await Payment.findById(paymentId);
      if (latestPayment) payment.status = latestPayment.status;
    }
  }

  return {
    payment: sanitizePayment(payment),
    resultCode: result.resultCode,
    resultDescription: result.resultDescription,
  };
}
