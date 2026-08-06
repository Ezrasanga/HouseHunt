import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Property from '../models/Property.js';

function normalizeId(value) {
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

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: normalizeId(user.id || user._id),
    firstName: user.firstName,
    lastName: user.lastName,
    profileImage: user.profileImage || '',
    role: user.role,
  };
}

function sanitizePropertySummary(property) {
  if (!property) return null;
  return {
    id: normalizeId(property.id || property._id),
    title: property.title,
    price: property.price,
    propertyType: property.propertyType,
    location: property.location,
    status: property.status,
    isApproved: property.isApproved,
    coverImage: property.coverImage || '',
  };
}

function serializeBooking(booking) {
  if (!booking) return null;
  const plain = booking.toObject ? booking.toObject() : booking;
  return {
    ...plain,
    id: normalizeId(plain.id || plain._id),
    tenant: plain.tenant && typeof plain.tenant === 'object' ? sanitizeUser(plain.tenant) : plain.tenant,
    landlord: plain.landlord && typeof plain.landlord === 'object' ? sanitizeUser(plain.landlord) : plain.landlord,
    property: plain.property && typeof plain.property === 'object' ? sanitizePropertySummary(plain.property) : plain.property,
  };
}

function validateBookingPayload(payload = {}) {
  const errors = [];
  const data = payload || {};

  if (!data.propertyId) {
    errors.push({ field: 'propertyId', message: 'Property ID is required' });
  }

  if (!data.moveInDate) {
    errors.push({ field: 'moveInDate', message: 'Move-in date is required' });
  }

  if (data.leaseMonths === undefined || data.leaseMonths === null || data.leaseMonths === '') {
    errors.push({ field: 'leaseMonths', message: 'Lease duration is required' });
  }

  if (data.propertyId && !mongoose.Types.ObjectId.isValid(String(data.propertyId))) {
    errors.push({ field: 'propertyId', message: 'Property ID is invalid' });
  }

  if (data.moveInDate) {
    const parsedDate = new Date(data.moveInDate);
    if (Number.isNaN(parsedDate.getTime())) {
      errors.push({ field: 'moveInDate', message: 'Move-in date is invalid' });
    }
  }

  if (data.leaseMonths !== undefined && data.leaseMonths !== null && data.leaseMonths !== '') {
    const parsedMonths = Number(data.leaseMonths);
    if (!Number.isInteger(parsedMonths) || parsedMonths < 1) {
      errors.push({ field: 'leaseMonths', message: 'Lease duration must be at least 1 month' });
    }
  }

  return { success: errors.length === 0, errors };
}

function parsePagination(query = {}) {
  const page = Number.parseInt(String(query.page || '1'), 10);
  const limit = Number.parseInt(String(query.limit || '10'), 10);
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 10,
  };
}

export async function createBooking(actor, payload = {}) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (actor.role !== 'TENANT') {
    const error = new Error('Only tenants can create bookings');
    error.status = 403;
    throw error;
  }

  const validation = validateBookingPayload(payload);
  if (!validation.success) {
    const error = new Error('Validation failed');
    error.status = 400;
    error.errors = validation.errors;
    throw error;
  }

  const property = await Property.findById(payload.propertyId);
  if (!property) {
    const error = new Error('Property not found');
    error.status = 404;
    throw error;
  }

  if (!property.isApproved) {
    const error = new Error('Property is not approved yet');
    error.status = 400;
    throw error;
  }

  if (property.status !== 'AVAILABLE') {
    const error = new Error('Property is not available for booking');
    error.status = 400;
    throw error;
  }

  const activeBooking = await Booking.findOne({
    tenant: actor.id,
    property: property._id,
    status: { $in: ['PENDING', 'APPROVED'] },
  });

  if (activeBooking) {
    const error = new Error('You already have an active booking for this property');
    error.status = 409;
    throw error;
  }

  const landlordId = normalizeId(property.owner);
  if (!landlordId) {
    const error = new Error('Property owner is missing');
    error.status = 400;
    throw error;
  }

  const booking = await Booking.create({
    tenant: actor.id,
    property: property._id,
    landlord: landlordId,
    moveInDate: new Date(payload.moveInDate),
    leaseMonths: Number(payload.leaseMonths),
    notes: typeof payload.notes === 'string' ? payload.notes.trim() : '',
    status: 'PENDING',
    paymentStatus: 'UNPAID',
  });

  return { booking: serializeBooking(booking) };
}

