import test from 'node:test';
import assert from 'node:assert/strict';

import * as paymentService from '../services/paymentService.js';
import Payment from '../models/Payment.js';

const originalPaymentFindOne = Payment.findOne;

test('legacy booking payment cannot be queried through Daraja', async () => {
  let lookupFilter;
  Payment.findOne = async filter => {
    lookupFilter = filter;
    return null;
  };

  await assert.rejects(
    paymentService.queryStkPushStatus(
      { id: 'tenant-1', role: 'TENANT' },
      '507f191e810c19729de860ea'
    ),
    error => error.status === 404 && error.message === 'Payment not found'
  );
  assert.deepEqual(lookupFilter.purpose, { $in: ['CONTACT_UNLOCK', 'LISTING_BOOST'] });
});

test('tenant cannot query another payer payment', async () => {
  Payment.findOne = async () => ({
    _id: '507f191e810c19729de860ea',
    payer: 'tenant-2',
    purpose: 'CONTACT_UNLOCK',
  });

  await assert.rejects(
    paymentService.queryStkPushStatus(
      { id: 'tenant-1', role: 'TENANT' },
      '507f191e810c19729de860ea'
    ),
    error => error.status === 403
  );
});

test.after(() => {
  Payment.findOne = originalPaymentFindOne;
});
