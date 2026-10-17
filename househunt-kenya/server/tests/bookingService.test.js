import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import {
  approveBooking,
  cancelBooking,
  closeTestBooking,
  createBooking,
  markBookingAsTestData,
  resolveBookingAvailability,
  updateBookingCompletion,
} from '../services/bookingService.js';
import Booking from '../models/Booking.js';
import Property from '../models/Property.js';

const originalFindOne = Booking.findOne;
const originalCreate = Booking.create;
const originalBookingFindById = Booking.findById;
const originalBookingFindOneAndUpdate = Booking.findOneAndUpdate;
const originalPropertyFindById = Property.findById;
const originalPropertyFindOneAndUpdate = Property.findOneAndUpdate;
const originalPropertyUpdateOne = Property.updateOne;

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
  assert.equal(result.booking.status, 'PENDING');
  assert.equal(Object.hasOwn(created[0], 'paymentStatus'), false);
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
  Booking.findOneAndUpdate = async (filter, update) => {
    if (filter.status !== booking.status) return null;
    Object.assign(booking, update.$set);
    return booking;
  };
  Property.findById = async () => property;
  Property.findOneAndUpdate = async () => {
    property.status = 'OCCUPIED';
    return property;
  };

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
    Booking.findOneAndUpdate = originalBookingFindOneAndUpdate;
    Property.findById = originalPropertyFindById;
    Property.findOneAndUpdate = originalPropertyFindOneAndUpdate;
  }
});

test('approveBooking reports a conflict with only a safe existing-booking reference', async () => {
  const propertyId = new mongoose.Types.ObjectId();
  const booking = {
    _id: new mongoose.Types.ObjectId(),
    property: propertyId,
    status: 'PENDING',
  };
  const conflict = {
    _id: new mongoose.Types.ObjectId(),
    status: 'APPROVED',
    tenant: { email: 'private@example.test', phone: '254700000000' },
  };
  Booking.findById = async () => booking;
  Booking.findOne = async () => conflict;
  Property.findById = async () => ({
    _id: propertyId,
    owner: 'landlord-1',
    isApproved: true,
    status: 'OCCUPIED',
    price: 10000,
  });

  try {
    await assert.rejects(
      approveBooking(booking._id, { id: 'landlord-1', role: 'LANDLORD' }),
      error => {
        assert.equal(error.status, 409);
        assert.match(error.message, /This property already has an approved booking/);
        assert.deepEqual(error.data, {
          conflictingBooking: { id: String(conflict._id), status: 'APPROVED' },
        });
        return true;
      }
    );
  } finally {
    Booking.findOne = originalFindOne;
    Booking.findById = originalBookingFindById;
    Property.findById = originalPropertyFindById;
  }
});

test('simultaneous approvals atomically claim a property for only one booking', async () => {
  const landlordId = new mongoose.Types.ObjectId();
  const propertyId = new mongoose.Types.ObjectId();
  const bookings = [1, 2].map(() => ({
    _id: new mongoose.Types.ObjectId(),
    property: propertyId,
    status: 'PENDING',
  }));
  const property = {
    _id: propertyId,
    owner: landlordId,
    isApproved: true,
    status: 'AVAILABLE',
    price: 10000,
  };
  let propertyClaimed = false;
  Booking.findById = async id => bookings.find(item => String(item._id) === String(id));
  Booking.findOne = async query => bookings.find(item =>
    String(item.property) === String(query.property) &&
    item.status === query.status &&
    String(item._id) !== String(query._id?.$ne)
  ) || null;
  Booking.findOneAndUpdate = async (filter, update) => {
    const candidate = bookings.find(item => String(item._id) === String(filter._id));
    if (!candidate || candidate.status !== filter.status) return null;
    Object.assign(candidate, update.$set);
    return candidate;
  };
  Property.findById = async () => property;
  Property.findOneAndUpdate = async () => {
    if (propertyClaimed) return null;
    propertyClaimed = true;
    property.status = 'OCCUPIED';
    return property;
  };
  Property.updateOne = async (_filter, update) => {
    property.status = update.$set.status;
  };

  try {
    const results = await Promise.allSettled(
      bookings.map(item => approveBooking(item._id, { id: landlordId, role: 'LANDLORD' }))
    );
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(bookings.filter(item => item.status === 'APPROVED').length, 1);
    assert.equal(property.status, 'OCCUPIED');
  } finally {
    Booking.findOne = originalFindOne;
    Booking.findById = originalBookingFindById;
    Booking.findOneAndUpdate = originalBookingFindOneAndUpdate;
    Property.findById = originalPropertyFindById;
    Property.findOneAndUpdate = originalPropertyFindOneAndUpdate;
    Property.updateOne = originalPropertyUpdateOne;
  }
});

