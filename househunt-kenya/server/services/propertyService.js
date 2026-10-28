import Property from '../models/Property.js';
import Booking from '../models/Booking.js';
import User from '../models/User.js';
import PropertyUnlock from '../models/PropertyUnlock.js';

export function normalizeId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
      const stringValue = value.toString();
      if (stringValue && stringValue !== '[object Object]') return stringValue;
    }
    if (value._id) return normalizeId(value._id);
    if (value.id) return normalizeId(value.id);
  }
  return null;
}

function sanitizeUser(user, includeContact = false) {
  if (!user) return null;
  const result = {
    id: normalizeId(user.id || user._id),
    firstName: user.firstName,
    lastName: user.lastName,
    profileImage: user.profileImage || '',
  };
  if (includeContact) {
    result.phone = user.phone || '';
    result.email = user.email || '';
    result.whatsapp = user.whatsapp || '';
    result.ig = user.ig || '';
    result.fb = user.fb || '';
    result.tt = user.tt || '';
    result.tw = user.tw || '';
  }
  return result;
}

function sanitizeProperty(property, { revealContacts = false, includeExternalTenancies = false } = {}) {
  if (!property) return null;
  const plain = property.toObject ? property.toObject() : property;
  const location = plain.location ? { ...plain.location } : plain.location;
  if (!includeExternalTenancies) delete plain.externalTenancies;
  if (location && !revealContacts) delete location.street;
  return {
    ...plain,
    location,
    owner: plain.owner && typeof plain.owner === 'object' ? sanitizeUser(plain.owner, revealContacts) : plain.owner,
    contact: revealContacts && plain.owner && typeof plain.owner === 'object'
      ? {
        phone: plain.owner.phone || '',
        email: plain.owner.email || '',
        whatsapp: plain.owner.whatsapp || '',
        ig: plain.owner.ig || '',
        fb: plain.owner.fb || '',
        tt: plain.owner.tt || '',
        tw: plain.owner.tw || '',
      }
      : null,
    unlocked: revealContacts,
  };
}

function buildPagination(page, limit, total) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchPattern(value) {
  return new RegExp(escapeRegex(String(value).trim()), 'i');
}

function createPropertyLifecycleError(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function activeExternalTenancy(property) {
  return property.externalTenancies?.find(tenancy => !tenancy.endedAt) || null;
}

async function assertPropertyCanBeMadeAvailable(propertyId) {
  const activeBooking = await Booking.exists({
    property: propertyId,
    status: 'APPROVED',
  });
  if (activeBooking) {
    throw createPropertyLifecycleError(
      'This property has an active confirmed booking. Complete or cancel that booking before marking it available.'
    );
  }
}

function externalLeaseTermEndsAt(tenancy) {
  const moveInDate = new Date(tenancy.moveInDate);
  const leaseMonths = Number(tenancy.leaseMonths);
  if (Number.isNaN(moveInDate.getTime()) || !Number.isSafeInteger(leaseMonths) || leaseMonths < 1) {
    throw createPropertyLifecycleError('The external tenancy is missing a valid move-in date or lease duration.');
  }

  const monthStart = new Date(Date.UTC(
    moveInDate.getUTCFullYear(),
    moveInDate.getUTCMonth() + leaseMonths,
    1
  ));
  const lastDayOfMonth = new Date(Date.UTC(
    monthStart.getUTCFullYear(),
    monthStart.getUTCMonth() + 1,
    0
  )).getUTCDate();
  const termEndsAt = new Date(Date.UTC(
    monthStart.getUTCFullYear(),
    monthStart.getUTCMonth(),
    Math.min(moveInDate.getUTCDate(), lastDayOfMonth) + 1
  ));
  if (Number.isNaN(termEndsAt.getTime())) {
    throw createPropertyLifecycleError('The external lease term could not be calculated from the recorded dates.');
  }
  return termEndsAt;
}

function validateExternalTenancy(payload = {}) {
  const tenantName = typeof payload.tenantName === 'string' ? payload.tenantName.trim() : '';
  const moveInDateValue = typeof payload.moveInDate === 'string' ? payload.moveInDate : '';
  const moveInDate = new Date(`${moveInDateValue}T00:00:00.000Z`);
  const leaseMonths = Number(payload.leaseMonths);
  if (!tenantName || tenantName.length > 120) {
    throw createPropertyLifecycleError('Enter the external tenant name (up to 120 characters).');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(moveInDateValue) ||
      Number.isNaN(moveInDate.getTime()) ||
      moveInDate.toISOString().slice(0, 10) !== moveInDateValue ||
      moveInDate.getTime() > Date.now()) {
    throw createPropertyLifecycleError('Enter a valid move-in date that is not in the future.');
  }
  if (!Number.isInteger(leaseMonths) || leaseMonths < 1) {
    throw createPropertyLifecycleError('Lease duration must be a whole number of at least one month.');
  }
  return { tenantName, moveInDate, leaseMonths };
}

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return undefined;
}

