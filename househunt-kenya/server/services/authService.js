import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { generateToken } from '../utils/generateToken.js';
import { assertPasswordResetEmailConfigured, sendPasswordResetEmail } from './emailService.js';

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export async function requestPasswordReset(
  email,
  { sendEmail = sendPasswordResetEmail, frontendUrl = globalThis.process?.env?.FRONTEND_URL } = {}
) {
  if (sendEmail === sendPasswordResetEmail) assertPasswordResetEmailConfigured();
  const user = await User.findOne({ email });
  if (!user) return;

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  user.passwordResetTokenHash = createHash('sha256').update(token).digest('hex');
  user.passwordResetExpiresAt = expiresAt;
  await user.save();

  try {
    await sendEmail({ user, token, frontendUrl });
  } catch (error) {
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();
    throw error;
  }
}

export async function resetPassword({ token, newPassword }) {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const user = await User.findOneAndUpdate(
    {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    },
    {
      $set: { password: passwordHash },
      $inc: { tokenVersion: 1 },
      $unset: {
        passwordResetTokenHash: 1,
        passwordResetExpiresAt: 1,
      },
    },
    { new: true, runValidators: true }
  );

  if (!user) {
    const error = new Error('This password reset link is invalid or has expired. Request a new one.');
    error.status = 400;
    throw error;
  }
}

function normalizeRole(role) {
  const normalizedRole = (role || 'TENANT').toUpperCase();
  if (normalizedRole === 'LANDLORD' || normalizedRole === 'TENANT') {
    return normalizedRole;
  }
  return 'TENANT';
}

export async function registerUser(payload) {
  const { firstName, lastName, name, email, password, role, phone } = payload;

  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || name;

  if (!fullName || !email || !password) {
    const error = new Error('Name, email, and password are required');
    error.status = 400;
    throw error;
  }

  if (String(role || '').toUpperCase() === 'ADMIN') {
    const error = new Error('Admin accounts cannot be created through the public API');
    error.status = 403;
    throw error;
  }

  const normalizedRole = normalizeRole(role);

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    const error = new Error('An account with this email already exists');
    error.status = 409;
    throw error;
  }

  const [first, ...rest] = fullName.split(' ');
  const user = await User.create({
    firstName: first || fullName,
    lastName: rest.join(' ') || fullName,
    email: email.toLowerCase(),
    password,
    role: normalizedRole,
    phone: phone || '',
  });

  const token = generateToken(user);
  return {
    token,
    user: user.toJSON(),
  };
}

export async function loginUser(payload) {
  const { email, password, role } = payload;

  if (!email || !password) {
    const error = new Error('Email and password are required');
    error.status = 400;
    throw error;
  }

  const normalizedRole = role ? String(role).toUpperCase() : null;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

  if (!user) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  if (normalizedRole && user.role !== normalizedRole) {
    const error = new Error('Invalid login role for this account');
    error.status = 401;
    throw error;
  }

  const passwordMatches = await user.comparePassword(password);
  if (!passwordMatches) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  if (!user.isActive) {
    const error = new Error('This account is suspended');
    error.status = 403;
    throw error;
  }

  user.lastLogin = new Date();
  await user.save();

  const token = generateToken(user);
  return {
    token,
    user: user.toJSON(),
  };
}

export async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  return user.toJSON();
}
