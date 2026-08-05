import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const env = globalThis.process?.env || {};

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token required',
        data: null,
        errors: [{ field: 'authorization', message: 'Bearer token is required' }],
      });
    }

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
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      data: null,
      errors: [{ field: 'token', message: error.message || 'Token verification failed' }],
    });
  }
}

export const requireAuth = authenticate;