const propertyAmenities = ['wifi', 'parking', 'water', 'electricity', 'security', 'balcony', 'furnished', 'petFriendly'];
const propertySorts = ['featured', 'newest', 'recently-confirmed'];

function buildPublicFilter(query = {}) {
  const filter = { isApproved: true, status: { $ne: 'HIDDEN' } };

  if (query.county) filter['location.county'] = searchPattern(query.county);
  if (query.town) filter['location.town'] = searchPattern(query.town);
  if (query.estate) filter['location.estate'] = searchPattern(query.estate);
  if (query.propertyType) {
    const propertyTypes = ['Apartment', 'Bedsitter', 'Single Room', 'Studio', 'Maisonette', 'Hostel', 'Office', 'Shop', 'Warehouse'];
    const requestedType = String(query.propertyType).trim();
    if (requestedType === 'House' || requestedType === 'Penthouse') filter.propertyType = 'Apartment';
    else if (requestedType === 'Room') filter.propertyType = 'Single Room';
    else if (propertyTypes.includes(requestedType)) filter.propertyType = requestedType;
  }
  if (query.minPrice !== undefined) filter.price = { ...filter.price, $gte: Number(query.minPrice) };
  if (query.maxPrice !== undefined) filter.price = { ...filter.price, $lte: Number(query.maxPrice) };
  if (query.bedrooms !== undefined) filter.bedrooms = Number(query.bedrooms);
  if (query.bathrooms !== undefined) filter.bathrooms = Number(query.bathrooms);
  if (query.amenities !== undefined) {
    const amenities = String(query.amenities).split(',').map(value => value.trim()).filter(Boolean);
    const unknownAmenities = amenities.filter(amenity => !propertyAmenities.includes(amenity));
    if (unknownAmenities.length) {
      const error = new Error('One or more requested amenities are invalid');
      error.status = 400;
      throw error;
    }
    for (const amenity of new Set(amenities)) {
      filter[`amenities.${amenity}`] = true;
    }
  }
  const furnished = parseBoolean(query.furnished);
  if (furnished !== undefined) filter['amenities.furnished'] = furnished;
  const petFriendly = parseBoolean(query.petFriendly);
  if (petFriendly !== undefined) filter['amenities.petFriendly'] = petFriendly;
  if (query.status) {
    filter.status = { $eq: String(query.status).toUpperCase(), $ne: 'HIDDEN' };
  }

  if (query.search) {
    const searchRegex = searchPattern(String(query.search).slice(0, 120));
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { 'location.county': searchRegex },
      { 'location.town': searchRegex },
      { 'location.estate': searchRegex },
    ];
  }

  return filter;
}

