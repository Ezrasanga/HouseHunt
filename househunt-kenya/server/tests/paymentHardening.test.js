import test from 'node:test';
import assert from 'node:assert/strict';

import * as paymentService from '../services/paymentService.js';
import Payment from '../models/Payment.js';
import Booking from '../models/Booking.js';
import * as paymentsProvider from '../services/payments/provider.js';

const originalPaymentFindOne = Payment.findOne;
const originalPaymentFindById = Payment.findById;
const originalPaymentCreate = Payment.create;
const originalPaymentFind = Payment.find;
const originalPaymentCountDocuments = Payment.countDocuments;
const originalBookingFindById = Booking.findById;
const originalProviderInitiate = paymentsProvider.initiatePaymentRequest;

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

test('Successful payment becomes SUCCESS and booking PAID', async () => {
  const payment = { _id: 'p1', tenant: 't1', booking: 'b1', merchantRequestId: 'mr-1', checkoutRequestId: 'cr-1', status: 'PENDING', amount: 1000, currency: 'KES', phone: '254712345678', save: async function() {} };
  let bookingSaved = null;
  Payment.findOne = async () => payment;
  Booking.findById = async () => ({ _id: 'b1', paymentStatus: 'UNPAID', save: async function() { bookingSaved = this; } });

  const items = [
    { Name: 'Amount', Value: 1000 },
    { Name: 'MpesaReceiptNumber', Value: 'MPESA123' },
    { Name: 'PhoneNumber', Value: '254712345678' },
    { Name: 'TransactionDate', Value: Date.now() },
  ];
  const res = await paymentService.handleMpesaCallback(makeCallback({ items }));

  assert.equal(res.success, true);
  assert.equal(payment.status, 'SUCCESS');
  assert.equal(payment.mpesaReceipt, 'MPESA123');
  assert.equal(bookingSaved.paymentStatus, 'PAID');
});

test('Failed Daraja callback becomes FAILED and booking is not paid', async () => {
  let bookingSaved = null;
  const payment = { _id: 'p2', tenant: 't1', booking: 'b2', merchantRequestId: 'mr-2', checkoutRequestId: 'cr-2', status: 'PENDING', amount: 500, currency: 'KES', phone: '254712345678', save: async function() {} };
  Payment.findOne = async () => payment;
  Booking.findById = async () => ({ _id: 'b2', paymentStatus: 'UNPAID', save: async function() { bookingSaved = this; } });

  const res = await paymentService.handleMpesaCallback(makeCallback({ merchantRequestId: 'mr-2', checkoutRequestId: 'cr-2', resultCode: 1 }));

  assert.equal(res.success, true);
  assert.equal(payment.status, 'FAILED');
  assert.equal(payment.mpesaReceipt, '');
  assert.equal(bookingSaved, null);
});

test('Duplicate successful callback is idempotent', async () => {
  const payment = { _id: 'p3', tenant: 't1', booking: 'b3', merchantRequestId: 'mr-3', checkoutRequestId: 'cr-3', status: 'SUCCESS', amount: 1000, currency: 'KES', phone: '254712345678', save: async function() {} };
  Payment.findOne = async () => payment;

  const res = await paymentService.handleMpesaCallback(makeCallback());

  assert.equal(res.success, true);
  assert.equal(payment.status, 'SUCCESS');
});

test('Duplicate failed callback is idempotent', async () => {
  const payment = { _id: 'p4', tenant: 't1', booking: 'b4', merchantRequestId: 'mr-4', checkoutRequestId: 'cr-4', status: 'FAILED', amount: 500, currency: 'KES', phone: '254712345678', save: async function() {} };
  Payment.findOne = async () => payment;

  const res = await paymentService.handleMpesaCallback(makeCallback({ resultCode: 1 }));

  assert.equal(res.success, true);
  assert.equal(payment.status, 'FAILED');
});

test('Unknown checkoutRequestId is handled safely', async () => {
  Payment.findOne = async () => null;

  const res = await paymentService.handleMpesaCallback(makeCallback({ checkoutRequestId: 'unknown' }));

  assert.equal(res.success, true);
});

test('MerchantRequestId mismatch is handled safely without success', async () => {
  const payment = { _id: 'p5', tenant: 't1', booking: 'b5', merchantRequestId: 'mr-old', checkoutRequestId: 'cr-5', status: 'PENDING', amount: 1000, currency: 'KES', phone: '254712345678', save: async function() { saved = this; } };
  let saved = null;
  Payment.findOne = async () => payment;

  const res = await paymentService.handleMpesaCallback(makeCallback({ merchantRequestId: 'mr-new', checkoutRequestId: 'cr-5' }));

  assert.equal(res.success, true);
  assert.equal(payment.status, 'PENDING');
  assert.equal(saved, null);
});

