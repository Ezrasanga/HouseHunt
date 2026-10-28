import {
  getProfile,
  logoutUser,
  loginUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
} from '../services/authService.js';
import { clearAuthCookie, setAuthCookie } from '../utils/authCookie.js';
import { recordAuditEvent } from '../services/auditLogService.js';
import {
  validateLoginInput,
  validatePasswordResetInput,
  validatePasswordResetRequestInput,
  validateRegisterInput,
} from '../utils/authValidator.js';

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
    await recordAuditEvent({
      actor: result.user,
      action: 'User login',
      description: 'Signed in successfully',
      resourceType: 'user',
      resourceId: result.user.id || result.user._id,
    });
    setAuthCookie(res, result.token);
    return sendResponse(res, 200, true, 'Login successful', { user: result.user }, []);
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
    await recordAuditEvent({
      actor: result.user,
      action: 'Account registered',
      description: 'Created an account',
      resourceType: 'user',
      resourceId: result.user.id || result.user._id,
    });
    setAuthCookie(res, result.token);
    return sendResponse(res, 201, true, 'Registration successful', { user: result.user }, []);
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    await logoutUser(req.user?.id);
    clearAuthCookie(res);
    return sendResponse(res, 200, true, 'Signed out successfully', null, []);
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

export async function requestPasswordResetLink(req, res, next) {
  try {
    const validation = validatePasswordResetRequestInput(req.body);
    if (!validation.success) {
      return sendResponse(res, 400, false, 'Validation failed', null, validation.errors);
    }

    await requestPasswordReset(validation.data.email);
    return sendResponse(
      res,
      200,
      true,
      'If an account exists for that email, password reset instructions will be sent.',
      null,
      []
    );
  } catch (error) {
    next(error);
  }
}

export async function completePasswordReset(req, res, next) {
  try {
    const validation = validatePasswordResetInput(req.body);
    if (!validation.success) {
      return sendResponse(res, 400, false, 'Validation failed', null, validation.errors);
    }

    await resetPassword(validation.data);
    clearAuthCookie(res);
    return sendResponse(res, 200, true, 'Password reset successfully. You can now sign in.', null, []);
  } catch (error) {
    next(error);
  }
}