export async function listProperties(query = {}, viewer = null) {
  const page = Math.min(100000, Math.max(1, parseInt(query.page, 10) || 1));
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 12));
  const skip = (page - 1) * limit;

  const isAdmin = viewer?.role === 'ADMIN';
  const isLandlord = viewer?.role === 'LANDLORD';
  if (!isAdmin && !isLandlord) {
    for (const field of ['county', 'town']) {
      if (query[field] !== undefined && (typeof query[field] !== 'string' || query[field].trim().length > 100)) {
        const error = new Error(`${field} must be a string of 100 characters or fewer`);
        error.status = 400;
        throw error;
      }
    }
    if (query.amenities !== undefined && (typeof query.amenities !== 'string' || query.amenities.length > 200)) {
      const error = new Error('amenities must be a comma-separated list of valid amenities');
      error.status = 400;
      throw error;
    }
    const sort = query.sort || 'featured';
    if (!propertySorts.includes(String(sort))) {
      const error = new Error('sort must be featured, newest, or recently-confirmed');
      error.status = 400;
      throw error;
    }
  }
  const filter = isAdmin || isLandlord
    ? {}
    : buildPublicFilter(query);

  if (isLandlord && viewer?.id) {
    filter.owner = viewer.id;
  }

  if (!isAdmin && !isLandlord) {
    const numericFilters = ['minPrice', 'maxPrice', 'bedrooms', 'bathrooms'];
    for (const field of numericFilters) {
      if (query[field] === undefined) continue;
      const value = Number(query[field]);
      if (!Number.isFinite(value) || value < 0) {
        const error = new Error(`${field} must be a valid non-negative number`);
        error.status = 400;
        throw error;
      }
    }
    if (query.minPrice !== undefined && query.maxPrice !== undefined && Number(query.minPrice) > Number(query.maxPrice)) {
      const error = new Error('Minimum price cannot exceed maximum price');
      error.status = 400;
      throw error;
    }
    if (query.bedrooms !== undefined && !Number.isInteger(Number(query.bedrooms))) {
      const error = new Error('bedrooms must be a whole number');
      error.status = 400;
      throw error;
    }
  }

  if (!isAdmin && !isLandlord) {
    await Property.updateMany(
      { featured: true, featuredUntil: { $ne: null, $lte: new Date() } },
      { $set: { featured: false, featuredUntil: null, featuredPayment: null } }
    );
  }

  const sort = isAdmin || isLandlord ? 'featured' : String(query.sort || 'featured');
  const sortOrder = sort === 'newest'
    ? { createdAt: -1, _id: -1 }
    : sort === 'recently-confirmed'
      ? { status: 1, availabilityConfirmedAt: -1, createdAt: -1, _id: -1 }
      : { featured: -1, createdAt: -1, _id: -1 };

  const [properties, total] = await Promise.all([
    Property.find(filter)
      .populate('owner', 'firstName lastName profileImage')
      .sort(isAdmin || isLandlord ? { createdAt: -1, _id: -1 } : sortOrder)
      .skip(skip)
      .limit(limit)
      .lean(),
    Property.countDocuments(filter),
  ]);

  return {
    properties: properties.map(property => sanitizeProperty(property, {
      includeExternalTenancies: isAdmin || isLandlord,
    })),
    pagination: buildPagination(page, limit, total),
  };
}

export async function getProperty(id, viewer = null) {
  if (!id) {
    const error = new Error('Property ID is required');
    error.status = 400;
    throw error;
  }

  const property = await Property.findById(id)
    .populate('owner', 'firstName lastName profileImage phone email whatsapp ig fb tt tw')
    .lean();
  if (!property) {
    const error = new Error('Property not found');
    error.status = 404;
    throw error;
  }

  const ownerId = normalizeId(property.owner);
  const viewerId = normalizeId(viewer?.id);
  const isOwner = Boolean(viewerId && ownerId && ownerId === viewerId);
  const isAdmin = viewer?.role === 'ADMIN';
  const hasUnlock = viewer?.role === 'TENANT' && await PropertyUnlock.exists({
    tenant: viewer.id,
    property: property._id,
  });
  const canView = isAdmin || isOwner || (property.isApproved && property.status !== 'HIDDEN');

  if (!canView) {
    const error = new Error('You do not have permission to view this property');
    error.status = 403;
    throw error;
  }

  if (!isOwner && !isAdmin && property.isApproved) {
    await Property.findByIdAndUpdate(id, { $inc: { views: 1 } });
  }

  const revealContacts = isAdmin || isOwner || Boolean(hasUnlock);
  return {
    property: sanitizeProperty(property, {
      revealContacts,
      includeExternalTenancies: isAdmin || isOwner,
    }),
  };
}

export async function createProperty(actor, payload = {}) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (actor.role !== 'LANDLORD' && actor.role !== 'ADMIN') {
    const error = new Error('Only landlords and admins can create properties');
    error.status = 403;
    throw error;
  }

  const validation = validatePropertyInput(payload, actor.id);
  if (!validation.success) {
    const error = new Error('Validation failed');
    error.status = 400;
    error.errors = validation.errors;
    throw error;
  }

  const ownerId = actor.id;
  const owner = await User.findById(ownerId);
  if (!owner) {
    const error = new Error('Owner user not found');
    error.status = 404;
    throw error;
  }

  const property = await Property.create({
    ...validation.data,
    owner: owner._id,
    isApproved: false,
    status: 'PENDING',
    approvedBy: null,
  });

  const populated = await Property.findById(property._id).populate('owner', 'firstName lastName profileImage').lean();
  return { property: sanitizeProperty(populated) };
}

