import test from 'node:test';
import assert from 'node:assert/strict';

import { authenticate } from '../middleware/authenticate.js';
import User from '../models/User.js';
import { logoutUser } from '../services/authService.js';
import {
  AUTH_COOKIE_NAME,
  clearAuthCookie,
  getAuthCookieOptions,
  setAuthCookie,
} from '../utils/authCookie.js';

test('auth cookie is HttpOnly and uses secure cross-site settings for HTTPS', () => {
  assert.deepEqual(getAuthCookieOptions(true), {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/api',
    maxAge: 604800000,
  });
  assert.deepEqual(getAuthCookieOptions(false), {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/api',
    maxAge: 604800000,
  });
});

test('auth cookie is issued and cleared with matching path and security attributes', () => {
  let issued;
  let cleared;
  const res = {
    req: { secure: true, get: () => undefined },
    cookie: (...args) => { issued = args; },
    clearCookie: (...args) => { cleared = args; },
  };

  setAuthCookie(res, 'test-token');
  clearAuthCookie(res);

  assert.equal(issued[0], AUTH_COOKIE_NAME);
  assert.equal(issued[1], 'test-token');
  assert.equal(issued[2].httpOnly, true);
  assert.equal(issued[2].secure, true);
  assert.equal(cleared[0], AUTH_COOKIE_NAME);
  assert.deepEqual(cleared[1], {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/api',
  });
});

test('cookie-authenticated state changes require the custom request header', async () => {
  let statusCode;
  let responseBody;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  await authenticate(
    {
      method: 'POST',
      headers: {},
      cookies: { [AUTH_COOKIE_NAME]: 'test-token' },
    },
    res,
    () => { nextCalled = true; }
  );

  assert.equal(statusCode, 403);
  assert.equal(responseBody.message, 'A valid same-site request header is required');
  assert.equal(nextCalled, false);
});

test('logout invalidates all issued tokens by incrementing the user token version', async () => {
  const originalUpdateOne = User.updateOne;
  let updateArguments;
  User.updateOne = async (...args) => {
    updateArguments = args;
    return { matchedCount: 1 };
  };

  try {
    await logoutUser('user-1');
    assert.equal(updateArguments[0]._id, 'user-1');
    assert.deepEqual(updateArguments[1], { $inc: { tokenVersion: 1 } });
  } finally {
    User.updateOne = originalUpdateOne;
  }
});
