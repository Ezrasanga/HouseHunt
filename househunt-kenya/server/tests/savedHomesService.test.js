import assert from 'node:assert/strict';
import test from 'node:test';
import User from '../models/User.js';
import userRouter from '../routes/users.js';
import * as userService from '../services/userService.js';

const userId = '507f1f77bcf86cd799439011';
const propertyId = '507f1f77bcf86cd799439012';

test('saved homes are read and changed using atomic add and remove operations', async () => {
  const originalFindById = User.findById;
  const originalFindByIdAndUpdate = User.findByIdAndUpdate;
  const savedProperties = [propertyId];
  const updates = [];

  User.findById = async id => id === userId ? { savedProperties: [...savedProperties] } : null;
  User.findByIdAndUpdate = async (id, update) => {
    updates.push(update);
    if (id !== userId) return null;
    if (update.$addToSet) {
      const nextId = String(update.$addToSet.savedProperties);
      if (!savedProperties.includes(nextId)) savedProperties.push(nextId);
    }
    if (update.$pull) {
      const removedId = String(update.$pull.savedProperties);
      const index = savedProperties.indexOf(removedId);
      if (index >= 0) savedProperties.splice(index, 1);
    }
    return { savedProperties: [...savedProperties] };
  };

  try {
    assert.deepEqual(await userService.getSavedHomeIds(userId), [propertyId]);
    assert.deepEqual(await userService.addSavedHome(userId, propertyId), [propertyId]);
    assert.deepEqual(updates[0], { $addToSet: { savedProperties: propertyId } });
    assert.deepEqual(await userService.removeSavedHome(userId, propertyId), []);
    assert.deepEqual(updates[1], { $pull: { savedProperties: propertyId } });
  } finally {
    User.findById = originalFindById;
    User.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test('saved-home routes require an account but are not restricted to one account role', () => {
  const routes = userRouter.stack.filter(layer => layer.route?.path?.includes('saved-homes'));

  assert.equal(routes.length, 3);
  for (const layer of routes) {
    assert.equal(layer.route.stack[0].name, 'authenticate');
    assert.equal(layer.route.stack.length, 2);
  }
});

test('saved homes reject malformed user and property IDs', async () => {
  await assert.rejects(userService.getSavedHomeIds('invalid'), { status: 400 });
  await assert.rejects(userService.addSavedHome(userId, 'invalid'), { status: 400 });
  await assert.rejects(userService.removeSavedHome(userId, 'invalid'), { status: 400 });
  await assert.rejects(userService.getSavedHomeIds('abcdefghijkl'), { status: 400 });
});

test('saved homes return not found for a missing account', async () => {
  const originalFindById = User.findById;
  const originalFindByIdAndUpdate = User.findByIdAndUpdate;
  User.findById = async () => null;
  User.findByIdAndUpdate = async () => null;

  try {
    await assert.rejects(userService.getSavedHomeIds(userId), { status: 404 });
    await assert.rejects(userService.addSavedHome(userId, propertyId), { status: 404 });
    await assert.rejects(userService.removeSavedHome(userId, propertyId), { status: 404 });
  } finally {
    User.findById = originalFindById;
    User.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test('saved listing references are excluded from general user serialization', () => {
  const user = new User({
    firstName: 'Test',
    lastName: 'Tenant',
    email: 'tenant@example.com',
    password: 'valid-password',
    savedProperties: [propertyId],
  });

  assert.equal(user.toJSON().savedProperties, undefined);
  assert.equal(user.toObject().savedProperties, undefined);
});
