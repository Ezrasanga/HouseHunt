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

function serializeBooking(booking, includeTestData = false) {
  if (!booking) return null;
  const plain = booking.toObject ? booking.toObject() : booking;
  const serialized = {
    ...plain,
    id: normalizeId(plain.id || plain._id),
    tenant: plain.tenant && typeof plain.tenant === 'object' ? sanitizeUser(plain.tenant) : plain.tenant,
    landlord: plain.landlord && typeof plain.landlord === 'object' ? sanitizeUser(plain.landlord) : plain.landlord,
    property: plain.property && typeof plain.property === 'object' ? sanitizePropertySummary(plain.property) : plain.property,
  };
  if (!includeTestData) {
    delete serialized.isTestData;
    delete serialized.testDataMarkedAt;
    delete serialized.testDataMarkedBy;
  }
  return serialized;
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
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(100, limit) : 10,
  };
}

function createApprovalConflict(conflictingBooking) {
  const error = new Error('This property already has an approved booking.');
  error.status = 409;
  error.data = {
    conflictingBooking: {
      id: normalizeId(conflictingBooking.id || conflictingBooking._id),
      status: conflictingBooking.status,
    },
  };
  return error;
}

async function releasePropertyIfNoApprovedBookings(propertyId) {
  const activeApprovedBooking = await Booking.findOne({ property: propertyId, status: 'APPROVED' });
  if (activeApprovedBooking) return;

  await Property.updateOne(
    { _id: propertyId, status: 'OCCUPIED' },
    { $set: { status: 'AVAILABLE' } }
  );
}

function completionError(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
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
    bookings: bookings.map(booking => serializeBooking(booking)),
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

  if (normalizeId(booking.tenant) !== normalizeId(actor.id)) {
    const error = new Error('You do not have permission to cancel this booking');
    error.status = 403;
    throw error;
  }

  if (booking.status !== 'PENDING') {
    const error = new Error('This booking cannot be cancelled in its current state');
    error.status = 400;
    throw error;
  }

  const cancelledBooking = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      status: booking.status,
    },
    { $set: { status: 'CANCELLED' } },
    { new: true }
  );
  if (!cancelledBooking) {
    const error = new Error('The booking changed while cancellation was in progress. Refresh and try again.');
    error.status = 409;
    throw error;
  }

  return { booking: serializeBooking(cancelledBooking) };
}

export async function updateBookingCompletion(id, actor, action = 'REQUEST') {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }
  if (!['TENANT', 'LANDLORD'].includes(actor.role)) {
    const error = new Error('Only the tenant or landlord may update tenancy completion');
    error.status = 403;
    throw error;
  }

  const normalizedAction = String(action || '').toUpperCase();
  if (!['REQUEST', 'CONFIRM', 'WITHDRAW'].includes(normalizedAction)) {
    const error = new Error('Invalid completion action');
    error.status = 400;
    throw error;
  }

  let booking = await Booking.findById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.status = 404;
    throw error;
  }

  const isTenant = actor.role === 'TENANT' &&
    normalizeId(booking.tenant) === normalizeId(actor.id);
  const isLandlord = actor.role === 'LANDLORD' &&
    normalizeId(booking.landlord) === normalizeId(actor.id);
  if (!isTenant && !isLandlord) {
    const error = new Error('You do not have permission to update this tenancy');
    error.status = 403;
    throw error;
  }

  if (booking.status !== 'APPROVED') {
    if (booking.status === 'COMPLETED') {
      await releasePropertyIfNoApprovedBookings(booking.property);
      return { booking: serializeBooking(booking), completed: true };
    }
    throw completionError('Only an approved booking can be marked for completion.');
  }

  const requesterRole = booking.completionRequestedBy || null;
  if (normalizedAction === 'WITHDRAW') {
    if (requesterRole !== actor.role) {
      throw completionError('Only the party who requested completion can withdraw that request.');
    }
    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        status: 'APPROVED',
        completionRequestedBy: actor.role,
      },
      { $set: { completionRequestedBy: null, completionRequestedAt: null } },
      { new: true }
    );
    if (!updatedBooking) {
      throw completionError('The completion request changed. Refresh and try again.');
    }
    return { booking: serializeBooking(updatedBooking), completed: false };
  }

  if (normalizedAction === 'REQUEST') {
    if (requesterRole && requesterRole !== actor.role) {
      throw completionError('The other party has requested completion. Confirm or wait for them to withdraw the request.');
    }
    if (requesterRole === actor.role) {
      return { booking: serializeBooking(booking), completed: false };
    }
    const requestedBooking = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        status: 'APPROVED',
        completionRequestedBy: { $in: [null, ''] },
      },
      {
        $set: {
          completionRequestedBy: actor.role,
          completionRequestedAt: new Date(),
        },
      },
      { new: true }
    );
    if (requestedBooking) {
      return { booking: serializeBooking(requestedBooking), completed: false };
    }
    booking = await Booking.findById(id);
    if (booking?.status === 'APPROVED' && booking.completionRequestedBy === actor.role) {
      return { booking: serializeBooking(booking), completed: false };
    }
    throw completionError('The booking changed while completion was being requested. Refresh and try again.');
  }

  if (!requesterRole || requesterRole === actor.role) {
    throw completionError('The other party must request completion before you can confirm it.');
  }

  const completedBooking = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      status: 'APPROVED',
      completionRequestedBy: requesterRole,
    },
    {
      $set: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    },
    { new: true }
  );
  if (!completedBooking) {
    throw completionError('The booking changed while completion was being confirmed. Refresh and try again.');
  }

  await releasePropertyIfNoApprovedBookings(booking.property);
  return { booking: serializeBooking(completedBooking), completed: true };
}

