/* global process */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import User from '../models/User.js';
import { loginUser } from '../services/authService.js';
import {
  validateLoginInput,
  validateProfileUpdateInput,
  validateRegisterInput,
} from '../utils/authValidator.js';

const originalFindOne = User.findOne;

after(() => {
  User.findOne = originalFindOne;
});

test('login validation accepts ADMIN, TENANT, and LANDLORD roles', () => {
  for (const role of ['ADMIN', 'TENANT', 'LANDLORD']) {
    const result = validateLoginInput({
      email: 'user@example.com',
      password: 'password123',
      role,
    });

    assert.equal(result.success, true);
    assert.equal(result.data.role, role);
  }
});

test('public registration continues to reject the ADMIN role', () => {
  const result = validateRegisterInput({
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'password123',
    role: 'ADMIN',
  });

  assert.equal(result.success, false);
  assert.equal(result.errors[0].field, 'role');
});

test('profile updates persist and normalize landlord contact details', () => {
  const result = validateProfileUpdateInput({
    phone: '+254 700 123 456',
    whatsapp: '+254 (711) 234-567',
    ig: '@house.hunt',
    fb: 'househunt.kenya',
    tt: '@house_hunt',
    tw: '@house-hunt',
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.data, {
    phone: '+254 700 123 456',
    whatsapp: '254711234567',
    ig: 'house.hunt',
    fb: 'househunt.kenya',
    tt: 'house_hunt',
    tw: 'house-hunt',
  });
});

test('profile update rejects malformed WhatsApp numbers and social usernames', () => {
  const result = validateProfileUpdateInput({
    whatsapp: 'call-me',
    ig: 'https://instagram.com/account',
  });

  assert.equal(result.success, false);
  assert.deepEqual(result.errors.map(error => error.field), ['whatsapp', 'ig']);
});

test('login rejects credentials when the account does not match the requested role', async () => {
  User.findOne = () => ({
    select: async () => ({
      role: 'TENANT',
      comparePassword: async () => true,
    }),
  });

  await assert.rejects(
    loginUser({ email: 'user@example.com', password: 'password123', role: 'LANDLORD' }),
    error => {
      assert.equal(error.status, 401);
      assert.equal(error.message, 'Invalid login role for this account');
      return true;
    }
  );
});

test('admin login accepts only an ADMIN account', async () => {
  const savedUsers = [];
  const originalJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'auth-service-test-secret';
  User.findOne = emailQuery => ({
    select: async () => ({
      _id: `id-${emailQuery.email}`,
      email: emailQuery.email,
      role: emailQuery.email === 'admin@example.com' ? 'ADMIN' : 'LANDLORD',
      isActive: true,
      comparePassword: async () => true,
      save: async function () { savedUsers.push(this.role); },
      toJSON: () => ({
        id: `id-${emailQuery.email}`,
        email: emailQuery.email,
        role: emailQuery.email === 'admin@example.com' ? 'ADMIN' : 'LANDLORD',
      }),
    }),
  });

  try {
    await assert.rejects(
      loginUser({ email: 'landlord@example.com', password: 'password123', role: 'ADMIN' }),
      error => error.status === 401
    );

    const session = await loginUser({
      email: 'admin@example.com',
      password: 'password123',
      role: 'ADMIN',
    });

    assert.equal(session.user.role, 'ADMIN');
    assert.equal(savedUsers.includes('ADMIN'), true);
  } finally {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  }
});
