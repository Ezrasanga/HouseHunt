import test from 'node:test';
import assert from 'node:assert/strict';

import Booking from '../models/Booking.js';
import Property from '../models/Property.js';
import propertyRouter from '../routes/properties.js';
import {
  approveProperty,
  confirmPropertyAvailability,
  createProperty,
  deleteProperty,
  getProperty,
  listProperties,
  normalizeId,
  updateProperty,
  updatePropertyStatus,
} from '../services/propertyService.js';

const originalPropertyFindById = Property.findById;
const originalPropertyFindByIdAndUpdate = Property.findByIdAndUpdate;
const originalPropertyFind = Property.find;
const originalPropertyCountDocuments = Property.countDocuments;
const originalPropertyFindOneAndDelete = Property.findOneAndDelete;
const originalPropertyFindOneAndUpdate = Property.findOneAndUpdate;
const originalPropertyUpdateMany = Property.updateMany;
const originalBookingExists = Booking.exists;

test.afterEach(() => {
  Property.findById = originalPropertyFindById;
  Property.findByIdAndUpdate = originalPropertyFindByIdAndUpdate;
  Property.find = originalPropertyFind;
  Property.countDocuments = originalPropertyCountDocuments;
  Property.findOneAndDelete = originalPropertyFindOneAndDelete;
  Property.findOneAndUpdate = originalPropertyFindOneAndUpdate;
  Property.updateMany = originalPropertyUpdateMany;
  Booking.exists = originalBookingExists;
});

function mockPropertyList({ total = 0, properties = [] } = {}) {
  const captured = {};
  Property.find = filter => {
    captured.filter = filter;
    return {
      populate() { return this; },
      sort(value) { captured.sort = value; return this; },
      skip(value) { captured.skip = value; return this; },
      limit(value) { captured.limit = value; return this; },
      lean: async () => properties,
    };
  };
  Property.countDocuments = async filter => {
    assert.equal(filter, captured.filter);
    return total;
  };
  Property.updateMany = async () => {};
  return captured;
}

test('public property details hide saved contact information until access is unlocked', async () => {
  const owner = {
    _id: 'landlord-1',
    firstName: 'Ada',
    lastName: 'Landlord',
    phone: '+254700123456',
    email: 'ada@example.com',
    whatsapp: '254711123456',
    ig: 'ada.homes',
    fb: 'ada.landlord',
    tt: 'ada_homes',
    tw: 'ada-homes',
  };
  Property.findById = () => ({
    populate: () => ({
      lean: async () => ({
        _id: 'property-1',
        owner,
        isApproved: true,
        status: 'AVAILABLE',
        externalTenancies: [{
          _id: 'external-tenancy-1',
          tenantName: 'External Tenant',
          moveInDate: new Date('2026-01-01T00:00:00.000Z'),
          leaseMonths: 6,
          endedAt: null,
        }],
        location: { county: 'Nairobi', town: 'Nairobi', street: 'Private Road' },
      }),
    }),
  });
  Property.findByIdAndUpdate = async () => {};

  const { property } = await getProperty('property-1');

  assert.equal(property.contact, null);
  assert.equal(property.owner.phone, undefined);
  assert.equal(property.owner.whatsapp, undefined);
  assert.equal(property.location.street, undefined);
  assert.equal(property.externalTenancies, undefined);

  const ownerResult = await getProperty('property-1', { id: 'landlord-1', role: 'LANDLORD' });
  assert.deepEqual(ownerResult.property.contact, {
    phone: '+254700123456',
    email: 'ada@example.com',
    whatsapp: '254711123456',
    ig: 'ada.homes',
    fb: 'ada.landlord',
    tt: 'ada_homes',
    tw: 'ada-homes',
  });
  assert.equal(ownerResult.property.externalTenancies[0].tenantName, 'External Tenant');
});

test('normalizeId converts object-like ids to comparable strings', () => {
  assert.equal(normalizeId('507f191e810c19729de860ea'), '507f191e810c19729de860ea');
  assert.equal(normalizeId({ _id: '507f191e810c19729de860ea' }), '507f191e810c19729de860ea');
  assert.equal(normalizeId({ id: '507f191e810c19729de860ea' }), '507f191e810c19729de860ea');
  assert.equal(normalizeId({ toString: () => '507f191e810c19729de860ea' }), '507f191e810c19729de860ea');
  assert.equal(normalizeId(null), null);
});