export async function listTenantBookings(actor, query = {}) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (actor.role !== 'TENANT') {
    const error = new Error('Only tenants can access their own bookings');
    error.status = 403;
    throw error;
  }

  const filter = { tenant: actor.id };
  const { page, limit } = parsePagination(query);

  if (query.status) {
    const normalizedStatus = String(query.status).toUpperCase();
    if (!['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'].includes(normalizedStatus)) {
      const error = new Error('Invalid booking status');
      error.status = 400;
      throw error;
    }
    filter.status = normalizedStatus;
  }

  if (query.paymentStatus) {
    const normalizedPaymentStatus = String(query.paymentStatus).toUpperCase();
    if (!['UNPAID', 'PARTIAL', 'PAID'].includes(normalizedPaymentStatus)) {
      const error = new Error('Invalid payment status');
      error.status = 400;
      throw error;
    }
    filter.paymentStatus = normalizedPaymentStatus;
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('property', 'title price propertyType location status isApproved coverImage')
      .populate('landlord', 'firstName lastName profileImage role')
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return {
    bookings: bookings.map(serializeBooking),
    pagination: buildPagination(page, limit, total),
  };
}

export async function getBooking(id, actor) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  const booking = await Booking.findById(id)
    .populate('tenant', 'firstName lastName profileImage role')
    .populate('property', 'title price propertyType location status isApproved coverImage owner')
    .populate('landlord', 'firstName lastName profileImage role');

  if (!booking) {
    const error = new Error('Booking not found');
    error.status = 404;
    throw error;
  }

  if (actor.role === 'TENANT') {
    if (normalizeId(booking.tenant?._id || booking.tenant) !== actor.id) {
      const error = new Error('You do not have permission to access this booking');
      error.status = 403;
      throw error;
    }
  } else if (actor.role === 'LANDLORD') {
    const property = await Property.findById(booking.property?._id || booking.property).lean();
    if (!property || normalizeId(property.owner) !== actor.id) {
      const error = new Error('You do not have permission to access this booking');
      error.status = 403;
      throw error;
    }
  } else if (actor.role !== 'ADMIN') {
    const error = new Error('You do not have permission to access this booking');
    error.status = 403;
    throw error;
  }

  return { booking: serializeBooking(booking) };
}

export async function cancelBooking(id, actor) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (actor.role !== 'TENANT') {
    const error = new Error('Only tenants can cancel bookings');
    error.status = 403;
    throw error;
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.status = 404;
    throw error;
  }

  if (normalizeId(booking.tenant) !== actor.id) {
    const error = new Error('You do not have permission to cancel this booking');
    error.status = 403;
    throw error;
  }

  if (['CANCELLED', 'COMPLETED', 'REJECTED'].includes(booking.status)) {
    const error = new Error('This booking cannot be cancelled in its current state');
    error.status = 400;
    throw error;
  }

  booking.status = 'CANCELLED';
  await booking.save();

  return { booking: serializeBooking(booking) };
}

export async function listLandlordBookings(actor, query = {}) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (actor.role !== 'LANDLORD') {
    const error = new Error('Only landlords can access landlord bookings');
    error.status = 403;
    throw error;
  }

  const ownedPropertyIds = await Property.find({ owner: actor.id }).distinct('_id');
  const filter = { property: { $in: ownedPropertyIds } };
  const { page, limit } = parsePagination(query);

  if (query.status) {
    const normalizedStatus = String(query.status).toUpperCase();
    if (!['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'].includes(normalizedStatus)) {
      const error = new Error('Invalid booking status');
      error.status = 400;
      throw error;
    }
    filter.status = normalizedStatus;
  }

  if (query.paymentStatus) {
    const normalizedPaymentStatus = String(query.paymentStatus).toUpperCase();
    if (!['UNPAID', 'PARTIAL', 'PAID'].includes(normalizedPaymentStatus)) {
      const error = new Error('Invalid payment status');
      error.status = 400;
      throw error;
    }
    filter.paymentStatus = normalizedPaymentStatus;
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('tenant', 'firstName lastName profileImage role')
      .populate('property', 'title price propertyType location status isApproved coverImage owner')
      .populate('landlord', 'firstName lastName profileImage role')
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return {
    bookings: bookings.map(serializeBooking),
    pagination: buildPagination(page, limit, total),
  };
}