export async function updateProperty(id, actor, payload = {}) {
  if (!id) {
    const error = new Error('Property ID is required');
    error.status = 400;
    throw error;
  }

  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  const property = await Property.findById(id);
  if (!property) {
    const error = new Error('Property not found');
    error.status = 404;
    throw error;
  }

  const isOwner = normalizeId(property.owner) === normalizeId(actor.id);
  const isAdmin = actor.role === 'ADMIN';

  if (!isOwner && !isAdmin) {
    const error = new Error('You do not have permission to update this property');
    error.status = 403;
    throw error;
  }

  if (!isAdmin && !isOwner) {
    const error = new Error('You do not have permission to update this property');
    error.status = 403;
    throw error;
  }

  const activeBooking = await Booking.exists({
    property: property._id,
    status: { $in: ['PENDING', 'APPROVED'] },
  });
  if (property.status === 'OCCUPIED' || activeBooking) {
    throw createPropertyLifecycleError(
      'This property cannot be edited while it has an active booking or is marked occupied.'
    );
  }

  const validation = validatePropertyInput(payload, actor.id);
  if (!validation.success) {
    const error = new Error('Validation failed');
    error.status = 400;
    error.errors = validation.errors;
    throw error;
  }

  if (!isAdmin) {
    const blockedFields = ['owner', 'approvedBy', 'isApproved', 'featured', 'views'];
    blockedFields.forEach((field) => { delete validation.data[field]; });
  }

  const updates = { ...validation.data };
  updates.qualityReviewDismissedAt = null;
  updates.qualityReviewDismissedBy = null;
  if (!isAdmin && property.isApproved) {
    updates.isApproved = false;
    updates.approvedBy = null;
    updates.status = 'PENDING';
  }

  const updatedProperty = await Property.findOneAndUpdate(
    {
      _id: property._id,
      owner: property.owner,
      status: property.status,
      isApproved: property.isApproved,
    },
    { $set: updates },
    { new: true, runValidators: true }
  );
  if (!updatedProperty) {
    throw createPropertyLifecycleError(
      'The property changed while the edit was being saved. Refresh and try again.'
    );
  }

  const populated = await Property.findById(updatedProperty._id).populate('owner', 'firstName lastName profileImage').lean();
  return { property: sanitizeProperty(populated, { includeExternalTenancies: actor.role === 'ADMIN' }) };
}

export async function deleteProperty(id, actor) {
  if (!id) {
    const error = new Error('Property ID is required');
    error.status = 400;
    throw error;
  }

  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  const property = await Property.findById(id);
  if (!property) {
    const error = new Error('Property not found');
    error.status = 404;
    throw error;
  }

  const isOwner = normalizeId(property.owner) === normalizeId(actor.id);
  const isAdmin = actor.role === 'ADMIN';

  if (!isOwner && !isAdmin) {
    const error = new Error('You do not have permission to delete this property');
    error.status = 403;
    throw error;
  }

  if (!isAdmin && !isOwner) {
    const error = new Error('You do not have permission to delete this property');
    error.status = 403;
    throw error;
  }

  const hasBookingHistory = await Booking.exists({ property: property._id });
  if (hasBookingHistory) {
    throw createPropertyLifecycleError(
      'This property cannot be deleted because it has booking history. Contact an administrator to hide it and preserve booking and payment records.'
    );
  }

  const deletedProperty = await Property.findOneAndDelete({
    _id: property._id,
    owner: property.owner,
    status: property.status,
    isApproved: property.isApproved,
  });
  if (!deletedProperty) {
    throw createPropertyLifecycleError(
      'The property changed while deletion was being processed. Refresh and try again.'
    );
  }

  return { property: sanitizeProperty(deletedProperty) };
}

