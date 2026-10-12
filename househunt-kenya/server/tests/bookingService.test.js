import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { approveBooking, createBooking } from '../services/bookingService.js';
import Booking from '../models/Booking.js';
import Property from '../models/Property.js';

const originalFindOne = Booking.findOne;
const originalCreate = Booking.create;
const originalBookingFindById = Booking.findById;
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

test('approveBooking accepts matching owner and actor ObjectIds', async () => {
  const landlordId = new mongoose.Types.ObjectId();
  const propertyId = new mongoose.Types.ObjectId();
  const booking = {
    _id: new mongoose.Types.ObjectId(),
    property: propertyId,
    status: 'PENDING',
    save: async function () {},
  };
  const property = {
    _id: propertyId,
    owner: landlordId,
    isApproved: true,
    status: 'AVAILABLE',
    price: 10000,
    save: async function () {},
  };

  Booking.findOne = async () => null;
  Booking.findById = async () => booking;
  Property.findById = async () => property;

  try {
    const result = await approveBooking(booking._id, {
      id: landlordId,
      role: 'LANDLORD',
    });

    assert.equal(result.booking.status, 'APPROVED');
    assert.equal(booking.status, 'APPROVED');
    assert.equal(property.status, 'OCCUPIED');
  } finally {
    Booking.findOne = originalFindOne;
    Booking.findById = originalBookingFindById;
    Property.findById = originalPropertyFindById;
  }
});