test('availability confirmation route is registered for landlords', () => {
  const route = propertyRouter.stack.find(layer => layer.route?.path === '/:id/confirm-availability');

  assert.ok(route);
  assert.equal(route.route.methods.post, true);
  assert.equal(route.route.stack.length, 3);
});

test('public property search applies location, bedroom, and amenity filters and preserves pagination', async () => {
  const captured = mockPropertyList({ total: 13 });

  const result = await listProperties({
    county: 'Nairobi',
    town: 'Westlands',
    bedrooms: '2',
    amenities: 'wifi,parking',
    sort: 'recently-confirmed',
    page: '3',
    limit: '5',
  });

  assert.ok(captured.filter['location.county'].test('Nairobi'));
  assert.ok(captured.filter['location.town'].test('Westlands'));
  assert.equal(captured.filter.bedrooms, 2);
  assert.equal(captured.filter['amenities.wifi'], true);
  assert.equal(captured.filter['amenities.parking'], true);
  assert.deepEqual(captured.sort, { status: 1, availabilityConfirmedAt: -1, createdAt: -1, _id: -1 });
  assert.equal(captured.skip, 10);
  assert.equal(captured.limit, 5);
  assert.deepEqual(result.pagination, {
    page: 3,
    limit: 5,
    total: 13,
    totalPages: 3,
    hasNextPage: false,
    hasPrevPage: true,
  });
});

test('public property search supports newest sorting and validates filter values', async () => {
  const captured = mockPropertyList();

  await listProperties({ sort: 'newest' });
  assert.deepEqual(captured.sort, { createdAt: -1, _id: -1 });

  await assert.rejects(
    listProperties({ sort: 'oldest' }),
    error => error.status === 400
  );
  await assert.rejects(
    listProperties({ amenities: 'notAnAmenity' }),
    error => error.status === 400
  );
  await assert.rejects(
    listProperties({ bedrooms: '1.5' }),
    error => error.status === 400
  );
});

test('property media can only reference Cloudinary uploads owned by the listing owner', async () => {
  const previousCloudName = globalThis.process.env.CLOUDINARY_CLOUD_NAME;
  globalThis.process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  try {
    await assert.rejects(
      createProperty(
        { id: 'landlord-1', role: 'LANDLORD' },
        { media: [{
          url: 'https://example.com/property.jpg',
          type: 'image',
          publicId: 'househunt/properties/landlord-1/photo',
        }] }
      ),
      error => error.status === 400
    );
    await assert.rejects(
      createProperty(
        { id: 'landlord-1', role: 'LANDLORD' },
        { media: [{
          url: 'https://res.cloudinary.com/test-cloud/image/upload/photo.jpg',
          type: 'image',
          publicId: 'househunt/properties/another-landlord/photo',
        }] }
      ),
      error => error.status === 400
    );
  } finally {
    if (previousCloudName === undefined) delete globalThis.process.env.CLOUDINARY_CLOUD_NAME;
    else globalThis.process.env.CLOUDINARY_CLOUD_NAME = previousCloudName;
  }
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
    isApproved: true,
    save: async () => {
      throw new Error('An actively booked property must not be made available.');
    },
  };
  Property.findById = async () => property;
  Booking.exists = async () => ({ _id: 'booking-1' });

  await assert.rejects(
    updatePropertyStatus('property-3', { id: 'admin-1', role: 'ADMIN' }, { status: 'AVAILABLE', confirmVacant: true }),
    error => {
      assert.equal(error.status, 409);
      assert.match(error.message, /active confirmed booking/);
      return true;
    }
  );
});

test('admin can correct a legacy occupied status after explicit vacancy confirmation', async () => {
  const property = {
    _id: 'property-4',
    status: 'OCCUPIED',
    isApproved: true,
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
    { status: 'AVAILABLE', confirmVacant: true }
  );

  assert.equal(property.status, 'AVAILABLE');
  assert.equal(result.property.status, 'AVAILABLE');
});