export async function approveBooking(id, actor) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (actor.role !== 'LANDLORD') {
    const error = new Error('Only landlords can approve bookings');
    error.status = 403;
    throw error;
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.status = 404;
    throw error;
  }

  const property = await Property.findById(booking.property);
  if (!property) {
    const error = new Error('Property not found');
    error.status = 404;
    throw error;
  }

  if (normalizeId(property.owner) !== actor.id) {
    const error = new Error('You do not have permission to approve this booking');
    error.status = 403;
    throw error;
  }

  if (booking.status !== 'PENDING') {
    const error = new Error('Booking is not pending and cannot be approved');
    error.status = 400;
    throw error;
  }

  if (!property.isApproved || property.status !== 'AVAILABLE') {
    const error = new Error('Property is not available for approval');
    error.status = 400;
    throw error;
  }

  const conflictingBooking = await Booking.findOne({
    property: property._id,
    status: 'APPROVED',
    _id: { $ne: booking._id },
  });

  if (conflictingBooking) {
    const error = new Error('Another approved booking already exists for this property');
    error.status = 409;
    throw error;
  }

  booking.status = 'APPROVED';
  await booking.save();

  property.status = 'OCCUPIED';
  await property.save();

  return { booking: serializeBooking(booking) };
}

export async function rejectBooking(id, actor) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (actor.role !== 'LANDLORD') {
    const error = new Error('Only landlords can reject bookings');
    error.status = 403;
    throw error;
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.status = 404;
    throw error;
  }

  const property = await Property.findById(booking.property);
  if (!property) {
    const error = new Error('Property not found');
    error.status = 404;
    throw error;
  }

  if (normalizeId(property.owner) !== actor.id) {
    const error = new Error('You do not have permission to reject this booking');
    error.status = 403;
    throw error;
  }

  if (booking.status !== 'PENDING') {
    const error = new Error('Booking is not pending and cannot be rejected');
    error.status = 400;
    throw error;
  }

  booking.status = 'REJECTED';
  await booking.save();

  return { booking: serializeBooking(booking) };
}

export async function listAdminBookings(actor, query = {}) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }

  if (actor.role !== 'ADMIN') {
    const error = new Error('Only admins can access all bookings');
    error.status = 403;
    throw error;
  }

  const filter = {};
  const { page, limit } = parsePagination(query);

  if (query.status) {
    const normalizedStatus = String(query.status).toUpperCase();
    if (!['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'].includes(normalizedStatus)) {
      const error = new Error('Invalid booking status');
      error.status = 400;
      throw error;
    }
    filter.status = normalizedStatus;
  }

  if (query.paymentStatus) {
    const normalizedPaymentStatus = String(query.paymentStatus).toUpperCase();
    if (!['UNPAID', 'PARTIAL', 'PAID'].includes(normalizedPaymentStatus)) {
      const error = new Error('Invalid payment status');
      error.status = 400;
      throw error;
    }
    filter.paymentStatus = normalizedPaymentStatus;
  }

  if (query.property) {
    if (!mongoose.Types.ObjectId.isValid(String(query.property))) {
      const error = new Error('Invalid property ID');
      error.status = 400;
      throw error;
    }
    filter.property = query.property;
  }

  if (query.tenant) {
    if (!mongoose.Types.ObjectId.isValid(String(query.tenant))) {
      const error = new Error('Invalid tenant ID');
      error.status = 400;
      throw error;
    }
    filter.tenant = query.tenant;
  }

  if (query.landlord) {
    if (!mongoose.Types.ObjectId.isValid(String(query.landlord))) {
      const error = new Error('Invalid landlord ID');
      error.status = 400;
      throw error;
    }
    filter.landlord = query.landlord;
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('tenant', 'firstName lastName profileImage role')
      .populate('property', 'title price propertyType location status isApproved coverImage owner')
      .populate('landlord', 'firstName lastName profileImage role')
      .lean(),
    Booking.countDocuments(filter),
  ]);

  return {
    bookings: bookings.map(serializeBooking),
    pagination: buildPagination(page, limit, total),
  };
}
