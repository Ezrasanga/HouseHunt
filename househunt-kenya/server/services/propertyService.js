import Property from '../models/Property.js';
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

  if (query.county) filter['location.county'] = new RegExp(String(query.county), 'i');
  if (query.town) filter['location.town'] = new RegExp(String(query.town), 'i');
  if (query.estate) filter['location.estate'] = new RegExp(String(query.estate), 'i');
  if (query.propertyType) filter.propertyType = String(query.propertyType);
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
    const searchRegex = new RegExp(String(query.search), 'i');
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
  const page = Math.max(1, parseInt(query.page, 10) || 1);
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

  const [properties, total] = await Promise.all([
    Property.find(filter)
      .populate('owner', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
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

  Object.assign(property, validation.data);

  if (!isAdmin && property.isApproved) {
    property.isApproved = false;
    property.approvedBy = null;
    property.status = 'PENDING';
  }

  await property.save();
  const populated = await Property.findById(property._id).populate('owner', 'firstName lastName profileImage').lean();
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

  await property.deleteOne();
  return { property: sanitizeProperty(property) };
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
  property.isApproved = isApproved;
  property.approvedBy = isApproved ? actor.id : null;
  if (isApproved && property.status === 'PENDING') {
    property.status = 'AVAILABLE';
  }
  if (!isApproved) {
    property.status = property.status === 'AVAILABLE' ? 'PENDING' : property.status;
  }

  await property.save();
  const populated = await Property.findById(property._id).populate('owner', 'firstName lastName profileImage').lean();
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

  property.status = newStatus;
  await property.save();
  const populated = await Property.findById(property._id).populate('owner', 'firstName lastName profileImage').lean();
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
      const location = data[field] || {};
      if (!location.county || !location.town) errors.push({ field: 'location', message: 'Location must include county and town' });
      else updates.location = location;
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
