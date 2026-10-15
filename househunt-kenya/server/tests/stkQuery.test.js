/* global process, Buffer */
import test from 'node:test';
import assert from 'node:assert/strict';

import Payment from '../models/Payment.js';
import Booking from '../models/Booking.js';
import * as daraja from '../services/darajaService.js';
import * as paymentService from '../services/paymentService.js';
import { mockBookingSettlement, mockDarajaVerification, mockPaymentSettlement } from './helpers/paymentSettlement.js';

const envNames = [
  'MPESA_ENV',
  'MPESA_SHORTCODE',
  'MPESA_PASSKEY',
  'MPESA_CONSUMER_KEY',
  'MPESA_CONSUMER_SECRET',
];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
const originalPaymentFindById = Payment.findById;
const originalPaymentUpdateOne = Payment.updateOne;
const originalPaymentFindOne = Payment.findOne;
const originalBookingFindById = Booking.findById;
const originalBookingUpdateOne = Booking.updateOne;
const originalBookingExists = Booking.exists;

function configureDarajaQuery(result) {
  daraja.__resetStkQuery();
  process.env.MPESA_ENV = 'sandbox';
  process.env.MPESA_SHORTCODE = '174379';
  process.env.MPESA_PASSKEY = 'test-passkey';
  process.env.MPESA_CONSUMER_KEY = 'test-key';
  process.env.MPESA_CONSUMER_SECRET = 'test-secret';
  daraja._resetCacheForTests();
  daraja.__setHttpGet(async () => ({
    statusCode: 200,
    body: JSON.stringify({ access_token: 'test-token', expires_in: 3600 }),
  }));
  daraja.__setHttpPost(async () => ({
    statusCode: 200,
    body: JSON.stringify({
      ResponseCode: '0',
      MerchantRequestID: 'merchant-1',
      CheckoutRequestID: 'checkout-1',
      ...result,
    }),
  }));
}

function makePayment(overrides = {}) {
  return {
    _id: '507f191e810c19729de860ea',
    tenant: 'tenant-1',
    booking: 'booking-1',
    merchantRequestId: 'merchant-1',
    checkoutRequestId: 'checkout-1',
    method: 'MPESA',
    status: 'PENDING',
    amount: 12000,
    currency: 'KES',
    phone: '254712345678',
    save: async function save() {},
    ...overrides,
  };
}

test('STK query calls Daraja with Nairobi timestamp and the expected request fields', async () => {
  let request;
  configureDarajaQuery({ ResultCode: '1037', ResultDesc: 'No response from user.' });
  daraja.__setHttpPost(async (url, headers, body) => {
    request = { url, headers, body };
    return {
      statusCode: 200,
      body: JSON.stringify({
        ResponseCode: '0',
        MerchantRequestID: 'merchant-1',
        CheckoutRequestID: 'checkout-1',
        ResultCode: '1037',
        ResultDesc: 'No response from user.',
      }),
    };
  });

  const result = await daraja.querySTKPush({ checkoutRequestId: 'checkout-1' });

  assert.equal(request.url, 'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query');
  assert.equal(request.headers.Authorization, 'Bearer test-token');
  assert.equal(request.body.BusinessShortCode, '174379');
  assert.equal(request.body.CheckoutRequestID, 'checkout-1');
  assert.match(request.body.Timestamp, /^\d{14}$/);
  assert.equal(
    Buffer.from(request.body.Password, 'base64').toString('utf8'),
    `174379test-passkey${request.body.Timestamp}`
  );
  assert.deepEqual(result, {
    merchantRequestId: 'merchant-1',
    checkoutRequestId: 'checkout-1',
    resultCode: 1037,
    resultDescription: 'No response from user.',
  });
});

test('STK query marks a confirmed success paid exactly once', async () => {
  const payment = makePayment();
  const booking = {
    _id: 'booking-1',
    status: 'APPROVED',
    paymentStatus: 'UNPAID',
    amountPaid: 0,
    totalDue: 12000,
  };
  configureDarajaQuery({ ResultCode: '0', ResultDesc: 'The service request is processed successfully.' });
  Payment.findById = async () => payment;
  mockPaymentSettlement(Payment, payment);
  mockBookingSettlement(Booking, booking);

  const result = await paymentService.queryStkPushStatus(
    { id: 'tenant-1', role: 'TENANT' },
    payment._id
  );

  assert.equal(result.payment.status, 'SUCCESS');
  assert.equal(payment.status, 'SUCCESS');
  assert.equal(booking.paymentStatus, 'PAID');
  assert.equal(booking.amountPaid, 12000);

  const repeatedResult = await paymentService.queryStkPushStatus(
    { id: 'tenant-1', role: 'TENANT' },
    payment._id
  );
  assert.equal(repeatedResult.payment.status, 'SUCCESS');
  assert.equal(booking.amountPaid, 12000);
});