export async function approveProperty(id, actor, payload = {}) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (actor.role !== 'ADMIN') {
    const error = new Error('Only admins can approve properties');
    error.status = 403;
    throw error;
  }

  const property = await Property.findById(id);
  if (!property) {
    const error = new Error('Property not found');
    error.status = 404;
    throw error;
  }

  const isApproved = Boolean(payload?.isApproved);
  const activeBooking = await Booking.exists({
    property: property._id,
    status: 'APPROVED',
  });
  if (activeBooking && Boolean(property.isApproved) !== isApproved) {
    throw createPropertyLifecycleError(
      'Property approval cannot be changed while an approved booking is active.'
    );
  }

  let status = property.status;
  if (isApproved && property.status === 'PENDING') {
    status = 'AVAILABLE';
  }
  if (!isApproved) {
    status = property.status === 'AVAILABLE' ? 'PENDING' : property.status;
  }
  if (status === 'AVAILABLE') {
    await assertPropertyCanBeMadeAvailable(property._id);
  }

  const updatedProperty = await Property.findOneAndUpdate(
    {
      _id: property._id,
      status: property.status,
      isApproved: property.isApproved,
    },
    {
      $set: {
        isApproved,
        approvedBy: isApproved ? actor.id : null,
        status,
      },
    },
    { new: true, runValidators: true }
  );
  if (!updatedProperty) {
    throw createPropertyLifecycleError(
      'The property changed while approval was being updated. Refresh and try again.'
    );
  }

  const populated = await Property.findById(updatedProperty._id).populate('owner', 'firstName lastName profileImage').lean();
  return { property: sanitizeProperty(populated, { includeExternalTenancies: true }) };
}

export async function updatePropertyStatus(id, actor, payload = {}) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (!['ADMIN', 'LANDLORD'].includes(actor.role)) {
    const error = new Error('Only landlords and admins can change property status');
    error.status = 403;
    throw error;
  }

  const property = await Property.findById(id);
  if (!property) {
    const error = new Error('Property not found');
    error.status = 404;
    throw error;
  }

  const isOwner = normalizeId(property.owner) === normalizeId(actor.id);
  if (actor.role === 'LANDLORD' && !isOwner) {
    const error = new Error('You may only change availability for your own properties');
    error.status = 403;
    throw error;
  }

  const validStatuses = actor.role === 'LANDLORD'
    ? ['AVAILABLE', 'OCCUPIED']
    : ['AVAILABLE', 'HIDDEN'];
  const newStatus = String(payload?.status || '').toUpperCase();
  if (!validStatuses.includes(newStatus)) {
    const error = new Error('Invalid property status');
    error.status = 400;
    throw error;
  }

  if (actor.role === 'LANDLORD' && !property.isApproved) {
    throw createPropertyLifecycleError('Landlords can change availability only for approved listings.');
  }

  if (newStatus === property.status && newStatus === 'HIDDEN') {
    throw createPropertyLifecycleError('The listing is already in that status.');
  }

  if (newStatus === 'OCCUPIED') {
    if (actor.role !== 'LANDLORD' || !['AVAILABLE', 'OCCUPIED'].includes(property.status)) {
      throw createPropertyLifecycleError('Only an available listing or an untracked occupied listing can record an external tenancy.');
    }
    if (activeExternalTenancy(property)) {
      throw createPropertyLifecycleError('This property already has an active external tenancy.');
    }
    const externalTenancy = validateExternalTenancy(payload.externalTenancy);
    externalLeaseTermEndsAt(externalTenancy);
    const activeBooking = await Booking.exists({ property: property._id, status: 'APPROVED' });
    if (activeBooking) {
      throw createPropertyLifecycleError('This property has an active confirmed booking. Manage that tenancy through its booking instead.');
    }

    const updatedProperty = await Property.findOneAndUpdate(
      { _id: property._id, owner: actor.id, isApproved: true, status: property.status },
      {
        $set: { status: 'OCCUPIED' },
        $push: {
          externalTenancies: {
            ...externalTenancy,
            recordedAt: new Date(),
            recordedBy: actor.id,
          },
        },
      },
      { new: true, runValidators: true }
    );
    if (!updatedProperty) {
      throw createPropertyLifecycleError(
        'The property changed while the external tenancy was being recorded. Refresh and try again.'
      );
    }

    const populated = await Property.findById(updatedProperty._id).populate('owner', 'firstName lastName profileImage').lean();
    return { property: sanitizeProperty(populated, { includeExternalTenancies: true }) };
  }

  if (newStatus === 'AVAILABLE') {
    if (actor.role === 'ADMIN' && !property.isApproved) {
      throw createPropertyLifecycleError('Only approved listings can be made available.');
    }

    const activeBooking = await Booking.exists({ property: property._id, status: 'APPROVED' });
    if (activeBooking) {
      throw createPropertyLifecycleError(
        'This property has an active confirmed booking. Complete or cancel that booking before marking it available.'
      );
    }

    const tenancy = activeExternalTenancy(property);
    if (tenancy && actor.role === 'LANDLORD') {
      if (payload.confirmVacant !== true) {
        throw createPropertyLifecycleError('Confirm that the external tenancy has ended and the property is vacant.');
      }
      if (Date.now() < externalLeaseTermEndsAt(tenancy).getTime()) {
        throw createPropertyLifecycleError('The recorded external lease term has not ended yet.');
      }
      const updatedProperty = await Property.findOneAndUpdate(
        {
          _id: property._id,
          owner: actor.id,
          isApproved: true,
          status: 'OCCUPIED',
          externalTenancies: {
            $elemMatch: {
              _id: tenancy._id,
              endedAt: null,
              moveInDate: tenancy.moveInDate,
              leaseMonths: tenancy.leaseMonths,
            },
          },
        },
        {
          $set: {
            status: 'AVAILABLE',
            availabilityConfirmedAt: new Date(),
            'externalTenancies.$.endedAt': new Date(),
            'externalTenancies.$.endedBy': actor.id,
          },
        },
        { new: true, runValidators: true }
      );
      if (!updatedProperty) {
        throw createPropertyLifecycleError(
          'The external tenancy changed while availability was being confirmed. Refresh and try again.'
        );
      }

      const populated = await Property.findById(updatedProperty._id).populate('owner', 'firstName lastName profileImage').lean();
      return { property: sanitizeProperty(populated, { includeExternalTenancies: true }) };
    }

    if (actor.role === 'LANDLORD') {
      throw createPropertyLifecycleError(
        'This listing has no active external tenancy to end. Complete its active HouseHunt tenancy instead.'
      );
    }
    if (activeExternalTenancy(property)) {
      throw createPropertyLifecycleError('An external tenancy is still active and cannot be bypassed by an admin status change.');
    }
    if (payload.confirmVacant !== true) {
      throw createPropertyLifecycleError('Admin availability corrections require explicit vacancy confirmation.');
    }
    await assertPropertyCanBeMadeAvailable(property._id);
  }

  const filter = {
    _id: property._id,
    status: property.status,
    ...(actor.role === 'LANDLORD' ? { owner: actor.id, isApproved: true } : {}),
  };
  const updates = { status: newStatus };
  const updatedProperty = await Property.findOneAndUpdate(
    filter,
    { $set: updates },
    { new: true, runValidators: true }
  );
  if (!updatedProperty) {
    throw createPropertyLifecycleError(
      'The property changed while its status was being updated. Refresh and try again.'
    );
  }

  const populated = await Property.findById(updatedProperty._id).populate('owner', 'firstName lastName profileImage').lean();
  return { property: sanitizeProperty(populated, { includeExternalTenancies: actor.role === 'ADMIN' }) };
}

