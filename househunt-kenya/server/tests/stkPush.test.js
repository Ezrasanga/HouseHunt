import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';

import * as paymentService from '../services/paymentService.js';
import * as daraja from '../services/darajaService.js';
import Payment from '../models/Payment.js';
import Property from '../models/Property.js';

const originalPaymentFindOne = Payment.findOne;
const originalPropertyFindById = Property.findById;

test('missing payment returns 404', async () => {
  Payment.findOne = async () => null;

  await assert.rejects(
    paymentService.initiateStkPush(
      { id: 'tenant-1', role: 'TENANT' },
      '507f191e810c19729de860ea',
      '0712345678'
    ),
    error => error.status === 404 && error.message === 'Payment not found'
  );
});

test('tenant cannot initiate STK for another payer', async () => {
  Payment.findOne = async () => ({
    _id: 'legacy-payment',
    payer: 'tenant-2',
    purpose: 'CONTACT_UNLOCK',
  });

  await assert.rejects(
    paymentService.initiateStkPush(
      { id: 'tenant-1', role: 'TENANT' },
      'legacy-payment',
      '0712345678'
    ),
    error => error.status === 403
  );
});

test('legacy booking payment is not available to STK initiation', async () => {
  let lookupFilter;
  Payment.findOne = async filter => {
    lookupFilter = filter;
    return null;
  };

  await assert.rejects(
    paymentService.initiateStkPush(
      { id: 'tenant-1', role: 'TENANT' },
      'legacy-payment',
      'invalid-phone'
    ),
    error => error.status === 404 && error.message === 'Payment not found'
  );
  assert.deepEqual(lookupFilter.purpose, { $in: ['CONTACT_UNLOCK', 'LISTING_BOOST'] });
});

test('contact unlock payment can still initiate an STK push', async () => {
  const environmentKeys = [
    'MPESA_ENV',
    'MPESA_CONSUMER_KEY',
    'MPESA_CONSUMER_SECRET',
    'MPESA_SHORTCODE',
    'MPESA_PASSKEY',
    'MPESA_CALLBACK_URL',
  ];
  const originalEnvironment = Object.fromEntries(
    environmentKeys.map(key => [key, process.env[key]])
  );
  let savedPayment;
  const payment = {
    _id: 'unlock-payment',
    payer: 'tenant-1',
    tenant: 'tenant-1',
    purpose: 'CONTACT_UNLOCK',
    property: 'property-1',
    method: 'MPESA',
    status: 'PENDING',
    amount: 100,
    currency: 'KES',
    save: async function save() {
      savedPayment = this;
    },
  };
  Payment.findOne = async () => payment;
  Property.findById = async () => ({
    _id: 'property-1',
    owner: 'landlord-1',
    isApproved: true,
    status: 'AVAILABLE',
  });

  Object.assign(process.env, {
    MPESA_ENV: 'sandbox',
    MPESA_CONSUMER_KEY: 'test-key',
    MPESA_CONSUMER_SECRET: 'test-secret',
    MPESA_SHORTCODE: '123456',
    MPESA_PASSKEY: 'test-passkey',
    MPESA_CALLBACK_URL: 'https://example.test/api/payments/mpesa/callback',
  });
  daraja._resetCacheForTests();
  daraja.__setHttpGet(async () => ({
    statusCode: 200,
    body: JSON.stringify({ access_token: 'test-token', expires_in: 3600 }),
  }));
  daraja.__setHttpPost(async () => ({
    statusCode: 200,
    body: JSON.stringify({
      MerchantRequestID: 'merchant-unlock',
      CheckoutRequestID: 'checkout-unlock',
      ResponseDescription: 'Accepted',
    }),
  }));

  try {
    const result = await paymentService.initiateStkPush(
      { id: 'tenant-1', role: 'TENANT' },
      'unlock-payment',
      '0712345678'
    );

    assert.equal(result.merchantRequestId, 'merchant-unlock');
    assert.equal(result.checkoutRequestId, 'checkout-unlock');
    assert.equal(savedPayment.phone, '254712345678');
    assert.equal(savedPayment.status, 'PENDING');
  } finally {
    for (const key of environmentKeys) {
      if (originalEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnvironment[key];
    }
    daraja._resetCacheForTests();
  }
});

test.after(() => {
  Payment.findOne = originalPaymentFindOne;
  Property.findById = originalPropertyFindById;
});
