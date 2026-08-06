import * as bookingService from '../services/bookingService.js';

function sendResponse(res, statusCode, success, message, data = null, errors = []) {
  return res.status(statusCode).json({ success, message, data, errors });
}

function handleError(res, err) {
  if (err?.errors) {
    return sendResponse(res, err.status || 400, false, err.message || 'Request failed', null, err.errors);
  }

  return sendResponse(res, err?.status || 500, false, err?.message || 'Internal Server Error', null, []);
}

export async function create(req, res) {
  try {
    const result = await bookingService.createBooking(req.user, req.body);
    return sendResponse(res, 201, true, 'Booking created successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function list(req, res) {
  try {
    const result = await bookingService.listTenantBookings(req.user, req.query);
    return sendResponse(res, 200, true, 'Bookings fetched successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function get(req, res) {
  try {
    const result = await bookingService.getBooking(req.params.id, req.user);
    return sendResponse(res, 200, true, 'Booking fetched successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function cancel(req, res) {
  try {
    const result = await bookingService.cancelBooking(req.params.id, req.user);
    return sendResponse(res, 200, true, 'Booking cancelled successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function listLandlord(req, res) {
  try {
    const result = await bookingService.listLandlordBookings(req.user, req.query);
    return sendResponse(res, 200, true, 'Landlord bookings fetched successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function approve(req, res) {
  try {
    const result = await bookingService.approveBooking(req.params.id, req.user);
    return sendResponse(res, 200, true, 'Booking approved successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function reject(req, res) {
  try {
    const result = await bookingService.rejectBooking(req.params.id, req.user);
    return sendResponse(res, 200, true, 'Booking rejected successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function listAdmin(req, res) {
  try {
    const result = await bookingService.listAdminBookings(req.user, req.query);
    return sendResponse(res, 200, true, 'Admin bookings fetched successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}
