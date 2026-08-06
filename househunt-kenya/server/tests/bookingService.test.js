import test from 'node:test';
import assert from 'node:assert/strict';

import { createBooking } from '../services/bookingService.js';
import Booking from '../models/Booking.js';
import Property from '../models/Property.js';

const originalFindOne = Booking.findOne;
const originalCreate = Booking.create;
const originalPropertyFindById = Property.findById;

test('createBooking creates a pending booking for an approved available property', async () => {
  const created = [];

  Booking.findOne = async () => null;
  Booking.create = async (payload) => {
    created.push(payload);
    return { ...payload, _id: 'booking-1' };
  };
  Property.findById = async () => ({
    _id: '507f191e810c19729de860ea',
    owner: '507f191e810c19729de860eb',
    isApproved: true,
    status: 'AVAILABLE',
    save: async function () {},
  });

  const result = await createBooking(
    { id: '507f191e810c19729de860ec', role: 'TENANT' },
    {
      propertyId: '507f191e810c19729de860ea',
      moveInDate: '2026-09-01',
      leaseMonths: 6,
      notes: 'Please confirm quickly',
    }
  );

  assert.equal(result.booking.status, 'PENDING');
  assert.equal(result.booking.paymentStatus, 'UNPAID');
  assert.equal(created[0].tenant, '507f191e810c19729de860ec');
  assert.equal(created[0].landlord, '507f191e810c19729de860eb');
  assert.equal(created[0].property, '507f191e810c19729de860ea');

  Booking.findOne = originalFindOne;
  Booking.create = originalCreate;
  Property.findById = originalPropertyFindById;
});
