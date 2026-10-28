import * as bookingService from '../services/bookingService.js';
import { recordAuditEvent } from '../services/auditLogService.js';

function sendResponse(res, statusCode, success, message, data = null, errors = []) {
  return res.status(statusCode).json({ success, message, data, errors });
}

function handleError(res, err) {
  if (err?.errors) {
    return sendResponse(res, err.status || 400, false, err.message || 'Request failed', err.data || null, err.errors);
  }

  return sendResponse(res, err?.status || 500, false, err?.message || 'Internal Server Error', err?.data || null, []);
}

export async function create(req, res) {
  try {
    const result = await bookingService.createBooking(req.user, req.body);
    await recordAuditEvent({
      actor: req.user,
      action: 'Booking requested',
      description: 'Tenant submitted a booking request',
      resourceType: 'booking',
      resourceId: result.booking?.id,
    });
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
    await recordAuditEvent({
      actor: req.user,
      action: 'Booking cancelled',
      description: 'Tenant cancelled a pending booking request',
      resourceType: 'booking',
      resourceId: req.params.id,
    });
    return sendResponse(res, 200, true, 'Booking cancelled successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function updateCompletion(req, res) {
  try {
    const result = await bookingService.updateBookingCompletion(
      req.params.id,
      req.user,
      req.body?.action
    );
    const action = String(req.body?.action || 'REQUEST').toUpperCase();
    await recordAuditEvent({
      actor: req.user,
      action: result.completed
        ? 'Tenancy completion confirmed'
        : action === 'WITHDRAW'
          ? 'Tenancy completion request withdrawn'
          : action === 'CONFIRM'
            ? 'Tenancy completion updated'
            : 'Tenancy completion requested',
      description: result.completed
        ? 'Both parties confirmed booking completion and the property was released when no active booking remained'
        : `Tenancy completion action recorded: ${action}`,
      resourceType: 'booking',
      resourceId: req.params.id,
    });
    return sendResponse(
      res,
      200,
      true,
      result.completed ? 'Tenancy completed successfully' : 'Tenancy completion request updated',
      result,
      []
    );
  } catch (err) {
    return handleError(res, err);
  }
}

export async function updateEarlyTermination(req, res) {
  try {
    const result = await bookingService.updateEarlyTermination(
      req.params.id,
      req.user,
      req.body?.action,
      req.body?.reason
    );
    const action = String(req.body?.action || '').toUpperCase();
    await recordAuditEvent({
      actor: req.user,
      action: `Early termination ${action.toLowerCase()}`,
      description: action === 'REQUEST'
        ? `Landlord requested early termination: ${String(req.body?.reason || '').trim().slice(0, 120)}`
        : `Early termination response recorded: ${action}`,
      resourceType: 'booking',
      resourceId: req.params.id,
    });
    return sendResponse(
      res,
      200,
      true,
      result.completed ? 'Tenancy ended by mutual agreement' : 'Early termination request updated',
      result,
      []
    );
  } catch (err) {
    return handleError(res, err);
  }
}

export async function resolveEarlyTermination(req, res) {
  try {
    const result = await bookingService.resolveEarlyTermination(
      req.params.id,
      req.user,
      req.body?.resolution,
      req.body?.note
    );
    await recordAuditEvent({
      actor: req.user,
      action: 'Disputed early termination resolved',
      description: `Admin resolved the disputed termination as ${String(req.body?.resolution || '').toUpperCase()}`,
      resourceType: 'booking',
      resourceId: req.params.id,
    });
    return sendResponse(res, 200, true, 'Disputed early termination resolved', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function resolveAvailability(req, res) {
  try {
    const result = await bookingService.resolveBookingAvailability(req.params.id, req.user);
    await recordAuditEvent({
      actor: req.user,
      action: 'Booking availability resolved',
      description: 'Admin completed a disputed booking and released the property when no other active booking remained',
      resourceType: 'booking',
      resourceId: req.params.id,
    });
    return sendResponse(res, 200, true, 'Booking availability resolved successfully', result, []);
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
    await recordAuditEvent({
      actor: req.user,
      action: 'Booking approved',
      description: 'Landlord confirmed a rental arrangement and marked the property taken',
      resourceType: 'booking',
      resourceId: req.params.id,
    });
    return sendResponse(res, 200, true, 'Booking approved successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function reject(req, res) {
  try {
    const result = await bookingService.rejectBooking(req.params.id, req.user);
    await recordAuditEvent({
      actor: req.user,
      action: 'Booking rejected',
      description: 'Landlord rejected a booking request',
      resourceType: 'booking',
      resourceId: req.params.id,
    });
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

export async function markTestData(req, res) {
  try {
    const result = await bookingService.markBookingAsTestData(req.params.id, req.user);
    await recordAuditEvent({
      actor: req.user,
      action: 'Test booking marked',
      description: 'Admin explicitly marked a booking as test data',
      resourceType: 'booking',
      resourceId: req.params.id,
    });
    return sendResponse(res, 200, true, 'Booking marked as test data', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function closeTest(req, res) {
  try {
    const result = await bookingService.closeTestBooking(req.params.id, req.user);
    await recordAuditEvent({
      actor: req.user,
      action: 'Test booking closed',
      description: 'Admin closed an explicitly marked test booking',
      resourceType: 'booking',
      resourceId: req.params.id,
    });
    return sendResponse(res, 200, true, 'Test booking closed', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}