test('admin can make a property available after no active booking remains', async () => {
  let findByIdCount = 0;
  const property = {
    _id: 'property-7',
    status: 'OCCUPIED',
    isApproved: true,
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
    { status: 'AVAILABLE', confirmVacant: true }
  );

  assert.equal(property.status, 'AVAILABLE');
  assert.equal(result.property.status, 'AVAILABLE');
});

test('admin status update does not overwrite a concurrent booking approval', async () => {
  const property = {
    _id: 'property-status-race',
    status: 'OCCUPIED',
    isApproved: true,
  };
  Property.findById = async () => property;
  Booking.exists = async () => null;
  Property.findOneAndUpdate = async () => null;

  await assert.rejects(
    updatePropertyStatus('property-status-race', { id: 'admin-1', role: 'ADMIN' }, { status: 'AVAILABLE', confirmVacant: true }),
    error => {
      assert.equal(error.status, 409);
      assert.match(error.message, /changed while its status/);
      return true;
    }
  );
});

test('landlord can confirm an external tenancy ended only after its lease term', async () => {
  const property = {
    _id: 'landlord-property',
    owner: 'landlord-1',
    status: 'OCCUPIED',
    isApproved: true,
    externalTenancies: [{
      _id: 'external-tenancy-1',
      tenantName: 'External Tenant',
      moveInDate: new Date(Date.now() - 70 * 24 * 60 * 60 * 1000),
      leaseMonths: 1,
      endedAt: null,
    }],
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
    property.status = update.$set.status;
    property.availabilityConfirmedAt = update.$set.availabilityConfirmedAt;
    property.externalTenancies[0].endedAt = update.$set['externalTenancies.$.endedAt'];
    property.externalTenancies[0].endedBy = update.$set['externalTenancies.$.endedBy'];
    return property;
  };
  Booking.exists = async () => null;

  const result = await updatePropertyStatus(
    property._id,
    { id: 'landlord-1', role: 'LANDLORD' },
    { status: 'AVAILABLE', confirmVacant: true }
  );

  assert.equal(result.property.status, 'AVAILABLE');
  assert.ok(property.availabilityConfirmedAt instanceof Date);
  assert.ok(property.externalTenancies[0].endedAt instanceof Date);
  assert.equal(property.externalTenancies[0].endedBy, 'landlord-1');
  assert.equal(updateFilter.owner, 'landlord-1');
  assert.equal(updateFilter.isApproved, true);
  assert.equal(updateFilter.status, 'OCCUPIED');
  assert.equal(updateFilter.externalTenancies.$elemMatch.endedAt, null);
});

test('landlord must record tenant and lease details before marking a listing taken', async () => {
  const property = {
    _id: 'external-property',
    owner: 'landlord-1',
    status: 'AVAILABLE',
    isApproved: true,
    externalTenancies: [],
  };
  let updatePayload;
  let updateFilter;
  let findByIdCount = 0;
  Property.findById = id => {
    findByIdCount += 1;
    if (findByIdCount === 1) return Promise.resolve(property);
    return {
      populate: () => ({
        lean: async () => ({ id, status: property.status, externalTenancies: [updatePayload.$push.externalTenancies] }),
      }),
    };
  };
  Property.findOneAndUpdate = async (filter, update) => {
    updateFilter = filter;
    updatePayload = update;
    property.status = update.$set.status;
    property.externalTenancies.push(update.$push.externalTenancies);
    return property;
  };
  Booking.exists = async () => null;

  const result = await updatePropertyStatus(
    property._id,
    { id: 'landlord-1', role: 'LANDLORD' },
    {
      status: 'OCCUPIED',
      externalTenancy: {
        tenantName: 'External Tenant',
        moveInDate: new Date().toISOString().slice(0, 10),
        leaseMonths: 6,
      },
    }
  );

  assert.equal(property.status, 'OCCUPIED');
  assert.equal(result.property.externalTenancies[0].tenantName, 'External Tenant');
  assert.equal(updatePayload.$push.externalTenancies.recordedBy, 'landlord-1');
  assert.ok(updatePayload.$push.externalTenancies.recordedAt instanceof Date);
  assert.equal(updateFilter.status, 'AVAILABLE');
});

