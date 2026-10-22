import test from 'node:test';
import assert from 'node:assert/strict';

import { main as bootstrapFirstAdmin } from '../scripts/bootstrap-first-admin.js';

function createHarness({
  lineAnswers = [],
  passwordAnswers = [],
  existingAdmin = false,
  existingEmail = false,
  lockExists = false,
  adminAppearsAfterLock = false,
} = {}) {
  const state = {
    connectCalls: [],
    disconnectCalls: 0,
    lock: lockExists ? { _id: 'first-admin' } : null,
    lockInsertCalls: 0,
    lockDeleteCalls: 0,
    createdUsers: [],
    adminChecks: 0,
  };
  const database = {
    connection: {
      name: 'househunt-test',
      collection(name) {
        assert.equal(name, 'adminBootstrapLocks');
        return {
          insertOne: async lock => {
            state.lockInsertCalls += 1;
            if (state.lock) {
              const error = new Error('duplicate lock');
              error.code = 11000;
              throw error;
            }
            state.lock = lock;
          },
          deleteOne: async ({ _id }) => {
            assert.equal(_id, 'first-admin');
            state.lockDeleteCalls += 1;
            state.lock = null;
          },
        };
      },
    },
    connect: async uri => state.connectCalls.push(uri),
    disconnect: async () => { state.disconnectCalls += 1; },
  };
  const userModel = {
    exists: async query => {
      if (query.role === 'ADMIN') {
        state.adminChecks += 1;
        if (existingAdmin || (adminAppearsAfterLock && state.adminChecks > 1)) {
          return { _id: 'existing-admin' };
        }
        return null;
      }
      if (query.email) return existingEmail ? { _id: 'existing-user' } : null;
      return null;
    },
    create: async user => {
      state.createdUsers.push(user);
      return { _id: 'created-admin' };
    },
  };
  const lineInterface = {
    isTTY: true,
    setRawMode() {},
    resume() {},
    pause() {},
    on() {},
    off() {},
  };
  const output = { isTTY: true, write() {} };
  const lineQueue = [...lineAnswers];
  const passwordQueue = [...passwordAnswers];
  const logger = { log() {} };

  const dependencies = {
    database,
    userModel,
    environment: { MONGO_URI: 'mongodb://test.invalid/househunt', NODE_ENV: 'test' },
    input: lineInterface,
    output,
    logger,
    readLine: async () => lineQueue.shift(),
    readPassword: async () => passwordQueue.shift(),
  };
  return { dependencies, state };
}

function validAnswers() {
  return {
    lineAnswers: [
      'I CONFIRM NON-PRODUCTION househunt-test',
      ' Ada ',
      ' Lovelace ',
      ' ADA@EXAMPLE.TEST ',
    ],
    passwordAnswers: ['Correct-Horse-Battery-1!', 'Correct-Horse-Battery-1!'],
  };
}

test('bootstrap refuses non-interactive input before connecting', async () => {
  const { dependencies, state } = createHarness();
  dependencies.input.isTTY = false;

  await assert.rejects(bootstrapFirstAdmin(dependencies), /interactive PowerShell or terminal/);
  assert.equal(state.connectCalls.length, 0);
  assert.equal(state.disconnectCalls, 0);
});

test('bootstrap refuses production before connecting', async () => {
  const { dependencies, state } = createHarness();
  dependencies.environment.NODE_ENV = 'production';

  await assert.rejects(bootstrapFirstAdmin(dependencies), /restricted to development and test/);
  assert.equal(state.connectCalls.length, 0);
  assert.equal(state.disconnectCalls, 0);
});

test('bootstrap requires the exact connected database confirmation', async () => {
  const { dependencies, state } = createHarness({ lineAnswers: ['I CONFIRM NON-PRODUCTION other-db'] });

  await assert.rejects(bootstrapFirstAdmin(dependencies), /confirmation did not match/);
  assert.equal(state.createdUsers.length, 0);
  assert.equal(state.lockInsertCalls, 0);
  assert.equal(state.disconnectCalls, 1);
});

test('bootstrap refuses to create another admin when one already exists', async () => {
  const answers = validAnswers();
  answers.lineAnswers[0] = 'I CONFIRM NON-PRODUCTION househunt-test';
  const { dependencies, state } = createHarness({ ...answers, existingAdmin: true });

  await assert.rejects(bootstrapFirstAdmin(dependencies), /An admin already exists/);
  assert.equal(state.lockInsertCalls, 0);
  assert.equal(state.createdUsers.length, 0);
  assert.equal(state.disconnectCalls, 1);
});

test('bootstrap rechecks for an admin after acquiring the lock', async () => {
  const { dependencies, state } = createHarness({
    ...validAnswers(),
    adminAppearsAfterLock: true,
  });

  await assert.rejects(bootstrapFirstAdmin(dependencies), /created by another process/);
  assert.equal(state.lockInsertCalls, 1);
  assert.equal(state.lockDeleteCalls, 1);
  assert.equal(state.createdUsers.length, 0);
  assert.equal(state.disconnectCalls, 1);
});

test('bootstrap refuses an existing email without promoting that account', async () => {
  const { dependencies, state } = createHarness({
    ...validAnswers(),
    existingEmail: true,
  });

  await assert.rejects(bootstrapFirstAdmin(dependencies), /existing accounts are never promoted/);
  assert.equal(state.createdUsers.length, 0);
  assert.equal(state.lockDeleteCalls, 1);
  assert.equal(state.disconnectCalls, 1);
});

test('bootstrap refuses a lock held by another attempt', async () => {
  const { dependencies, state } = createHarness({
    ...validAnswers(),
    lockExists: true,
  });

  await assert.rejects(bootstrapFirstAdmin(dependencies), /already running or was interrupted/);
  assert.equal(state.lockInsertCalls, 1);
  assert.equal(state.lockDeleteCalls, 0);
  assert.equal(state.createdUsers.length, 0);
  assert.equal(state.disconnectCalls, 1);
});

test('bootstrap validates matching passwords before creating an admin', async () => {
  const { dependencies, state } = createHarness({
    ...validAnswers(),
    passwordAnswers: ['Correct-Horse-Battery-1!', 'different-password'],
  });

  await assert.rejects(bootstrapFirstAdmin(dependencies), /Passwords do not match/);
  assert.equal(state.createdUsers.length, 0);
  assert.equal(state.lockDeleteCalls, 1);
  assert.equal(state.disconnectCalls, 1);
});

test('bootstrap creates the first admin and retains the one-time lock', async () => {
  const { dependencies, state } = createHarness(validAnswers());

  await bootstrapFirstAdmin(dependencies);

  assert.deepEqual(state.connectCalls, ['mongodb://test.invalid/househunt']);
  assert.equal(state.createdUsers.length, 1);
  assert.deepEqual(state.createdUsers[0], {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.test',
    password: 'Correct-Horse-Battery-1!',
    role: 'ADMIN',
  });
  assert.equal(state.lock._id, 'first-admin');
  assert.equal(state.lockDeleteCalls, 0);
  assert.equal(state.disconnectCalls, 1);
});
