import test from 'node:test';
import assert from 'node:assert/strict';

import Booking from '../models/Booking.js';
import Payment from '../models/Payment.js';
import Property from '../models/Property.js';
import {
  approveProperty,
  deleteProperty,
  normalizeId,
  updateProperty,
  updatePropertyStatus,
} from '../services/propertyService.js';

const originalPropertyFindById = Property.findById;
const originalPropertyFindOneAndDelete = Property.findOneAndDelete;
const originalPropertyFindOneAndUpdate = Property.findOneAndUpdate;
const originalBookingExists = Booking.exists;
const originalBookingDistinct = Booking.distinct;
const originalPaymentExists = Payment.exists;

test.afterEach(() => {
  Property.findById = originalPropertyFindById;
  Property.findOneAndDelete = originalPropertyFindOneAndDelete;
  Property.findOneAndUpdate = originalPropertyFindOneAndUpdate;
  Booking.exists = originalBookingExists;
  Booking.distinct = originalBookingDistinct;
  Payment.exists = originalPaymentExists;
});

test('normalizeId converts object-like ids to comparable strings', () => {
  assert.equal(normalizeId('507f191e810c19729de860ea'), '507f191e810c19729de860ea');
  assert.equal(normalizeId({ _id: '507f191e810c19729de860ea' }), '507f191e810c19729de860ea');
  assert.equal(normalizeId({ id: '507f191e810c19729de860ea' }), '507f191e810c19729de860ea');
  assert.equal(normalizeId({ toString: () => '507f191e810c19729de860ea' }), '507f191e810c19729de860ea');
  assert.equal(normalizeId(null), null);
});

test('landlord cannot delete a property with booking history', async () => {
  let deleted = false;
  const property = {
    _id: 'property-1',
    owner: 'landlord-1',
    deleteOne: async () => { deleted = true; },
  };
  Property.findById = async () => property;
  Booking.exists = async () => ({ _id: 'booking-1' });

  await assert.rejects(
    deleteProperty('property-1', { id: 'landlord-1', role: 'LANDLORD' }),
    error => {
      assert.equal(error.status, 409);
      assert.match(error.message, /booking history/);
      return true;
    }
  );
  assert.equal(deleted, false);
});

test('landlord can delete a property with no booking history', async () => {
  let deleted = false;
  const property = {
    _id: 'property-2',
    owner: 'landlord-1',
  };
  Property.findById = async () => property;
  Property.findOneAndDelete = async () => {
    deleted = true;
    return property;
  };
  Booking.exists = async () => null;

  const result = await deleteProperty('property-2', { id: 'landlord-1', role: 'LANDLORD' });

  assert.equal(deleted, true);
  assert.equal(result.property._id, 'property-2');
});

test('admin cannot mark a property available while an approved booking is active', async () => {
  const property = {
    _id: 'property-3',
    status: 'OCCUPIED',
    save: async () => {
      throw new Error('An actively booked property must not be made available.');
    },
  };
  Property.findById = async () => property;
  Booking.exists = async () => ({ _id: 'booking-1' });

  await assert.rejects(
    updatePropertyStatus('property-3', { id: 'admin-1', role: 'ADMIN' }, { status: 'AVAILABLE' }),
    error => {
      assert.equal(error.status, 409);
      assert.match(error.message, /approved booking/);
      return true;
    }
  );
});

test('admin cannot mark a property available while a related payment is pending or successful', async () => {
  const property = {
    _id: 'property-4',
    status: 'OCCUPIED',
    save: async () => {
      throw new Error('A property with an unresolved payment must not be made available.');
    },
  };
  Property.findById = async () => property;
  Booking.exists = async () => null;
  Booking.distinct = async () => ['booking-1'];
  Payment.exists = async () => ({ _id: 'payment-1' });

  await assert.rejects(
    updatePropertyStatus('property-4', { id: 'admin-1', role: 'ADMIN' }, { status: 'AVAILABLE' }),
    error => {
      assert.equal(error.status, 409);
      assert.match(error.message, /pending or successful payment/);
      return true;
    }
  );
});

test('admin cannot mark a property available while a non-completed booking records payment', async () => {
  const property = {
    _id: 'property-paid-booking',
    status: 'OCCUPIED',
    save: async () => {
      throw new Error('A paid booking must keep the property unavailable.');
    },
  };
  Property.findById = async () => property;
  Booking.exists = async filter => (filter.$or ? { _id: 'paid-booking' } : null);

  await assert.rejects(
    updatePropertyStatus('property-paid-booking', { id: 'admin-1', role: 'ADMIN' }, { status: 'AVAILABLE' }),
    error => {
      assert.equal(error.status, 409);
      assert.match(error.message, /paid booking/);
      return true;
    }
  );
});

test('admin can make a property available after booking completion when no active payment remains', async () => {
  let findByIdCount = 0;
  const property = {
    _id: 'property-7',
    status: 'OCCUPIED',
    save: async () => {},
  };
  Property.findById = () => {
    findByIdCount += 1;
    if (findByIdCount === 1) return Promise.resolve(property);
    return {
      populate: () => ({
        lean: async () => ({ id: 'property-7', status: property.status }),
      }),
    };
  };
  Property.findOneAndUpdate = async (_filter, update) => {
    Object.assign(property, update.$set);
    return property;
  };
  Booking.exists = async () => null;
  Booking.distinct = async (_field, filter) => {
    assert.deepEqual(filter, {
      property: 'property-7',
      status: { $ne: 'COMPLETED' },
    });
    return [];
  };

  const result = await updatePropertyStatus(
    'property-7',
    { id: 'admin-1', role: 'ADMIN' },
    { status: 'AVAILABLE' }
  );

  assert.equal(property.status, 'AVAILABLE');
  assert.equal(result.property.status, 'AVAILABLE');
});

test('admin status update does not overwrite a concurrent booking approval', async () => {
  const property = {
    _id: 'property-status-race',
    status: 'AVAILABLE',
  };
  Property.findById = async () => property;
  Booking.exists = async () => null;
  Booking.distinct = async () => [];
  Property.findOneAndUpdate = async () => null;

  await assert.rejects(
    updatePropertyStatus('property-status-race', { id: 'admin-1', role: 'ADMIN' }, { status: 'AVAILABLE' }),
    error => {
      assert.equal(error.status, 409);
      assert.match(error.message, /changed while its status/);
      return true;
    }
  );
});

test('property details cannot be edited while an active booking exists', async () => {
  const property = {
    _id: 'property-5',
    owner: 'landlord-1',
    status: 'AVAILABLE',
    isApproved: true,
    save: async () => {
      throw new Error('An actively booked property must not be edited.');
    },
  };
  Property.findById = async () => property;
  Booking.exists = async () => ({ _id: 'booking-1' });

  await assert.rejects(
    updateProperty('property-5', { id: 'landlord-1', role: 'LANDLORD' }, { title: 'Updated listing' }),
    error => {
      assert.equal(error.status, 409);
      assert.match(error.message, /active booking/);
      return true;
    }
  );
});

test('property approval cannot be revoked while an approved booking is active', async () => {
  const property = {
    _id: 'property-6',
    isApproved: true,
    status: 'OCCUPIED',
    save: async () => {
      throw new Error('Approval on an actively booked property must not be changed.');
    },
  };
  Property.findById = async () => property;
  Booking.exists = async () => ({ _id: 'booking-1' });

  await assert.rejects(
    approveProperty('property-6', { id: 'admin-1', role: 'ADMIN' }, { isApproved: false }),
    error => {
      assert.equal(error.status, 409);
      assert.match(error.message, /approved booking is active/);
      return true;
    }
  );
});