test('landlord can add a record to an untracked occupied external tenancy', async () => {
  const property = {
    _id: 'legacy-occupied-property',
    owner: 'landlord-1',
    status: 'OCCUPIED',
    isApproved: true,
    externalTenancies: [],
  };
  let updateFilter;
  let findByIdCount = 0;
  Property.findById = id => {
    findByIdCount += 1;
    if (findByIdCount === 1) return Promise.resolve(property);
    return {
      populate: () => ({
        lean: async () => ({ id, status: property.status, externalTenancies: property.externalTenancies }),
      }),
    };
  };
  Property.findOneAndUpdate = async (filter, update) => {
    updateFilter = filter;
    property.externalTenancies.push(update.$push.externalTenancies);
    return property;
  };
  Booking.exists = async () => null;

  const result = await updatePropertyStatus(
    property._id,
    { id: 'landlord-1', role: 'LANDLORD' },
    {
      status: 'OCCUPIED',
      externalTenancy: {
        tenantName: 'Existing External Tenant',
        moveInDate: new Date().toISOString().slice(0, 10),
        leaseMonths: 3,
      },
    }
  );

  assert.equal(property.status, 'OCCUPIED');
  assert.equal(updateFilter.status, 'OCCUPIED');
  assert.equal(result.property.externalTenancies[0].tenantName, 'Existing External Tenant');
});

test('landlord cannot mark a listing taken while a HouseHunt tenancy is approved', async () => {
  const property = {
    _id: 'external-property',
    owner: 'landlord-1',
    status: 'AVAILABLE',
    isApproved: true,
  };
  let updateAttempted = false;
  Property.findById = async () => property;
  Property.findOneAndUpdate = async () => {
    updateAttempted = true;
    return property;
  };
  Booking.exists = async () => ({ _id: 'booking-1' });

  await assert.rejects(
    updatePropertyStatus(
      property._id,
      { id: 'landlord-1', role: 'LANDLORD' },
      {
        status: 'OCCUPIED',
        externalTenancy: {
          tenantName: 'External Tenant',
          moveInDate: new Date().toISOString().slice(0, 10),
          leaseMonths: 6,
        },
      }
    ),
    error => {
      assert.equal(error.status, 409);
      assert.match(error.message, /active confirmed booking/);
      return true;
    }
  );
  assert.equal(updateAttempted, false);
});

test('landlord cannot make an external tenancy available before its lease ends', async () => {
  const property = {
    _id: 'external-property',
    owner: 'landlord-1',
    status: 'OCCUPIED',
    isApproved: true,
    externalTenancies: [{
      _id: 'external-tenancy-1',
      tenantName: 'External Tenant',
      moveInDate: new Date(),
      leaseMonths: 6,
      endedAt: null,
    }],
  };
  let updateAttempted = false;
  Property.findById = async () => property;
  Property.findOneAndUpdate = async () => {
    updateAttempted = true;
    return property;
  };
  Booking.exists = async () => null;

  await assert.rejects(
    updatePropertyStatus(
      property._id,
      { id: 'landlord-1', role: 'LANDLORD' },
      { status: 'AVAILABLE', confirmVacant: true }
    ),
    error => {
      assert.equal(error.status, 409);
      assert.match(error.message, /lease term has not ended/);
      return true;
    }
  );
  assert.equal(updateAttempted, false);
});

test('admin status changes cannot create an occupied tenancy', async () => {
  Property.findById = async () => ({
    _id: 'admin-property',
    status: 'AVAILABLE',
    isApproved: true,
  });

  await assert.rejects(
    updatePropertyStatus(
      'admin-property',
      { id: 'admin-1', role: 'ADMIN' },
      { status: 'OCCUPIED' }
    ),
    error => error.status === 400
  );
});