export async function resolveBookingAvailability(id, actor) {
  if (!actor?.id || actor.role !== 'ADMIN') {
    const error = new Error('Only admins can resolve disputed booking availability');
    error.status = actor?.id ? 403 : 401;
    throw error;
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.status = 404;
    throw error;
  }
  if (booking.status !== 'APPROVED') {
    throw completionError('Only an active confirmed booking can be resolved.');
  }

  const resolvedBooking = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'APPROVED' },
    {
      $set: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completionRequestedBy: null,
        completionRequestedAt: null,
      },
    },
    { new: true }
  );
  if (!resolvedBooking) {
    throw completionError('The booking changed while availability was being resolved. Refresh and try again.');
  }

  await releasePropertyIfNoApprovedBookings(booking.property);
  return { booking: serializeBooking(resolvedBooking), completed: true };
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
    bookings: bookings.map(booking => serializeBooking(booking)),
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

  if (normalizeId(property.owner) !== normalizeId(actor.id)) {
    const error = new Error('You do not have permission to approve this booking');
    error.status = 403;
    throw error;
  }

  if (booking.status !== 'PENDING') {
    const error = new Error('Booking is not pending and cannot be approved');
    error.status = 400;
    throw error;
  }

  const conflictingBooking = await Booking.findOne({
    property: property._id,
    status: 'APPROVED',
    _id: { $ne: booking._id },
  });

  if (conflictingBooking) {
    throw createApprovalConflict(conflictingBooking);
  }

  if (!property.isApproved || property.status !== 'AVAILABLE') {
    const error = new Error('Property is not available for approval');
    error.status = 400;
    throw error;
  }

  const claimedProperty = await Property.findOneAndUpdate(
    { _id: property._id, owner: actor.id, isApproved: true, status: 'AVAILABLE' },
    { $set: { status: 'OCCUPIED' } },
    { new: true }
  );
  if (!claimedProperty) {
    const latestConflict = await Booking.findOne({
      property: property._id,
      status: 'APPROVED',
      _id: { $ne: booking._id },
    });
    if (latestConflict) throw createApprovalConflict(latestConflict);

    const error = new Error('Another booking may have just been approved for this property. Refresh the booking list and try again.');
    error.status = 409;
    throw error;
  }

  let approvedBooking;
  try {
    approvedBooking = await Booking.findOneAndUpdate(
      { _id: booking._id, status: 'PENDING' },
      {
        $set: {
          status: 'APPROVED',
        },
      },
      { new: true }
    );
  } catch (error) {
    await releasePropertyIfNoApprovedBookings(property._id);
    throw error;
  }

  if (!approvedBooking) {
    await releasePropertyIfNoApprovedBookings(property._id);
    const error = new Error('Booking is no longer pending and cannot be approved.');
    error.status = 409;
    throw error;
  }

  return { booking: serializeBooking(approvedBooking) };
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

  if (query.isTestData !== undefined) {
    if (!['true', 'false'].includes(String(query.isTestData).toLowerCase())) {
      const error = new Error('Invalid test-data filter');
      error.status = 400;
      throw error;
    }
    filter.isTestData = String(query.isTestData).toLowerCase() === 'true';
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
    bookings: bookings.map(booking => serializeBooking(booking, true)),
    pagination: buildPagination(page, limit, total),
  };
}

export async function markBookingAsTestData(id, actor) {
  if (!actor?.id || actor.role !== 'ADMIN') {
    const error = new Error('Only admins can mark test bookings');
    error.status = actor?.id ? 403 : 401;
    throw error;
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.status = 404;
    throw error;
  }

  if (!['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(booking.status)) {
    const error = new Error('Only non-completed bookings can be marked as test data.');
    error.status = 409;
    throw error;
  }

  const updatedBooking = await Booking.findOneAndUpdate(
    { _id: booking._id, status: booking.status },
    {
      $set: {
        isTestData: true,
        testDataMarkedAt: new Date(),
        testDataMarkedBy: actor.id,
      },
    },
    { new: true }
  );
  if (!updatedBooking) {
    const error = new Error('Booking changed while it was being marked as test data. Refresh and try again.');
    error.status = 409;
    throw error;
  }
  return { booking: serializeBooking(updatedBooking, true) };
}

export async function closeTestBooking(id, actor) {
  if (!actor?.id || actor.role !== 'ADMIN') {
    const error = new Error('Only admins can close test bookings');
    error.status = actor?.id ? 403 : 401;
    throw error;
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.status = 404;
    throw error;
  }
  if (!booking.isTestData) {
    const error = new Error('This booking has not been explicitly marked as test data.');
    error.status = 409;
    throw error;
  }
  if (booking.status === 'COMPLETED') {
    const error = new Error('A completed booking cannot be closed.');
    error.status = 409;
    throw error;
  }
  if (!['PENDING', 'APPROVED'].includes(booking.status)) {
    const error = new Error('This test booking is already closed.');
    error.status = 409;
    throw error;
  }

  const wasApproved = booking.status === 'APPROVED';
  const closedBooking = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      isTestData: true,
      status: booking.status,
    },
    { $set: { status: 'CANCELLED' } },
    { new: true }
  );
  if (!closedBooking) {
    const error = new Error('Booking changed while cleanup was in progress. Refresh and try again.');
    error.status = 409;
    throw error;
  }

  if (wasApproved) await releasePropertyIfNoApprovedBookings(booking.property);
  return { booking: serializeBooking(closedBooking, true) };
}
