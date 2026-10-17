import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';

import * as paymentService from '../services/paymentService.js';
import * as daraja from '../services/darajaService.js';
import Payment from '../models/Payment.js';
import Property from '../models/Property.js';
import PropertyUnlock from '../models/PropertyUnlock.js';
import { mockDarajaVerification } from './helpers/paymentSettlement.js';

const originalPaymentCreate = Payment.create;
const originalPaymentFindOne = Payment.findOne;
const originalPaymentUpdateOne = Payment.updateOne;
const originalPropertyFindById = Property.findById;
const originalPropertyUpdateOne = Property.updateOne;
const originalPropertyUnlockExists = PropertyUnlock.exists;
const originalPropertyUnlockFindOneAndUpdate = PropertyUnlock.findOneAndUpdate;

function makeCallback(payment, items = []) {
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: payment.merchantRequestId,
        CheckoutRequestID: payment.checkoutRequestId,
        ResultCode: 0,
        CallbackMetadata: { Item: items },
      },
    },
  };
}

function successItems(payment) {
  return [
    { Name: 'Amount', Value: payment.amount },
    { Name: 'MpesaReceiptNumber', Value: 'RCP123' },
    { Name: 'PhoneNumber', Value: payment.phone },
  ];
}

test('property payment creation uses server fees for both supported products', async () => {
  const originalUnlockFee = process.env.PROPERTY_UNLOCK_FEE_KES;
  const originalBoostFee = process.env.PROPERTY_BOOST_FEE_KES;
  process.env.PROPERTY_UNLOCK_FEE_KES = '135';
  process.env.PROPERTY_BOOST_FEE_KES = '275';

  const created = [];
  Property.findById = async id => ({
    _id: id,
    owner: 'landlord-1',
    isApproved: true,
    status: 'AVAILABLE',
  });
  PropertyUnlock.exists = async () => null;
  Payment.findOne = async () => null;
  Payment.create = async payload => {
    created.push(payload);
    return { ...payload, _id: `payment-${created.length}` };
  };

  try {
    const unlock = await paymentService.createPropertyPayment(
      { id: 'tenant-1', role: 'TENANT' },
      {
        purpose: 'CONTACT_UNLOCK',
        propertyId: '507f191e810c19729de860ea',
        currency: 'KES',
        method: 'MPESA',
        amount: 1,
      }
    );
    const boost = await paymentService.createPropertyPayment(
      { id: 'landlord-1', role: 'LANDLORD' },
      {
        purpose: 'LISTING_BOOST',
        propertyId: '507f191e810c19729de860ea',
        currency: 'KES',
        method: 'MPESA',
        amount: 1,
      }
    );

    assert.equal(unlock.amount, 135);
    assert.equal(boost.amount, 275);
    assert.equal(created[0].tenant, 'tenant-1');
    assert.equal(created[0].payer, 'tenant-1');
    assert.equal(created[1].landlord, 'landlord-1');
    assert.equal(created[1].payer, 'landlord-1');
  } finally {
    if (originalUnlockFee === undefined) delete process.env.PROPERTY_UNLOCK_FEE_KES;
    else process.env.PROPERTY_UNLOCK_FEE_KES = originalUnlockFee;
    if (originalBoostFee === undefined) delete process.env.PROPERTY_BOOST_FEE_KES;
    else process.env.PROPERTY_BOOST_FEE_KES = originalBoostFee;
  }
});

test('only the property owner can initiate a listing boost', async () => {
  Property.findById = async id => ({
    _id: id,
    owner: 'landlord-1',
    isApproved: true,
    status: 'AVAILABLE',
  });

  await assert.rejects(
    paymentService.createPropertyPayment(
      { id: 'landlord-2', role: 'LANDLORD' },
      {
        purpose: 'LISTING_BOOST',
        propertyId: '507f191e810c19729de860ea',
        currency: 'KES',
        method: 'MPESA',
      }
    ),
    error => error.status === 403 && /own property/.test(error.message)
  );
});

