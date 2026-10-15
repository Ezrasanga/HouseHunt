import test from 'node:test';
import assert from 'node:assert/strict';

import * as paymentService from '../services/paymentService.js';
import Payment from '../models/Payment.js';
import Booking from '../models/Booking.js';
import * as daraja from '../services/darajaService.js';
import { mockBookingSettlement, mockDarajaVerification, mockPaymentSettlement } from './helpers/paymentSettlement.js';

const origPaymentFindOne = Payment.findOne;
const origPaymentUpdateOne = Payment.updateOne;
const origBookingFindById = Booking.findById;
const origBookingUpdateOne = Booking.updateOne;
const origBookingExists = Booking.exists;

function makeCallback({ merchantRequestId = 'mr-1', checkoutRequestId = 'cr-1', resultCode = 0, items = [] } = {}) {
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: merchantRequestId,
        CheckoutRequestID: checkoutRequestId,
        ResultCode: resultCode,
        ResultDesc: 'The service request is processed successfully.',
        CallbackMetadata: items.length ? { Item: items } : undefined,
      },
    },
  };
}

test('successful callback updates Payment and Booking', async () => {
  const payment = { _id: 'p1', tenant: 't1', booking: 'b1', merchantRequestId: 'mr-1', checkoutRequestId: 'cr-1', status: 'PENDING', amount: 1000, currency: 'KES', phone: '254712345678' };
  Payment.findOne = async () => payment;
  mockPaymentSettlement(Payment, payment);
  const booking = { _id: 'b1', status: 'APPROVED', amountPaid: 0, totalDue: 1000, paymentStatus: 'UNPAID' };
  mockBookingSettlement(Booking, booking);
  mockDarajaVerification(daraja, { merchantRequestId: 'mr-1', checkoutRequestId: 'cr-1', resultCode: 0 });

  const items = [ { Name: 'Amount', Value: 1000 }, { Name: 'MpesaReceiptNumber', Value: 'MPESA123' }, { Name: 'PhoneNumber', Value: '254712345678' }, { Name: 'TransactionDate', Value: Date.now() } ];
  const cb = makeCallback({ items });

  const res = await paymentService.handleMpesaCallback(cb);
  assert.equal(res.success, true);
  assert.equal(payment.status, 'SUCCESS');
  assert.equal(payment.mpesaReceipt, 'MPESA123');
  assert.equal(booking.paymentStatus, 'PAID');
});

test('callback cannot settle a payment when Daraja has not confirmed success', async () => {
  const payment = { _id: 'p-unverified', booking: 'b-unverified', merchantRequestId: 'mr-unverified', checkoutRequestId: 'cr-unverified', status: 'PENDING', amount: 1000, phone: '254712345678' };
  Payment.findOne = async () => payment;
  mockPaymentSettlement(Payment, payment);
  mockDarajaVerification(daraja, {
    merchantRequestId: 'mr-unverified',
    checkoutRequestId: 'cr-unverified',
    resultCode: 1037,
  });

  const result = await paymentService.handleMpesaCallback(makeCallback({
    merchantRequestId: 'mr-unverified',
    checkoutRequestId: 'cr-unverified',
    resultCode: 0,
    items: [
      { Name: 'Amount', Value: 1000 },
      { Name: 'MpesaReceiptNumber', Value: 'FAKE123' },
      { Name: 'PhoneNumber', Value: '254712345678' },
    ],
  }));

  assert.equal(result.message, 'Daraja verification pending');
  assert.equal(payment.status, 'PENDING');
});

test('amount mismatch does not mark payment success', async () => {
  const payment = { _id: 'p2', tenant: 't1', booking: 'b2', merchantRequestId: 'mr-2', checkoutRequestId: 'cr-2', status: 'PENDING', amount: 2000, currency: 'KES', phone: '254712345678', save: async function() { saved = this; } };
  let saved = null;
  Payment.findOne = async () => payment;
  Booking.findById = async () => ({ _id: 'b2', status: 'APPROVED', paymentStatus: 'UNPAID', save: async function() { bkSaved = this; } });
  let bkSaved = null;

  const items = [ { Name: 'Amount', Value: 1500 }, { Name: 'MpesaReceiptNumber', Value: 'MPESA999' }, { Name: 'PhoneNumber', Value: '254712345678' }, { Name: 'TransactionDate', Value: Date.now() } ];
  const cb = makeCallback({ merchantRequestId: 'mr-2', checkoutRequestId: 'cr-2', items });

  const res = await paymentService.handleMpesaCallback(cb);
  assert.equal(res.success, true);
  assert.equal(payment.status, 'PENDING');
  assert.equal(saved, null);
  assert.equal(bkSaved, null);
});

