import test from 'node:test';
import assert from 'node:assert/strict';

import Booking from '../models/Booking.js';
import Payment from '../models/Payment.js';
import paymentRouter from '../routes/payments.js';

function routeTable(router) {
  return router.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));
}

test('booking-payment and generic payment-management endpoints are not registered', () => {
  const routes = routeTable(paymentRouter);
  const unsupportedPaths = new Set([
    '/',
    '/booking/:bookingId',
    '/:id',
    '/:paymentId/stk-push',
    '/:paymentId/stk-query',
  ]);

  assert.equal(routes.some(route => unsupportedPaths.has(route.path)), false);
});

test('only property payments have payment creation, lookup, and STK endpoints', () => {
  const routes = routeTable(paymentRouter);
  const registered = new Set(routes.map(route => `${route.methods.join(',')}:${route.path}`));

  assert.ok(registered.has('post:/property'));
  assert.ok(registered.has('get:/property/:propertyId'));
  assert.ok(registered.has('get:/property-payments/:paymentId'));
  assert.ok(registered.has('post:/property-payments/:paymentId/stk-push'));
  assert.ok(registered.has('post:/property-payments/:paymentId/stk-query'));
  assert.ok(registered.has('post:/mpesa/callback'));
});

test('booking payment fields and purpose are no longer part of payment schemas', () => {
  assert.equal(Payment.schema.path('booking'), undefined);
  assert.deepEqual(Payment.schema.path('purpose').enumValues, ['CONTACT_UNLOCK', 'LISTING_BOOST']);
  for (const field of ['monthlyRent', 'totalDue', 'amountPaid', 'settledPaymentIds', 'currency', 'paymentStatus']) {
    assert.equal(Booking.schema.path(field), undefined);
  }
});