test('Daraja-confirmed contact unlock callback grants persistent access', async () => {
  const payment = {
    _id: 'payment-unlock',
    purpose: 'CONTACT_UNLOCK',
    tenant: 'tenant-1',
    payer: 'tenant-1',
    landlord: 'landlord-1',
    property: 'property-1',
    merchantRequestId: 'mr-unlock',
    checkoutRequestId: 'cr-unlock',
    status: 'PENDING',
    amount: 100,
    phone: '254712345678',
  };
  let unlockFilter;
  Payment.findOne = async () => payment;
  Payment.updateOne = async (_filter, update) => {
    Object.assign(payment, update.$set);
    return { modifiedCount: 1 };
  };
  PropertyUnlock.findOneAndUpdate = async filter => {
    unlockFilter = filter;
    return {};
  };
  mockDarajaVerification(daraja, {
    merchantRequestId: payment.merchantRequestId,
    checkoutRequestId: payment.checkoutRequestId,
    resultCode: 0,
  });

  const result = await paymentService.handleMpesaCallback(makeCallback(payment, successItems(payment)));

  assert.equal(result.message, 'Payment reconciled');
  assert.equal(payment.status, 'SUCCESS');
  assert.deepEqual(unlockFilter, { tenant: 'tenant-1', property: 'property-1' });
});

test('Daraja-confirmed STK query grants contact access', async () => {
  const payment = {
    _id: '507f191e810c19729de860ea',
    purpose: 'CONTACT_UNLOCK',
    tenant: 'tenant-1',
    payer: 'tenant-1',
    landlord: 'landlord-1',
    property: 'property-1',
    merchantRequestId: 'mr-query',
    checkoutRequestId: 'cr-query',
    status: 'PENDING',
    amount: 100,
    currency: 'KES',
    method: 'MPESA',
    phone: '254712345678',
  };
  let unlockFilter;
  Payment.findOne = async () => payment;
  Payment.updateOne = async (_filter, update) => {
    Object.assign(payment, update.$set);
    return { modifiedCount: 1 };
  };
  PropertyUnlock.findOneAndUpdate = async filter => {
    unlockFilter = filter;
    return {};
  };
  mockDarajaVerification(daraja, {
    merchantRequestId: payment.merchantRequestId,
    checkoutRequestId: payment.checkoutRequestId,
    resultCode: 0,
  });

  const result = await paymentService.queryStkPushStatus(
    { id: 'tenant-1', role: 'TENANT' },
    payment._id
  );

  assert.equal(result.payment.status, 'SUCCESS');
  assert.deepEqual(unlockFilter, { tenant: 'tenant-1', property: 'property-1' });
});

test('Daraja-confirmed boost callback features the owned approved listing for 30 days', async () => {
  const payment = {
    _id: 'payment-boost',
    purpose: 'LISTING_BOOST',
    payer: 'landlord-1',
    landlord: 'landlord-1',
    property: 'property-1',
    merchantRequestId: 'mr-boost',
    checkoutRequestId: 'cr-boost',
    status: 'PENDING',
    amount: 200,
    phone: '254712345678',
  };
  let propertyFilter;
  let propertyUpdate;
  Payment.findOne = async () => payment;
  Payment.updateOne = async (_filter, update) => {
    Object.assign(payment, update.$set);
    return { modifiedCount: 1 };
  };
  Property.updateOne = async (filter, update) => {
    propertyFilter = filter;
    propertyUpdate = update;
    return { modifiedCount: 1 };
  };
  mockDarajaVerification(daraja, {
    merchantRequestId: payment.merchantRequestId,
    checkoutRequestId: payment.checkoutRequestId,
    resultCode: 0,
  });

  const before = Date.now();
  const result = await paymentService.handleMpesaCallback(makeCallback(payment, successItems(payment)));
  const boostDuration = propertyUpdate.$set.featuredUntil.getTime() - before;

  assert.equal(result.message, 'Payment reconciled');
  assert.equal(payment.status, 'SUCCESS');
  assert.deepEqual(propertyFilter, {
    _id: 'property-1',
    owner: 'landlord-1',
    isApproved: true,
    status: 'AVAILABLE',
    featuredPayment: { $ne: 'payment-boost' },
  });
  assert.equal(propertyUpdate.$set.featured, true);
  assert.ok(boostDuration >= 30 * 24 * 60 * 60 * 1000 - 1000);
  assert.ok(boostDuration <= 30 * 24 * 60 * 60 * 1000 + 1000);
});

test.after(() => {
  Payment.create = originalPaymentCreate;
  Payment.findOne = originalPaymentFindOne;
  Payment.updateOne = originalPaymentUpdateOne;
  Property.findById = originalPropertyFindById;
  Property.updateOne = originalPropertyUpdateOne;
  PropertyUnlock.exists = originalPropertyUnlockExists;
  PropertyUnlock.findOneAndUpdate = originalPropertyUnlockFindOneAndUpdate;
  daraja.__resetStkQuery();
});