test('tenant can cancel a pending booking request', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const booking = {
    _id: new mongoose.Types.ObjectId(),
    tenant: tenantId,
    status: 'PENDING',
  };
  Booking.findById = async () => booking;
  Booking.findOneAndUpdate = async (_filter, update) => {
    Object.assign(booking, update.$set);
    return booking;
  };

  try {
    const result = await cancelBooking(booking._id, { id: tenantId, role: 'TENANT' });
    assert.equal(result.booking.status, 'CANCELLED');
  } finally {
    Booking.findById = originalBookingFindById;
    Booking.findOneAndUpdate = originalBookingFindOneAndUpdate;
  }
});

test('tenant cannot cancel an approved booking regardless of historical payment state', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const booking = {
    _id: new mongoose.Types.ObjectId(),
    tenant: tenantId,
    status: 'APPROVED',
    paymentStatus: 'PARTIAL',
    amountPaid: 1000,
  };
  Booking.findById = async () => booking;
  Booking.findOneAndUpdate = async () => {
    throw new Error('A paid booking must not be cancelled.');
  };

  try {
    await assert.rejects(
      cancelBooking(booking._id, { id: tenantId, role: 'TENANT' }),
      error => {
        assert.equal(error.status, 400);
        assert.match(error.message, /cannot be cancelled in its current state/);
        return true;
      }
    );
  } finally {
    Booking.findById = originalBookingFindById;
    Booking.findOneAndUpdate = originalBookingFindOneAndUpdate;
  }
});

test('admin can close explicitly marked test bookings regardless of legacy payment state', async () => {
  const adminId = new mongoose.Types.ObjectId();
  const propertyId = new mongoose.Types.ObjectId();
  const booking = {
    _id: new mongoose.Types.ObjectId(),
    property: propertyId,
    status: 'APPROVED',
    paymentStatus: 'PAID',
    amountPaid: 5000,
    isTestData: true,
  };
  const property = { status: 'OCCUPIED' };
  Booking.findById = async () => booking;
  Booking.findOne = async () => null;
  Booking.findOneAndUpdate = async (_filter, update) => {
    Object.assign(booking, update.$set);
    return booking;
  };
  Property.updateOne = async (_filter, update) => {
    property.status = update.$set.status;
  };

  try {
    const result = await closeTestBooking(booking._id, { id: adminId, role: 'ADMIN' });
    assert.equal(result.booking.status, 'CANCELLED');
    assert.equal(property.status, 'AVAILABLE');
  } finally {
    Booking.findById = originalBookingFindById;
    Booking.findOne = originalFindOne;
    Booking.findOneAndUpdate = originalBookingFindOneAndUpdate;
    Property.updateOne = originalPropertyUpdateOne;
  }
});

test('tenancy completion requires both parties and preserves legacy payment fields', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const landlordId = new mongoose.Types.ObjectId();
  const propertyId = new mongoose.Types.ObjectId();
  const booking = {
    _id: new mongoose.Types.ObjectId(),
    tenant: tenantId,
    landlord: landlordId,
    property: propertyId,
    status: 'APPROVED',
    paymentStatus: 'PAID',
    amountPaid: 12000,
    completionRequestedBy: null,
    completionRequestedAt: null,
    completedAt: null,
  };
  const property = { status: 'OCCUPIED' };
  Booking.findById = async () => booking;
  Booking.findOneAndUpdate = async (filter, update) => {
    if (filter.status !== booking.status) return null;
    if (filter.completionRequestedBy?.$in) {
      if (booking.completionRequestedBy !== null) return null;
    } else if (filter.completionRequestedBy !== booking.completionRequestedBy) {
      return null;
    }
    Object.assign(booking, update.$set);
    return booking;
  };
  Booking.findOne = async () => null;
  Property.updateOne = async (_filter, update) => {
    property.status = update.$set.status;
  };

  try {
    const request = await updateBookingCompletion(
      booking._id,
      { id: landlordId, role: 'LANDLORD' },
      'REQUEST'
    );
    assert.equal(request.completed, false);
    assert.equal(request.booking.status, 'APPROVED');
    assert.equal(request.booking.completionRequestedBy, 'LANDLORD');

    const confirmation = await updateBookingCompletion(
      booking._id,
      { id: tenantId, role: 'TENANT' },
      'CONFIRM'
    );
    assert.equal(confirmation.completed, true);
    assert.equal(booking.status, 'COMPLETED');
    assert.ok(booking.completedAt instanceof Date);
    assert.equal(booking.paymentStatus, 'PAID');
    assert.equal(booking.amountPaid, 12000);
    assert.equal(property.status, 'AVAILABLE');
  } finally {
    Booking.findById = originalBookingFindById;
    Booking.findOne = originalFindOne;
    Booking.findOneAndUpdate = originalBookingFindOneAndUpdate;
    Property.updateOne = originalPropertyUpdateOne;
  }
});

