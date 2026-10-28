import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { AUTH_COOKIE_NAME } from '../utils/authCookie.js';

export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication session required',
        data: null,
        errors: [{ field: 'session', message: 'A valid session cookie is required' }],
      });
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-househunt-request'] !== '1') {
      return res.status(403).json({
        success: false,
        message: 'A valid same-site request header is required',
        data: null,
        errors: [{ field: 'x-househunt-request', message: 'Cookie-authenticated state changes require the HouseHunt request header' }],
      });
    }

    const env = globalThis.process?.env || {};
    const secret = env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        data: null,
        errors: [{ field: 'token', message: 'The supplied token is invalid' }],
      });
    }

    if (Number(decoded.tokenVersion || 0) !== Number(user.tokenVersion || 0)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        data: null,
        errors: [{ field: 'token', message: 'The supplied token is no longer valid' }],
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'This account is no longer active',
        data: null,
        errors: [{ field: 'user', message: 'Account is inactive' }],
      });
    }

    req.user = user.toJSON();
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      data: null,
      errors: [{ field: 'token', message: 'Token verification failed' }],
    });
  }
}

export const requireAuth = authenticate;
