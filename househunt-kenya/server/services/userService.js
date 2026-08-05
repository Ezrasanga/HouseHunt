import User from '../models/User.js';
import { validatePasswordChangeInput, validateProfileUpdateInput } from '../utils/authValidator.js';

function sanitizeUser(user) {
  return user?.toJSON ? user.toJSON() : user;
}

function buildPagination(page, limit, total) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

async function countActiveAdmins(excludeUserId = null) {
  const filter = { role: 'ADMIN', isActive: true };
  if (excludeUserId) {
    filter._id = { $ne: excludeUserId };
  }
  return User.countDocuments(filter);
}

export async function listUsers(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = {};

  if (query.role) {
    filter.role = String(query.role).toUpperCase();
  }

  const isActive = parseBoolean(query.isActive);
  if (isActive !== undefined) {
    filter.isActive = isActive;
  }

  const isVerified = parseBoolean(query.isVerified);
  if (isVerified !== undefined) {
    filter.isVerified = isVerified;
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return {
    users: users.map(sanitizeUser),
    pagination: buildPagination(page, limit, total),
  };
}

export async function getUser(id) {
  if (!id) {
    const error = new Error('User ID is required');
    error.status = 400;
    throw error;
  }

  const user = await User.findById(id);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  return sanitizeUser(user);
}

export async function getProfile(userId) {
  if (!userId) {
    const error = new Error('User ID is required');
    error.status = 400;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  return sanitizeUser(user);
}

export async function updateProfile(userId, payload) {
  const validation = validateProfileUpdateInput(payload);
  if (!validation.success) {
    const error = new Error('Validation failed');
    error.status = 400;
    error.errors = validation.errors;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  Object.entries(validation.data).forEach(([field, value]) => {
    user[field] = value;
  });

  await user.save();

  return sanitizeUser(user);
}

export async function changePassword(userId, payload) {
  const validation = validatePasswordChangeInput(payload);
  if (!validation.success) {
    const error = new Error('Validation failed');
    error.status = 400;
    error.errors = validation.errors;
    throw error;
  }

  const user = await User.findById(userId).select('+password');
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  const passwordMatches = await user.comparePassword(validation.data.currentPassword);
  if (!passwordMatches) {
    const error = new Error('Current password is incorrect');
    error.status = 400;
    throw error;
  }

  user.password = validation.data.newPassword;
  await user.save();

  return sanitizeUser(user);
}

export async function updateUserStatus(userId, payload, currentUserId) {
  if (!userId) {
    const error = new Error('User ID is required');
    error.status = 400;
    throw error;
  }

  const isActive = payload?.isActive;
  if (typeof isActive !== 'boolean') {
    const error = new Error('isActive must be a boolean');
    error.status = 400;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  if (user.role === 'ADMIN' && !isActive) {
    const remainingActiveAdmins = await countActiveAdmins(user._id);
    if (remainingActiveAdmins === 0) {
      const error = new Error('Cannot deactivate the last active administrator');
      error.status = 400;
      throw error;
    }
  }

  if (user._id.toString() === currentUserId) {
    const error = new Error('You cannot change your own status');
    error.status = 400;
    throw error;
  }

  user.isActive = isActive;
  await user.save();

  return sanitizeUser(user);
}

export async function deleteUser(userId, currentUserId) {
  if (!userId) {
    const error = new Error('User ID is required');
    error.status = 400;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  if (user.role === 'ADMIN' && user.isActive) {
    const remainingActiveAdmins = await countActiveAdmins(user._id);
    if (remainingActiveAdmins === 0) {
      const error = new Error('Cannot delete the last active administrator');
      error.status = 400;
      throw error;
    }
  }

  if (user._id.toString() === currentUserId) {
    const error = new Error('You cannot delete your own account');
    error.status = 400;
    throw error;
  }

  await User.findByIdAndDelete(userId);

  return { user: sanitizeUser(user) };
}