test('tenancy completion ignores legacy pending booking payments', async () => {
  const booking = {
    _id: new mongoose.Types.ObjectId(),
    tenant: 'tenant-1',
    landlord: 'landlord-1',
    property: new mongoose.Types.ObjectId(),
    status: 'APPROVED',
    completionRequestedBy: 'LANDLORD',
  };
  const property = { status: 'OCCUPIED' };
  let completionConfirmed = false;
  Booking.findById = async () => booking;
  Booking.findOneAndUpdate = async (_filter, update) => {
    Object.assign(booking, update.$set);
    completionConfirmed = true;
    return booking;
  };
  Booking.findOne = async () => null;
  Property.updateOne = async (_filter, update) => {
    property.status = update.$set.status;
  };

  try {
    const result = await updateBookingCompletion(
      booking._id,
      { id: 'tenant-1', role: 'TENANT' },
      'CONFIRM'
    );
    assert.equal(result.completed, true);
    assert.equal(completionConfirmed, true);
    assert.equal(property.status, 'AVAILABLE');
  } finally {
    Booking.findById = originalBookingFindById;
    Booking.findOne = originalFindOne;
    Booking.findOneAndUpdate = originalBookingFindOneAndUpdate;
    Property.updateOne = originalPropertyUpdateOne;
  }
});

test('admin can resolve an active booking and release its property', async () => {
  const booking = {
    _id: new mongoose.Types.ObjectId(),
    property: new mongoose.Types.ObjectId(),
    status: 'APPROVED',
  };
  const property = { status: 'OCCUPIED' };
  Booking.findById = async () => booking;
  Booking.findOneAndUpdate = async (_filter, update) => {
    Object.assign(booking, update.$set);
    return booking;
  };
  Booking.findOne = async () => null;
  Property.updateOne = async (_filter, update) => {
    property.status = update.$set.status;
  };

  try {
    const result = await resolveBookingAvailability(
      booking._id,
      { id: new mongoose.Types.ObjectId(), role: 'ADMIN' }
    );
    assert.equal(result.completed, true);
    assert.equal(booking.status, 'COMPLETED');
    assert.equal(property.status, 'AVAILABLE');
  } finally {
    Booking.findById = originalBookingFindById;
    Booking.findOneAndUpdate = originalBookingFindOneAndUpdate;
    Booking.findOne = originalFindOne;
    Property.updateOne = originalPropertyUpdateOne;
  }
});

test('only admins can resolve booking availability', async () => {
  await assert.rejects(
    resolveBookingAvailability('booking-1', { id: 'landlord-1', role: 'LANDLORD' }),
    error => error.status === 403
  );
});

test('a completion request can be withdrawn by the party who made it', async () => {
  const booking = {
    _id: new mongoose.Types.ObjectId(),
    tenant: 'tenant-1',
    landlord: 'landlord-1',
    property: new mongoose.Types.ObjectId(),
    status: 'APPROVED',
    completionRequestedBy: 'TENANT',
    completionRequestedAt: new Date(),
  };
  Booking.findById = async () => booking;
  Booking.findOneAndUpdate = async (_filter, update) => {
    Object.assign(booking, update.$set);
    return booking;
  };

  try {
    const result = await updateBookingCompletion(
      booking._id,
      { id: 'tenant-1', role: 'TENANT' },
      'WITHDRAW'
    );
    assert.equal(result.booking.completionRequestedBy, null);
    assert.equal(result.booking.completionRequestedAt, null);
    assert.equal(result.booking.status, 'APPROVED');
  } finally {
    Booking.findById = originalBookingFindById;
    Booking.findOneAndUpdate = originalBookingFindOneAndUpdate;
  }
});

test('only an admin can explicitly flag unpaid data as test data', async () => {
  const booking = {
    _id: new mongoose.Types.ObjectId(),
    status: 'PENDING',
    paymentStatus: 'UNPAID',
    amountPaid: 0,
  };
  Booking.findById = async () => booking;
  Booking.findOneAndUpdate = async (_filter, update) => {
    Object.assign(booking, update.$set);
    return booking;
  };

  try {
    await assert.rejects(
      markBookingAsTestData(booking._id, { id: 'tenant-1', role: 'TENANT' }),
      error => error.status === 403
    );
    const result = await markBookingAsTestData(booking._id, { id: 'admin-1', role: 'ADMIN' });
    assert.equal(result.booking.isTestData, true);
    assert.equal(String(result.booking.testDataMarkedBy), 'admin-1');
  } finally {
    Booking.findById = originalBookingFindById;
    Booking.findOneAndUpdate = originalBookingFindOneAndUpdate;
  }
});