export async function confirmPropertyAvailability(id, actor) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (actor.role !== 'LANDLORD') {
    const error = new Error('Only landlords can confirm listing availability');
    error.status = 403;
    throw error;
  }

  const property = await Property.findById(id);
  if (!property) {
    const error = new Error('Property not found');
    error.status = 404;
    throw error;
  }

  if (normalizeId(property.owner) !== normalizeId(actor.id)) {
    const error = new Error('You may only confirm availability for your own properties');
    error.status = 403;
    throw error;
  }

  if (!property.isApproved || property.status !== 'AVAILABLE') {
    throw createPropertyLifecycleError('Only approved available listings can be confirmed as available.');
  }

  if (activeExternalTenancy(property)) {
    throw createPropertyLifecycleError('An active external tenancy prevents confirming this listing as available.');
  }

  await assertPropertyCanBeMadeAvailable(property._id);
  const updatedProperty = await Property.findOneAndUpdate(
    {
      _id: property._id,
      owner: actor.id,
      isApproved: true,
      status: 'AVAILABLE',
    },
    { $set: { availabilityConfirmedAt: new Date() } },
    { new: true, runValidators: true }
  );
  if (!updatedProperty) {
    throw createPropertyLifecycleError(
      'The property changed while availability was being confirmed. Refresh and try again.'
    );
  }

  const populated = await Property.findById(updatedProperty._id).populate('owner', 'firstName lastName profileImage').lean();
  return { property: sanitizeProperty(populated) };
}

