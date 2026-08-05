import User from '../models/User.js';
import { generateToken } from '../utils/generateToken.js';

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

  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'ADMIN') {
    const error = new Error('Admin accounts cannot be created through the public API');
    error.status = 403;
    throw error;
  }

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

  const normalizedRole = role ? normalizeRole(role) : null;
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
