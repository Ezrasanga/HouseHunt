import test from 'node:test';
import assert from 'node:assert/strict';

import * as paymentService from '../services/paymentService.js';
import Payment from '../models/Payment.js';

const originalPaymentFindOne = Payment.findOne;

test('tenant cannot access another tenant property payment', async () => {
  Payment.findOne = async () => ({
    _id: '507f1f77bcf86cd799439011',
    purpose: 'CONTACT_UNLOCK',
    payer: 'tenant-2',
    tenant: 'tenant-2',
    landlord: 'landlord-1',
  });

  await assert.rejects(
    paymentService.getPropertyPaymentById(
      { id: 'tenant-1', role: 'TENANT' },
      '507f1f77bcf86cd799439011'
    ),
    error => error.status === 403
  );
});

test('landlord cannot access unrelated property payments', async () => {
  Payment.findOne = async () => ({
    _id: '507f1f77bcf86cd799439013',
    purpose: 'LISTING_BOOST',
    payer: 'landlord-1',
    landlord: 'landlord-1',
  });

  await assert.rejects(
    paymentService.getPropertyPaymentById(
      { id: 'landlord-2', role: 'LANDLORD' },
      '507f1f77bcf86cd799439013'
    ),
    error => error.status === 403
  );
});

test('admin can access a property payment', async () => {
  Payment.findOne = async () => ({
    _id: '507f1f77bcf86cd799439015',
    purpose: 'LISTING_BOOST',
    payer: 'landlord-1',
    landlord: 'landlord-1',
    status: 'SUCCESS',
  });

  const result = await paymentService.getPropertyPaymentById(
    { id: 'admin-1', role: 'ADMIN' },
    '507f1f77bcf86cd799439015'
  );
  assert.equal(result.status, 'SUCCESS');
});

test('legacy booking payment is excluded from property payment lookup', async () => {
  let lookupFilter;
  Payment.findOne = async filter => {
    lookupFilter = filter;
    return null;
  };

  await assert.rejects(
    paymentService.getPropertyPaymentById(
      { id: 'tenant-1', role: 'TENANT' },
      '507f1f77bcf86cd799439011'
    ),
    error => error.status === 404
  );
  assert.deepEqual(lookupFilter.purpose, { $in: ['CONTACT_UNLOCK', 'LISTING_BOOST'] });
});

test('unauthenticated property payment access is rejected', async () => {
  await assert.rejects(
    paymentService.getPropertyPaymentById(null, '507f1f77bcf86cd799439015'),
    error => error.status === 401
  );
});

test.after(() => {
  Payment.findOne = originalPaymentFindOne;
});