export async function featureProperty(id, actor, payload = {}) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (actor.role !== 'ADMIN') {
    const error = new Error('Only admins can feature properties');
    error.status = 403;
    throw error;
  }

  const property = await Property.findById(id);
  if (!property) {
    const error = new Error('Property not found');
    error.status = 404;
    throw error;
  }

  property.featured = Boolean(payload?.featured);
  await property.save();
  const populated = await Property.findById(property._id).populate('owner', 'firstName lastName profileImage').lean();
  return { property: sanitizeProperty(populated) };
}

function validUploadedMedia(item, actorId) {
  if (!item || typeof item.url !== 'string' || !['image', 'video'].includes(item.type)) return false;
  let url;
  try {
    url = new URL(item.url);
  } catch {
    return false;
  }
  const cloudName = globalThis.process?.env?.CLOUDINARY_CLOUD_NAME;
  return url.protocol === 'https:'
    && url.hostname === 'res.cloudinary.com'
    && cloudName
    && url.pathname.startsWith(`/${cloudName}/`)
    && typeof item.publicId === 'string'
    && item.publicId.startsWith(`househunt/properties/${actorId}/`);
}

function validatePropertyInput(payload = {}, actorId = '') {
  const errors = [];
  const data = payload || {};
  const allowedFields = ['title', 'description', 'price', 'propertyType', 'location', 'bedrooms', 'bathrooms', 'amenities', 'images', 'media', 'coverImage'];
  const updates = {};

  if (!Object.keys(data).length) {
    errors.push({ field: 'property', message: 'At least one property field is required' });
    return { success: false, errors };
  }

  for (const field of Object.keys(data)) {
    if (!allowedFields.includes(field)) {
      errors.push({ field, message: 'This field is not allowed' });
      continue;
    }

    if (field === 'title') {
      const value = typeof data[field] === 'string' ? data[field].trim() : '';
      if (!value) errors.push({ field, message: 'Title is required' });
      else updates.title = value;
      continue;
    }

    if (field === 'description') {
      const value = typeof data[field] === 'string' ? data[field].trim() : '';
      if (!value || value.length < 20) errors.push({ field, message: 'Description must be at least 20 characters' });
      else updates.description = value;
      continue;
    }

    if (field === 'price') {
      const value = Number(data[field]);
      if (!Number.isFinite(value) || value < 0) errors.push({ field, message: 'Price must be a positive number' });
      else updates.price = value;
      continue;
    }

    if (field === 'propertyType') {
      const validTypes = ['Apartment', 'Bedsitter', 'Single Room', 'Studio', 'Maisonette', 'Hostel', 'Office', 'Shop', 'Warehouse'];
      const value = String(data[field]);
      if (!validTypes.includes(value)) errors.push({ field, message: 'Invalid property type' });
      else updates.propertyType = value;
      continue;
    }

    if (field === 'location') {
      const location = { ...(data[field] || {}) };
      if (!location.county || !location.town) errors.push({ field: 'location', message: 'Location must include county and town' });
      else {
        const coordinates = location.coordinates?.coordinates;
        if (Array.isArray(coordinates) && coordinates.length === 0) delete location.coordinates;
        updates.location = location;
      }
      continue;
    }

    if (field === 'bedrooms' || field === 'bathrooms') {
      const value = Number(data[field]);
      if (!Number.isInteger(value) || value < 0) errors.push({ field, message: `${field} must be a non-negative integer` });
      else updates[field] = value;
      continue;
    }

    if (field === 'amenities') {
      updates.amenities = data[field];
      continue;
    }

    if (field === 'images') {
      if (!Array.isArray(data[field]) || data[field].length > 20) errors.push({ field, message: 'Images must be an array with at most 20 entries' });
      else updates.images = data[field];
      continue;
    }

    if (field === 'media') {
      const validMedia = Array.isArray(data[field])
        && data[field].length <= 20
        && data[field].every(item => validUploadedMedia(item, actorId));
      if (!validMedia) {
        errors.push({ field, message: 'Media must contain at most 20 valid uploaded image or video files' });
      } else {
        updates.media = data[field].map(item => ({
          url: item.url.trim(),
          type: item.type,
          publicId: item.publicId.trim(),
        }));
      }
      continue;
    }

    if (field === 'coverImage') {
      updates.coverImage = typeof data[field] === 'string' ? data[field].trim() : '';
      continue;
    }

  }

  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: updates };
}
