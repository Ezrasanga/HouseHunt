import test from 'node:test';
import assert from 'node:assert/strict';

import Booking from '../models/Booking.js';
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

test.afterEach(() => {
  Property.findById = originalPropertyFindById;
  Property.findOneAndDelete = originalPropertyFindOneAndDelete;
  Property.findOneAndUpdate = originalPropertyFindOneAndUpdate;
  Booking.exists = originalBookingExists;
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
      assert.match(error.message, /active confirmed booking/);
      return true;
    }
  );
});

test('admin can mark a property available despite legacy booking-payment records', async () => {
  const property = {
    _id: 'property-4',
    status: 'OCCUPIED',
  };
  let findByIdCount = 0;
  Property.findById = id => {
    findByIdCount += 1;
    if (findByIdCount === 1) return Promise.resolve(property);
    return {
      populate: () => ({
        lean: async () => ({ id, status: property.status }),
      }),
    };
  };
  Property.findOneAndUpdate = async (_filter, update) => {
    Object.assign(property, update.$set);
    return property;
  };
  Booking.exists = async () => null;

  const result = await updatePropertyStatus(
    'property-4',
    { id: 'admin-1', role: 'ADMIN' },
    { status: 'AVAILABLE' }
  );

  assert.equal(property.status, 'AVAILABLE');
  assert.equal(result.property.status, 'AVAILABLE');
});

test('admin can make a property available after no active booking remains', async () => {
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

test('landlord can update availability only for their own approved listing', async () => {
  const property = {
    _id: 'landlord-property',
    owner: 'landlord-1',
    status: 'OCCUPIED',
    isApproved: true,
  };
  let findByIdCount = 0;
  let updateFilter;
  Property.findById = id => {
    findByIdCount += 1;
    if (findByIdCount === 1) return Promise.resolve(property);
    return {
      populate: () => ({
        lean: async () => ({ id, status: property.status }),
      }),
    };
  };
  Property.findOneAndUpdate = async (filter, update) => {
    updateFilter = filter;
    Object.assign(property, update.$set);
    return property;
  };
  Booking.exists = async () => null;

  const result = await updatePropertyStatus(
    property._id,
    { id: 'landlord-1', role: 'LANDLORD' },
    { status: 'AVAILABLE' }
  );

  assert.equal(result.property.status, 'AVAILABLE');
  assert.equal(updateFilter.owner, 'landlord-1');
  assert.equal(updateFilter.isApproved, true);
});

test('landlord cannot update another owner or set a non-availability status', async () => {
  const property = {
    _id: 'landlord-property',
    owner: 'landlord-1',
    status: 'AVAILABLE',
    isApproved: true,
  };
  Property.findById = async () => property;

  await assert.rejects(
    updatePropertyStatus(
      property._id,
      { id: 'landlord-2', role: 'LANDLORD' },
      { status: 'OCCUPIED' }
    ),
    error => error.status === 403
  );
  await assert.rejects(
    updatePropertyStatus(
      property._id,
      { id: 'landlord-1', role: 'LANDLORD' },
      { status: 'HIDDEN' }
    ),
    error => error.status === 409
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
