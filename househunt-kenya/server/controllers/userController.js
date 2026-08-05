import * as userService from '../services/userService.js';

function sendResponse(res, statusCode, success, message, data = null, errors = []) {
  return res.status(statusCode).json({
    success,
    message,
    data,
    errors,
  });
}

function handleError(res, err) {
  if (err?.errors) {
    return sendResponse(res, err.status || 400, false, err.message || 'Request failed', null, err.errors);
  }

  return sendResponse(res, err?.status || 500, false, err?.message || 'Internal Server Error', null, []);
}

export async function list(req, res) {
  try {
    const result = await userService.listUsers(req.query);
    return sendResponse(res, 200, true, 'Users fetched successfully', result, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function get(req, res) {
  try {
    const result = await userService.getUser(req.params.id);
    return sendResponse(res, 200, true, 'User fetched successfully', { user: result }, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function getProfile(req, res) {
  try {
    const result = await userService.getProfile(req.user?.id);
    return sendResponse(res, 200, true, 'Profile fetched successfully', { user: result }, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function updateProfile(req, res) {
  try {
    const result = await userService.updateProfile(req.user?.id, req.body);
    return sendResponse(res, 200, true, 'Profile updated successfully', { user: result }, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function changePassword(req, res) {
  try {
    const result = await userService.changePassword(req.user?.id, req.body);
    return sendResponse(res, 200, true, 'Password changed successfully', { user: result }, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function updateStatus(req, res) {
  try {
    const result = await userService.updateUserStatus(req.params.id, req.body, req.user?.id);
    return sendResponse(res, 200, true, 'User status updated successfully', { user: result }, []);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function remove(req, res) {
  try {
    const result = await userService.deleteUser(req.params.id, req.user?.id);
    return sendResponse(res, 200, true, 'User deleted successfully', { user: result }, []);
  } catch (err) {
    return handleError(res, err);
  }
}
