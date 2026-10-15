import Property from '../models/Property.js';
import Booking from '../models/Booking.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';

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

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: normalizeId(user.id || user._id),
    firstName: user.firstName,
    lastName: user.lastName,
    profileImage: user.profileImage || '',
  };
}

function sanitizeProperty(property) {
  if (!property) return null;
  const plain = property.toObject ? property.toObject() : property;
  return {
    ...plain,
    owner: plain.owner && typeof plain.owner === 'object' ? sanitizeUser(plain.owner) : plain.owner,
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

async function assertPropertyCanBeMadeAvailable(propertyId) {
  const activeBooking = await Booking.exists({
    property: propertyId,
    status: 'APPROVED',
  });
  if (activeBooking) {
    throw createPropertyLifecycleError(
      'This property has an approved booking and cannot be marked available until that booking is completed or cancelled.'
    );
  }

  const paidBooking = await Booking.exists({
    property: propertyId,
    status: { $ne: 'COMPLETED' },
    $or: [
      { paymentStatus: { $in: ['PAID', 'PARTIAL'] } },
      { amountPaid: { $gt: 0 } },
    ],
  });
  if (paidBooking) {
    throw createPropertyLifecycleError(
      'This property has a paid booking and cannot be marked available until that booking is completed.'
    );
  }

  const bookingIds = await Booking.distinct('_id', {
    property: propertyId,
    status: { $ne: 'COMPLETED' },
  });
  if (!bookingIds.length) return;

  const unresolvedPayment = await Payment.exists({
    booking: { $in: bookingIds },
    status: { $in: ['PENDING', 'SUCCESS'] },
  });
  if (unresolvedPayment) {
    throw createPropertyLifecycleError(
      'This property has a pending or successful payment and cannot be marked available until its booking is resolved.'
    );
  }
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
  }

  const [properties, total] = await Promise.all([
    Property.find(filter)
      .populate('owner', 'firstName lastName profileImage')
      .sort(isAdmin || isLandlord ? { createdAt: -1 } : { featured: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Property.countDocuments(filter),
  ]);

  return {
    properties: properties.map(sanitizeProperty),
    pagination: buildPagination(page, limit, total),
  };
}

export async function getProperty(id, viewer = null) {
  if (!id) {
    const error = new Error('Property ID is required');
    error.status = 400;
    throw error;
  }

  const property = await Property.findById(id).populate('owner', 'firstName lastName profileImage').lean();
  if (!property) {
    const error = new Error('Property not found');
    error.status = 404;
    throw error;
  }

  const ownerId = normalizeId(property.owner);
  const viewerId = normalizeId(viewer?.id);
  const isOwner = Boolean(viewerId && ownerId && ownerId === viewerId);
  const isAdmin = viewer?.role === 'ADMIN';
  const canView = isAdmin || isOwner || (property.isApproved && property.status !== 'HIDDEN');

  if (!canView) {
    const error = new Error('You do not have permission to view this property');
    error.status = 403;
    throw error;
  }

  if (!isOwner && !isAdmin && property.isApproved) {
    await Property.findByIdAndUpdate(id, { $inc: { views: 1 } });
  }

  return { property: sanitizeProperty(property) };
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

  const validation = validatePropertyInput(payload);
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

  const validation = validatePropertyInput(payload);
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
  return { property: sanitizeProperty(populated) };
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
  return { property: sanitizeProperty(populated) };
}

export async function updatePropertyStatus(id, actor, payload = {}) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (actor.role !== 'ADMIN') {
    const error = new Error('Only admins can change property status');
    error.status = 403;
    throw error;
  }

  const property = await Property.findById(id);
  if (!property) {
    const error = new Error('Property not found');
    error.status = 404;
    throw error;
  }

  const validStatuses = ['AVAILABLE', 'OCCUPIED', 'PENDING', 'HIDDEN'];
  const newStatus = String(payload?.status || '').toUpperCase();
  if (!validStatuses.includes(newStatus)) {
    const error = new Error('Invalid property status');
    error.status = 400;
    throw error;
  }

  if (newStatus === 'AVAILABLE') {
    await assertPropertyCanBeMadeAvailable(property._id);
  }

  const updatedProperty = await Property.findOneAndUpdate(
    { _id: property._id, status: property.status },
    { $set: { status: newStatus } },
    { new: true, runValidators: true }
  );
  if (!updatedProperty) {
    throw createPropertyLifecycleError(
      'The property changed while its status was being updated. Refresh and try again.'
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

function validatePropertyInput(payload = {}) {
  const errors = [];
  const data = payload || {};
  const allowedFields = ['title', 'description', 'price', 'propertyType', 'location', 'bedrooms', 'bathrooms', 'amenities', 'images', 'coverImage'];
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

    if (field === 'coverImage') {
      updates.coverImage = typeof data[field] === 'string' ? data[field].trim() : '';
      continue;
    }

  }

  if (errors.length > 0) return { success: false, errors };
  return { success: true, data: updates };
}
