import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

import User from '../models/User.js';
import { requestPasswordReset, resetPassword } from '../services/authService.js';
import {
  validatePasswordResetInput,
  validatePasswordResetRequestInput,
} from '../utils/authValidator.js';

const originalFindOne = User.findOne;
const originalFindOneAndUpdate = User.findOneAndUpdate;

test('password reset request saves only a token hash and emails a 30-minute link', async () => {
  const now = Date.now();
  const user = {
    email: 'tenant@example.com',
    firstName: 'Tenant',
    save: async function () {},
  };
  let savedTokenHash;
  let savedExpiry;
  let emailRequest;
  user.save = async function () {
    savedTokenHash = this.passwordResetTokenHash;
    savedExpiry = this.passwordResetExpiresAt;
  };
  User.findOne = async query => {
    assert.deepEqual(query, { email: user.email });
    return user;
  };

  try {
    await requestPasswordReset(user.email, {
      frontendUrl: 'https://househunt.example',
      sendEmail: async request => { emailRequest = request; },
    });

    const resetUrl = new URL('reset-password', `${emailRequest.frontendUrl}/`);
    resetUrl.searchParams.set('token', emailRequest.token);
    const token = resetUrl.searchParams.get('token');
    assert.equal(resetUrl.origin, 'https://househunt.example');
    assert.equal(resetUrl.pathname, '/reset-password');
    assert.ok(token);
    assert.notEqual(savedTokenHash, token);
    assert.equal(savedTokenHash, createHash('sha256').update(token).digest('hex'));
    assert.ok(savedExpiry.getTime() >= now + (30 * 60 * 1000) - 1000);
    assert.equal(emailRequest.user, user);
  } finally {
    User.findOne = originalFindOne;
  }
});

test('password reset request does not send email for an unknown address', async () => {
  let emailSent = false;
  User.findOne = async () => null;

  try {
    await requestPasswordReset('unknown@example.com', {
      sendEmail: async () => { emailSent = true; },
    });
    assert.equal(emailSent, false);
  } finally {
    User.findOne = originalFindOne;
  }
});

test('password reset atomically consumes a valid token and stores a bcrypt hash', async () => {
  let updateArguments;
  User.findOneAndUpdate = async (...args) => {
    updateArguments = args;
    return { id: 'user-1' };
  };
  const token = 'single-use-reset-token';

  try {
    await resetPassword({ token, newPassword: 'new-password-123' });

    const [filter, update, options] = updateArguments;
    assert.equal(
      filter.passwordResetTokenHash,
      createHash('sha256').update(token).digest('hex')
    );
    assert.ok(filter.passwordResetExpiresAt.$gt instanceof Date);
    assert.equal(await bcrypt.compare('new-password-123', update.$set.password), true);
    assert.deepEqual(update.$unset, {
      passwordResetTokenHash: 1,
      passwordResetExpiresAt: 1,
    });
    assert.deepEqual(update.$inc, { tokenVersion: 1 });
    assert.deepEqual(options, { new: true, runValidators: true });
  } finally {
    User.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('password reset rejects a missing, expired, or already-used token', async () => {
  User.findOneAndUpdate = async () => null;

  try {
    await assert.rejects(
      resetPassword({ token: 'expired-token', newPassword: 'new-password-123' }),
      error => error.status === 400 && /invalid or has expired/.test(error.message)
    );
  } finally {
    User.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('password reset validators normalize request email and require a strong replacement password', () => {
  assert.deepEqual(
    validatePasswordResetRequestInput({ email: ' Tenant@Example.com ' }),
    { success: true, data: { email: 'tenant@example.com' } }
  );
  assert.equal(validatePasswordResetRequestInput({ email: 'invalid' }).success, false);
  assert.equal(validatePasswordResetInput({ token: '', newPassword: 'short' }).success, false);
  assert.equal(validatePasswordResetInput({ token: 'token', newPassword: 'new-password-123' }).success, true);
});
