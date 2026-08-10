/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';

import * as paymentService from '../services/paymentService.js';
import Payment from '../models/Payment.js';
import Booking from '../models/Booking.js';
import * as daraja from '../services/darajaService.js';

const origPaymentFindById = Payment.findById;
const origBookingFindById = Booking.findById;

test('missing payment returns 404', async () => {
  const user = { id: 'tenant-1', role: 'TENANT' };
  Payment.findById = async () => null;

  await assert.rejects(async () => {
    await paymentService.initiateStkPush(user, '507f191e810c19729de860ea', '0712345678');
  }, (err) => {
    assert.equal(err.status, 404);
    assert.equal(err.message, 'Payment not found');
    return true;
  });
});

test('tenant cannot initiate STK for another tenant', async () => {
  const user = { id: 'tenant-1', role: 'TENANT' };
  Payment.findById = async () => ({ _id: 'p1', tenant: 'tenant-2', booking: 'b1', method: 'MPESA', status: 'PENDING', amount: 1000, currency: 'KES', save: async () => {} });

  await assert.rejects(async () => {
    await paymentService.initiateStkPush(user, 'p1', '0712345678');
  }, (err) => {
    assert.equal(err.status, 403);
    return true;
  });
});

test('invalid phone number rejected', async () => {
  const user = { id: 'tenant-1', role: 'TENANT' };
  const payment = { _id: 'p1', tenant: 'tenant-1', booking: 'b1', method: 'MPESA', status: 'PENDING', amount: 1000, currency: 'KES', save: async () => {} };
  Payment.findById = async () => payment;
  Booking.findById = async () => ({ _id: 'b1', tenant: 'tenant-1' });

  await assert.rejects(async () => {
    await paymentService.initiateStkPush(user, 'p1', '12345');
  }, (err) => {
    assert.equal(err.status, 400);
    return true;
  });
});

test('amount is taken from DB not request body and identifiers stored', async () => {
  const user = { id: 'tenant-1', role: 'TENANT' };
  let saved = null;
  const payment = {
    _id: 'p1', tenant: 'tenant-1', booking: 'b1', method: 'MPESA', status: 'PENDING', amount: 1500, currency: 'KES', save: async function () { saved = this; }
  };
  Payment.findById = async () => payment;
  Booking.findById = async () => ({ _id: 'b1', tenant: 'tenant-1' });

  // Ensure env vars present for daraja
  const origShort = process.env.MPESA_SHORTCODE;
  const origPass = process.env.MPESA_PASSKEY;
  const origCall = process.env.MPESA_CALLBACK_URL;
  process.env.MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || '123456';
  process.env.MPESA_PASSKEY = process.env.MPESA_PASSKEY || 'passkey';
  process.env.MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL || 'https://example.com/callback';
  process.env.MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || 'ck';
  process.env.MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || 'cs';

  daraja.__setHttpPost(async () => ({ statusCode: 200, body: JSON.stringify({ MerchantRequestID: 'mr-1', CheckoutRequestID: 'cr-1', ResponseDescription: 'Accepted' }) }));
  daraja.__setHttpGet(async () => ({ statusCode: 200, body: JSON.stringify({ access_token: 'token', expires_in: 3600 }) }));

  const result = await paymentService.initiateStkPush(user, 'p1', '0712345678');

  assert.equal(result.merchantRequestId, 'mr-1');
  assert.equal(result.checkoutRequestId, 'cr-1');
  assert.equal(saved.merchantRequestId, 'mr-1');
  assert.equal(saved.checkoutRequestId, 'cr-1');
  assert.equal(saved.status, 'PENDING');
  process.env.MPESA_SHORTCODE = origShort;
  process.env.MPESA_PASSKEY = origPass;
  process.env.MPESA_CALLBACK_URL = origCall;
  // leave consumer key/secret as they may be global; not restoring to avoid clobbering other tests
});

test('missing daraja config handled safely', async () => {
  const user = { id: 'tenant-1', role: 'TENANT' };
  const payment = { _id: 'p1', tenant: 'tenant-1', booking: 'b1', method: 'MPESA', status: 'PENDING', amount: 1000, currency: 'KES', save: async () => {} };
  Payment.findById = async () => payment;
  Booking.findById = async () => ({ _id: 'b1', tenant: 'tenant-1' });

  const origShort = process.env.MPESA_SHORTCODE;
  const origPass = process.env.MPESA_PASSKEY;
  const origCall = process.env.MPESA_CALLBACK_URL;
  delete process.env.MPESA_SHORTCODE;
  delete process.env.MPESA_PASSKEY;
  delete process.env.MPESA_CALLBACK_URL;

  await assert.rejects(async () => {
    await paymentService.initiateStkPush(user, 'p1', '0712345678');
  }, (err) => {
    assert.equal(err.status, 500);
    return true;
  });

  process.env.MPESA_SHORTCODE = origShort;
  process.env.MPESA_PASSKEY = origPass;
  process.env.MPESA_CALLBACK_URL = origCall;
});

test('oauth failure handled safely', async () => {
  const user = { id: 'tenant-1', role: 'TENANT' };
  const payment = { _id: 'p1', tenant: 'tenant-1', booking: 'b1', method: 'MPESA', status: 'PENDING', amount: 1000, currency: 'KES', save: async () => {} };
  Payment.findById = async () => payment;
  Booking.findById = async () => ({ _id: 'b1', tenant: 'tenant-1' });

  // Ensure daraja config present so the flow reaches OAuth call
  const origShort = process.env.MPESA_SHORTCODE;
  const origPass = process.env.MPESA_PASSKEY;
  const origCall = process.env.MPESA_CALLBACK_URL;
  process.env.MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || '123456';
  process.env.MPESA_PASSKEY = process.env.MPESA_PASSKEY || 'passkey';
  process.env.MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL || 'https://example.com/callback';
  process.env.MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || 'ck';
  process.env.MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || 'cs';

  // Clear any cached token from previous tests so the httpGet call is exercised
  daraja._resetCacheForTests();
  daraja.__setHttpGet(async () => { throw new Error('network fail'); });

  await assert.rejects(async () => {
    await paymentService.initiateStkPush(user, 'p1', '0712345678');
  }, (err) => {
    assert.equal(err.status, 502);
    return true;
  });

  process.env.MPESA_SHORTCODE = origShort;
  process.env.MPESA_PASSKEY = origPass;
  process.env.MPESA_CALLBACK_URL = origCall;
});

test.after(() => {
  Payment.findById = origPaymentFindById;
  Booking.findById = origBookingFindById;
});