test('Amount mismatch does not result in SUCCESS', async () => {
  const payment = { _id: 'p6', tenant: 't1', booking: 'b6', merchantRequestId: 'mr-6', checkoutRequestId: 'cr-6', status: 'PENDING', amount: 2000, currency: 'KES', phone: '254712345678', save: async function() { saved = this; } };
  let saved = null;
  Payment.findOne = async () => payment;

  const res = await paymentService.handleMpesaCallback(makeCallback({ items: [{ Name: 'Amount', Value: 1500 }] }));

  assert.equal(res.success, true);
  assert.equal(payment.status, 'PENDING');
  assert.equal(saved, null);
});

test('Phone mismatch does not result in SUCCESS', async () => {
  const payment = { _id: 'p7', tenant: 't1', booking: 'b7', merchantRequestId: 'mr-7', checkoutRequestId: 'cr-7', status: 'PENDING', amount: 1000, currency: 'KES', phone: '254700000000', save: async function() { saved = this; } };
  let saved = null;
  Payment.findOne = async () => payment;

  const res = await paymentService.handleMpesaCallback(makeCallback({ items: [{ Name: 'Amount', Value: 1000 }, { Name: 'PhoneNumber', Value: '254712345679' }] }));

  assert.equal(res.success, true);
  assert.equal(payment.status, 'PENDING');
  assert.equal(saved, null);
});

test('Malformed callback is handled safely', async () => {
  const res = await paymentService.handleMpesaCallback({});
  assert.equal(res.success, true);
});

test('Duplicate STK Push is prevented for the same payment', async () => {
  const user = { id: 'tenant-1', role: 'TENANT' };
  const payment = { _id: 'p8', tenant: 'tenant-1', booking: 'b8', method: 'MPESA', status: 'PENDING', amount: 1000, currency: 'KES', checkoutRequestId: 'already', merchantRequestId: 'mr-8', save: async () => {} };

  Payment.findById = async () => payment;
  Booking.findById = async () => ({ _id: 'b8', tenant: 'tenant-1' });

  await assert.rejects(async () => {
    await paymentService.initiateStkPush(user, 'p8', '0712345678');
  }, (err) => {
    assert.equal(err.status, 409);
    return true;
  });
});

test('Tenant cannot access another tenant payment', async () => {
  const user = { id: 'tenant-1', role: 'TENANT' };
  const payment = { _id: '507f1f77bcf86cd799439011', tenant: 'tenant-2', landlord: 'landlord-1', booking: '507f1f77bcf86cd799439012', amount: 1000, currency: 'KES', method: 'MPESA', status: 'PENDING' };
  Payment.findById = () => ({
    populate: () => ({
      lean: async () => payment,
    }),
  });

  await assert.rejects(async () => {
    await paymentService.getPaymentById(user, '507f1f77bcf86cd799439011');
  }, (err) => {
    assert.equal(err.status, 403);
    return true;
  });
});

test('Landlord cannot access unrelated property payments', async () => {
  const user = { id: 'landlord-2', role: 'LANDLORD' };
  const payment = { _id: '507f1f77bcf86cd799439013', tenant: 'tenant-1', landlord: 'landlord-1', booking: '507f1f77bcf86cd799439014', amount: 1000, currency: 'KES', method: 'MPESA', status: 'PENDING' };
  Payment.findById = () => ({
    populate: () => ({
      lean: async () => payment,
    }),
  });

  await assert.rejects(async () => {
    await paymentService.getPaymentById(user, '507f1f77bcf86cd799439013');
  }, (err) => {
    assert.equal(err.status, 403);
    return true;
  });
});

test('Admin can access all payments', async () => {
  const user = { id: 'admin-1', role: 'ADMIN' };
  const payment = { _id: '507f1f77bcf86cd799439015', tenant: 'tenant-1', landlord: 'landlord-1', booking: '507f1f77bcf86cd799439016', amount: 1000, currency: 'KES', method: 'MPESA', status: 'SUCCESS', save: async () => {} };
  Payment.findById = () => ({
    populate: () => ({
      lean: async () => payment,
    }),
  });

  const result = await paymentService.getPaymentById(user, '507f1f77bcf86cd799439015');
  assert.equal(result.status, 'SUCCESS');
});

test('Unauthenticated payment access is rejected', async () => {
  await assert.rejects(async () => {
    await paymentService.getPaymentById(null, 'p12');
  }, (err) => {
    assert.equal(err.status, 401);
    return true;
  });
});

test.after(() => {
  Payment.findOne = originalPaymentFindOne;
  Payment.findById = originalPaymentFindById;
  Payment.create = originalPaymentCreate;
  Payment.find = originalPaymentFind;
  Payment.countDocuments = originalPaymentCountDocuments;
  Booking.findById = originalBookingFindById;
  paymentsProvider.setInitiatePaymentRequest(originalProviderInitiate);
});
