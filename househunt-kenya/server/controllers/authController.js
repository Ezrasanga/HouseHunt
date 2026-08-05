import { getProfile, loginUser, registerUser } from '../services/authService.js';
import { validateLoginInput, validateRegisterInput } from '../utils/authValidator.js';

function sendResponse(res, statusCode, success, message, data = null, errors = []) {
  return res.status(statusCode).json({
    success,
    message,
    data,
    errors,
  });
}

export async function login(req, res, next) {
  try {
    const validation = validateLoginInput(req.body);
    if (!validation.success) {
      return sendResponse(res, 400, false, 'Validation failed', null, validation.errors);
    }

    const result = await loginUser(validation.data);
    return sendResponse(res, 200, true, 'Login successful', result, []);
  } catch (error) {
    next(error);
  }
}

export async function register(req, res, next) {
  try {
    const validation = validateRegisterInput(req.body);
    if (!validation.success) {
      return sendResponse(res, 400, false, 'Validation failed', null, validation.errors);
    }

    const result = await registerUser(validation.data);
    return sendResponse(res, 201, true, 'Registration successful', result, []);
  } catch (error) {
    next(error);
  }
}

export async function profile(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return sendResponse(res, 401, false, 'Unauthorized', null, [{ field: 'user', message: 'Authentication required' }]);
    }

    const user = await getProfile(userId);
    return sendResponse(res, 200, true, 'Profile fetched successfully', { user }, []);
  } catch (error) {
    next(error);
  }
}
