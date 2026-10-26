import * as availabilityReportService from '../services/availabilityReportService.js';
import { recordAuditEvent } from '../services/auditLogService.js';

function sendResponse(res, statusCode, success, message, data = null, errors = []) {
  return res.status(statusCode).json({ success, message, data, errors });
}

function handleError(res, error) {
  return sendResponse(
    res,
    error?.status || 500,
    false,
    error?.message || 'Internal Server Error',
    null,
    []
  );
}

export async function create(req, res) {
  try {
    const result = await availabilityReportService.createAvailabilityReport(
      req.params.propertyId,
      req.user,
      req.body
    );
    await recordAuditEvent({
      actor: req.user,
      action: 'Availability report submitted',
      description: 'A tenant reported a listing as potentially unavailable',
      resourceType: 'availability-report',
      resourceId: result.report.id,
    });
    return sendResponse(res, 201, true, 'Availability report submitted for review', result, []);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function list(req, res) {
  try {
    const result = await availabilityReportService.listAvailabilityReports(req.user, req.query);
    return sendResponse(res, 200, true, 'Availability reports fetched successfully', result, []);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function review(req, res) {
  try {
    const result = await availabilityReportService.reviewAvailabilityReport(
      req.params.id,
      req.user,
      req.body
    );
    await recordAuditEvent({
      actor: req.user,
      action: 'Availability report reviewed',
      description: `Availability report ${String(req.body?.status || '').toLowerCase()}`,
      resourceType: 'availability-report',
      resourceId: req.params.id,
    });
    return sendResponse(res, 200, true, 'Availability report reviewed successfully', result, []);
  } catch (error) {
    return handleError(res, error);
  }
}