test('admin cannot bypass an active external tenancy when correcting status', async () => {
  const property = {
    _id: 'admin-property',
    status: 'OCCUPIED',
    isApproved: true,
    externalTenancies: [{ endedAt: null }],
  };
  Property.findById = async () => property;
  Booking.exists = async () => null;
  Property.findOneAndUpdate = async () => {
    throw new Error('An active external tenancy must not be bypassed.');
  };

  await assert.rejects(
    updatePropertyStatus(
      property._id,
      { id: 'admin-1', role: 'ADMIN' },
      { status: 'AVAILABLE', confirmVacant: true }
    ),
    error => {
      assert.equal(error.status, 409);
      assert.match(error.message, /external tenancy is still active/);
      return true;
    }
  );
});

test('editing a listing clears a dismissed quality-review signal', async () => {
  const property = {
    _id: 'listing-to-edit',
    owner: 'landlord-1',
    status: 'PENDING',
    isApproved: false,
  };
  let findByIdCount = 0;
  let savedFields;
  Property.findById = id => {
    findByIdCount += 1;
    if (findByIdCount === 1) return Promise.resolve(property);
    return {
      populate: () => ({
        lean: async () => ({ id, title: 'Updated listing' }),
      }),
    };
  };
  Booking.exists = async () => null;
  Property.findOneAndUpdate = async (_filter, update) => {
    savedFields = update.$set;
    return property;
  };

  await updateProperty(
    property._id,
    { id: 'landlord-1', role: 'LANDLORD' },
    { title: 'Updated listing' }
  );

  assert.equal(savedFields.qualityReviewDismissedAt, null);
  assert.equal(savedFields.qualityReviewDismissedBy, null);
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
    error => error.status === 400
  );
});

test('landlord can confirm an approved available listing', async () => {
  const property = {
    _id: 'landlord-property',
    owner: 'landlord-1',
    status: 'AVAILABLE',
    isApproved: true,
  };
  let findByIdCount = 0;
  let updateFilter;
  let updateFields;
  Property.findById = id => {
    findByIdCount += 1;
    if (findByIdCount === 1) return Promise.resolve(property);
    return {
      populate: () => ({
        lean: async () => ({ id, status: property.status, availabilityConfirmedAt: updateFields.availabilityConfirmedAt }),
      }),
    };
  };
  Property.findOneAndUpdate = async (filter, update) => {
    updateFilter = filter;
    updateFields = update.$set;
    Object.assign(property, updateFields);
    return property;
  };
  Booking.exists = async () => null;

  const result = await confirmPropertyAvailability(
    property._id,
    { id: 'landlord-1', role: 'LANDLORD' }
  );

  assert.equal(updateFilter.owner, 'landlord-1');
  assert.equal(updateFilter.isApproved, true);
  assert.equal(updateFilter.status, 'AVAILABLE');
  assert.ok(updateFields.availabilityConfirmedAt instanceof Date);
  assert.equal(result.property.availabilityConfirmedAt.getTime(), updateFields.availabilityConfirmedAt.getTime());
});

test('landlord cannot confirm another landlord listing', async () => {
  Property.findById = async () => ({
    _id: 'landlord-property',
    owner: 'landlord-1',
    status: 'AVAILABLE',
    isApproved: true,
  });

  await assert.rejects(
    confirmPropertyAvailability(
      'landlord-property',
      { id: 'landlord-2', role: 'LANDLORD' }
    ),
    error => error.status === 403
  );
});

test('availability confirmation rejects taken or unapproved listings', async () => {
  const property = {
    _id: 'landlord-property',
    owner: 'landlord-1',
    status: 'OCCUPIED',
    isApproved: true,
  };
  Property.findById = async () => property;

  await assert.rejects(
    confirmPropertyAvailability(
      property._id,
      { id: 'landlord-1', role: 'LANDLORD' }
    ),
    error => error.status === 409
  );
});

test('availability confirmation is blocked by an active confirmed booking', async () => {
  const property = {
    _id: 'landlord-property',
    owner: 'landlord-1',
    status: 'AVAILABLE',
    isApproved: true,
  };
  Property.findById = async () => property;
  Booking.exists = async () => ({ _id: 'booking-1' });

  await assert.rejects(
    confirmPropertyAvailability(
      property._id,
      { id: 'landlord-1', role: 'LANDLORD' }
    ),
    error => {
      assert.equal(error.status, 409);
      assert.match(error.message, /active confirmed booking/);
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
