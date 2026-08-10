import test from 'node:test';
import assert from 'node:assert/strict';

import * as paymentService from '../services/paymentService.js';
import Payment from '../models/Payment.js';
import Booking from '../models/Booking.js';
import * as paymentsProvider from '../services/payments/provider.js';

const originalPaymentFindOne = Payment.findOne;
const originalPaymentCreate = Payment.create;
const originalPaymentFind = Payment.find;
const originalPaymentCountDocuments = Payment.countDocuments;
const originalBookingFindById = Booking.findById;
const originalProviderInitiate = paymentsProvider.initiatePaymentRequest;

test('createPayment creates a pending payment for own approved booking', async () => {
  const created = [];
  const user = { id: 'tenant-1', role: 'TENANT' };
  const booking = {
    _id: '507f191e810c19729de860ea',
    tenant: 'tenant-1',
    landlord: 'landlord-1',
    status: 'APPROVED',
    paymentStatus: 'UNPAID',
    property: { owner: 'landlord-1' },
  };

  Payment.findOne = async () => null;
  Payment.create = async (payload) => {
    created.push(payload);
    return { ...payload, _id: 'payment-1' };
  };
  Booking.findById = () => ({
    populate: () => ({
      then: (resolve) => resolve(booking),
      catch: () => {},
    }),
    then: (resolve) => resolve(booking),
    catch: () => {},
  });
  paymentsProvider.setInitiatePaymentRequest(async () => ({ provider: 'stub' }));

  const result = await paymentService.createPayment(user, {
    bookingId: '507f191e810c19729de860ea',
    amount: 5000,
    currency: 'KES',
    method: 'MPESA',
    phone: '+254700000000',
  });

  assert.equal(result.status, 'PENDING');
  assert.equal(created[0].booking, '507f191e810c19729de860ea');
  assert.equal(created[0].tenant, 'tenant-1');
  assert.equal(created[0].landlord, 'landlord-1');
  assert.equal(created[0].amount, 5000);
  assert.equal(created[0].currency, 'KES');
  assert.equal(created[0].method, 'MPESA');
  assert.equal(created[0].status, 'PENDING');
  assert.equal(booking.paymentStatus, 'UNPAID');
});

test('createPayment rejects when tenant does not own the booking', async () => {
  const user = { id: 'tenant-1', role: 'TENANT' };
  Booking.findById = () => ({
    populate: () => ({
      then: (resolve) => resolve({
        _id: '507f191e810c19729de860ea',
        tenant: 'tenant-2',
        landlord: 'landlord-1',
        status: 'APPROVED',
        property: { owner: 'landlord-1' },
      }),
      catch: () => {},
    }),
    then: (resolve) => resolve({
      _id: '507f191e810c19729de860ea',
      tenant: 'tenant-2',
      landlord: 'landlord-1',
      status: 'APPROVED',
      property: { owner: 'landlord-1' },
    }),
    catch: () => {},
  });

  await assert.rejects(async () => {
    await paymentService.createPayment(user, {
      bookingId: '507f191e810c19729de860ea',
      amount: 2500,
      currency: 'KES',
      method: 'MPESA',
    });
  }, (err) => {
    assert.equal(err.status, 403);
    assert.equal(err.message, 'You may only pay for your own booking');
    return true;
  });
});

test('listPayments allows landlord to view payments for their own properties', async () => {
  const user = { id: 'landlord-1', role: 'LANDLORD' };
  const found = [{ _id: 'payment-1', booking: 'booking-1', tenant: 'tenant-1', landlord: 'landlord-1', amount: 5000, currency: 'KES', method: 'MPESA', status: 'PENDING', phone: '+254700000000', createdAt: new Date(), updatedAt: new Date() }];
  Payment.find = () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => found }) }) }) });
  Payment.countDocuments = async () => 1;

  const result = await paymentService.listPayments(user, {});

  assert.equal(result.payments.length, 1);
  assert.equal(result.payments[0].landlord, 'landlord-1');
  assert.equal(result.pagination.total, 1);
});

test('listPayments allows admin to view all payments', async () => {
  const user = { id: 'admin-1', role: 'ADMIN' };
  const found = [{ _id: 'payment-1', booking: 'booking-1', tenant: 'tenant-1', landlord: 'landlord-1', amount: 5000, currency: 'KES', method: 'MPESA', status: 'SUCCESS', phone: '+254700000000', createdAt: new Date(), updatedAt: new Date() }];
  Payment.find = () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => found }) }) }) });
  Payment.countDocuments = async () => 1;

  const result = await paymentService.listPayments(user, { status: 'SUCCESS' });

  assert.equal(result.payments.length, 1);
  assert.equal(result.payments[0].status, 'SUCCESS');
  assert.equal(result.pagination.total, 1);
});

test('createPayment rejects unauthenticated access', async () => {
  await assert.rejects(async () => {
    await paymentService.createPayment(null, {
      bookingId: 'booking-1',
      amount: 1000,
      currency: 'KES',
      method: 'MPESA',
    });
  }, (err) => {
    assert.equal(err.status, 401);
    assert.equal(err.message, 'Authentication required');
    return true;
  });
});

test.after(async () => {
  Payment.findOne = originalPaymentFindOne;
  Payment.create = originalPaymentCreate;
  Payment.find = originalPaymentFind;
  Payment.countDocuments = originalPaymentCountDocuments;
    Booking.findById = originalBookingFindById;
    paymentsProvider.setInitiatePaymentRequest(originalProviderInitiate);
});