test('phone mismatch does not mark payment success', async () => {
  const payment = { _id: 'p3', tenant: 't1', booking: 'b3', merchantRequestId: 'mr-3', checkoutRequestId: 'cr-3', status: 'PENDING', amount: 1000, currency: 'KES', phone: '254700000000', save: async function() { saved = this; } };
  let saved = null;
  Payment.findOne = async () => payment;
  Booking.findById = async () => ({ _id: 'b3', paymentStatus: 'UNPAID', save: async function() { bkSaved = this; } });
  let bkSaved = null;

  const items = [ { Name: 'Amount', Value: 1000 }, { Name: 'MpesaReceiptNumber', Value: 'MPESA456' }, { Name: 'PhoneNumber', Value: '254712345678' }, { Name: 'TransactionDate', Value: Date.now() } ];
  const cb = makeCallback({ merchantRequestId: 'mr-3', checkoutRequestId: 'cr-3', items });

  const res = await paymentService.handleMpesaCallback(cb);
  assert.equal(res.success, true);
  assert.equal(payment.status, 'PENDING');
  assert.equal(saved, null);
  assert.equal(bkSaved, null);
});

test('unknown checkoutRequestId handled safely', async () => {
  Payment.findOne = async () => null;
  const cb = makeCallback({ merchantRequestId: 'x', checkoutRequestId: 'unknown', items: [] });
  const res = await paymentService.handleMpesaCallback(cb);
  assert.equal(res.success, true);
});

test('failed resultCode does not mark success', async () => {
  const payment = { _id: 'p4', tenant: 't1', booking: 'b4', merchantRequestId: 'mr-4', checkoutRequestId: 'cr-4', status: 'PENDING', amount: 500, currency: 'KES', phone: '254712345678' };
  Payment.findOne = async () => payment;
  mockPaymentSettlement(Payment, payment);

  const cb = makeCallback({ merchantRequestId: 'mr-4', checkoutRequestId: 'cr-4', resultCode: 1, items: [] });
  mockDarajaVerification(daraja, { merchantRequestId: 'mr-4', checkoutRequestId: 'cr-4', resultCode: 1 });
  const res = await paymentService.handleMpesaCallback(cb);
  assert.equal(res.success, true);
  assert.equal(payment.status, 'FAILED');
});

test('duplicate successful callback is idempotent', async () => {
  const payment = { _id: 'p5', tenant: 't1', booking: 'b5', merchantRequestId: 'mr-5', checkoutRequestId: 'cr-5', status: 'SUCCESS', amount: 1000, currency: 'KES', phone: '254712345678', save: async function() { saved = this; } };
  let saved = null;
  Payment.findOne = async () => payment;

  const items = [ { Name: 'Amount', Value: 1000 }, { Name: 'MpesaReceiptNumber', Value: 'MPESA777' }, { Name: 'PhoneNumber', Value: '254712345678' }, { Name: 'TransactionDate', Value: Date.now() } ];
  const cb = makeCallback({ merchantRequestId: 'mr-5', checkoutRequestId: 'cr-5', items });

  const res = await paymentService.handleMpesaCallback(cb);
  assert.equal(res.success, true);
  assert.equal(saved, null);
});

test('merchantRequestId mismatch is handled safely', async () => {
  const payment = { _id: 'p6', tenant: 't1', booking: 'b6', merchantRequestId: 'mr-old', checkoutRequestId: 'cr-6', status: 'PENDING', amount: 1000, currency: 'KES', phone: '254712345678', save: async function() { saved = this; } };
  let saved = null;
  Payment.findOne = async () => payment;

  const items = [ { Name: 'Amount', Value: 1000 }, { Name: 'MpesaReceiptNumber', Value: 'MPESA789' }, { Name: 'PhoneNumber', Value: '254712345678' }, { Name: 'TransactionDate', Value: Date.now() } ];
  const cb = makeCallback({ merchantRequestId: 'mr-new', checkoutRequestId: 'cr-6', items });

  const res = await paymentService.handleMpesaCallback(cb);
  assert.equal(res.success, true);
  assert.equal(payment.status, 'PENDING');
  assert.equal(saved, null);
});

test('malformed callback body handled safely', async () => {
  const res = await paymentService.handleMpesaCallback({});
  assert.equal(res.success, true);
});

test.after(() => {
  Payment.findOne = origPaymentFindOne;
  Payment.updateOne = origPaymentUpdateOne;
  Booking.findById = origBookingFindById;
  Booking.updateOne = origBookingUpdateOne;
  Booking.exists = origBookingExists;
  daraja.__resetStkQuery();
});
