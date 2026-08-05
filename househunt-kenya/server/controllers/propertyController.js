import * as propertyService from '../services/propertyService.js';

function sendResponse(res, statusCode, success, message, data = null, errors = []) {
  return res.status(statusCode).json({ success, message, data, errors });
}

function handleError(res, err) {
  if (err?.errors) {
    return sendResponse(res, err.status || 400, false, err.message || 'Request failed', null, err.errors);
  }

  return sendResponse(res, err?.status || 500, false, err?.message || 'Internal Server Error', null, []);
}

export async function list(req, res) {
  try {
    const result = await propertyService.listProperties(req.query, req.user);
    return sendResponse(res, 200, true, 'Properties fetched successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function get(req, res) {
  try {
    const result = await propertyService.getProperty(req.params.id, req.user);
    return sendResponse(res, 200, true, 'Property fetched successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function create(req, res) {
  try {
    const result = await propertyService.createProperty(req.user, req.body);
    return sendResponse(res, 201, true, 'Property created successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function update(req, res) {
  try {
    const result = await propertyService.updateProperty(req.params.id, req.user, req.body);
    return sendResponse(res, 200, true, 'Property updated successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function remove(req, res) {
  try {
    const result = await propertyService.deleteProperty(req.params.id, req.user);
    return sendResponse(res, 200, true, 'Property deleted successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function approve(req, res) {
  try {
    const result = await propertyService.approveProperty(req.params.id, req.user, req.body);
    return sendResponse(res, 200, true, 'Property approval updated successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function updateStatus(req, res) {
  try {
    const result = await propertyService.updatePropertyStatus(req.params.id, req.user, req.body);
    return sendResponse(res, 200, true, 'Property status updated successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function feature(req, res) {
  try {
    const result = await propertyService.featureProperty(req.params.id, req.user, req.body);
    return sendResponse(res, 200, true, 'Property featured state updated successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}
