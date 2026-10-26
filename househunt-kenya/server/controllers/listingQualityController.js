import * as listingQualityService from '../services/listingQualityService.js';
import { recordAuditEvent } from '../services/auditLogService.js';

function sendResponse(res, statusCode, success, message, data = null, errors = []) {
  return res.status(statusCode).json({ success, message, data, errors });
}

function handleError(res, error) {
  return sendResponse(res, error?.status || 500, false, error?.message || 'Internal Server Error', null, []);
}

export async function list(req, res) {
  try {
    const result = await listingQualityService.listListingQualityReviews(req.user, req.query);
    return sendResponse(res, 200, true, 'Listing quality review queue fetched successfully', result, []);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function dismiss(req, res) {
  try {
    const result = await listingQualityService.dismissListingQualityReview(req.params.id, req.user);
    await recordAuditEvent({
      actor: req.user,
      action: 'Listing quality flag dismissed',
      description: 'Dismissed listing quality review signals',
      resourceType: 'property',
      resourceId: req.params.id,
    });
    return sendResponse(res, 200, true, 'Listing quality flags dismissed', result, []);
  } catch (error) {
    return handleError(res, error);
  }
}
