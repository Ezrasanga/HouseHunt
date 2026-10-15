/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import User from '../models/User.js';
import { authenticate } from '../middleware/authenticate.js';

const originalFindById = User.findById;
const originalJwtSecret = process.env.JWT_SECRET;

test('password reset invalidates existing JWTs by token version', async () => {
  process.env.JWT_SECRET = 'token-version-test-secret';
  const token = jwt.sign({ id: 'user-1', tokenVersion: 1 }, process.env.JWT_SECRET);
  User.findById = async () => ({
    tokenVersion: 2,
    isActive: true,
    toJSON: () => ({ id: 'user-1', role: 'TENANT' }),
  });

  let statusCode;
  let nextCalled = false;
  try {
    await authenticate(
      { headers: { authorization: `Bearer ${token}` } },
      {
        status(code) {
          statusCode = code;
          return this;
        },
        json() {},
      },
      () => { nextCalled = true; }
    );

    assert.equal(statusCode, 401);
    assert.equal(nextCalled, false);
  } finally {
    User.findById = originalFindById;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  }
});