test('concurrent Daraja status queries settle a payment only once', async () => {
  const payment = makePayment();
  const booking = {
    _id: 'booking-1',
    status: 'APPROVED',
    paymentStatus: 'UNPAID',
    amountPaid: 0,
    totalDue: 24000,
  };
  configureDarajaQuery({ ResultCode: '0', ResultDesc: 'Success' });
  Payment.findById = async () => payment;
  mockPaymentSettlement(Payment, payment);
  mockBookingSettlement(Booking, booking);

  await Promise.all([
    paymentService.queryStkPushStatus({ id: 'tenant-1', role: 'TENANT' }, payment._id),
    paymentService.queryStkPushStatus({ id: 'tenant-1', role: 'TENANT' }, payment._id),
  ]);

  assert.equal(booking.amountPaid, 12000);
  assert.equal(booking.settledPaymentIds.length, 1);
  assert.equal(payment.status, 'SUCCESS');
});

test('callback and status query racing settle the booking once', async () => {
  const payment = makePayment();
  const booking = {
    _id: 'booking-1',
    status: 'APPROVED',
    paymentStatus: 'UNPAID',
    amountPaid: 0,
    totalDue: 24000,
  };
  configureDarajaQuery({ ResultCode: '0', ResultDesc: 'Success' });
  Payment.findById = async () => payment;
  Payment.findOne = async () => payment;
  mockPaymentSettlement(Payment, payment);
  mockBookingSettlement(Booking, booking);
  mockDarajaVerification(daraja, {
    merchantRequestId: 'merchant-1',
    checkoutRequestId: 'checkout-1',
    resultCode: 0,
  });

  await Promise.all([
    paymentService.queryStkPushStatus({ id: 'tenant-1', role: 'TENANT' }, payment._id),
    paymentService.handleMpesaCallback({
      Body: {
        stkCallback: {
          MerchantRequestID: 'merchant-1',
          CheckoutRequestID: 'checkout-1',
          ResultCode: 0,
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 12000 },
              { Name: 'MpesaReceiptNumber', Value: 'QWERTY123' },
              { Name: 'PhoneNumber', Value: '254712345678' },
            ],
          },
        },
      },
    }),
  ]);

  assert.equal(booking.amountPaid, 12000);
  assert.equal(booking.settledPaymentIds.length, 1);
  assert.equal(payment.status, 'SUCCESS');
});

test('STK query records Daraja cancellation and no-response outcomes as retryable failures', async () => {
  for (const [resultCode, description] of [
    [1032, 'Request cancelled by user.'],
    [1037, 'No response from user.'],
  ]) {
    const payment = makePayment();
    configureDarajaQuery({ ResultCode: String(resultCode), ResultDesc: description });
    Payment.findById = async () => payment;
    mockPaymentSettlement(Payment, payment);

    const result = await paymentService.queryStkPushStatus(
      { id: 'tenant-1', role: 'TENANT' },
      payment._id
    );

    assert.equal(result.payment.status, 'FAILED');
    assert.equal(result.resultCode, resultCode);
    assert.equal(result.resultDescription, description);
  }
});

test('STK query leaves an unfinished Daraja request pending', async () => {
  const payment = makePayment();
  configureDarajaQuery({ ResultDesc: 'The transaction is being processed.' });
  Payment.findById = async () => payment;

  const result = await paymentService.queryStkPushStatus(
    { id: 'tenant-1', role: 'TENANT' },
    payment._id
  );

  assert.equal(result.payment.status, 'PENDING');
  assert.equal(result.resultCode, null);
});

test('STK query rejects users who do not own the payment', async () => {
  Payment.findById = async () => makePayment({ tenant: 'tenant-2' });

  await assert.rejects(
    paymentService.queryStkPushStatus({ id: 'tenant-1', role: 'TENANT' }, '507f191e810c19729de860ea'),
    error => {
      assert.equal(error.status, 403);
      return true;
    }
  );
});

test('late successful callback can reconcile a request previously queried as failed', async () => {
  const payment = makePayment({ status: 'FAILED' });
  const booking = {
    _id: 'booking-1',
    status: 'APPROVED',
    paymentStatus: 'UNPAID',
    amountPaid: 0,
    totalDue: 12000,
    save: async function save() {},
  };
  Payment.findOne = async () => payment;
  mockPaymentSettlement(Payment, payment);
  mockBookingSettlement(Booking, booking);
  mockDarajaVerification(daraja, { merchantRequestId: 'merchant-1', checkoutRequestId: 'checkout-1', resultCode: 0 });

  const result = await paymentService.handleMpesaCallback({
    Body: {
      stkCallback: {
        MerchantRequestID: 'merchant-1',
        CheckoutRequestID: 'checkout-1',
        ResultCode: 0,
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: 12000 },
            { Name: 'MpesaReceiptNumber', Value: 'QWERTY123' },
            { Name: 'PhoneNumber', Value: '254712345678' },
          ],
        },
      },
    },
  });

  assert.equal(result.message, 'Payment reconciled');
  assert.equal(payment.status, 'SUCCESS');
  assert.equal(booking.paymentStatus, 'PAID');
});

test.after(() => {
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
  Payment.findById = originalPaymentFindById;
  Payment.updateOne = originalPaymentUpdateOne;
  Payment.findOne = originalPaymentFindOne;
  Booking.findById = originalBookingFindById;
  Booking.updateOne = originalBookingUpdateOne;
  Booking.exists = originalBookingExists;
  daraja.__resetStkQuery();
});
