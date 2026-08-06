import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeId } from '../services/propertyService.js';

test('normalizeId converts object-like ids to comparable strings', () => {
  assert.equal(normalizeId('507f191e810c19729de860ea'), '507f191e810c19729de860ea');
  assert.equal(normalizeId({ _id: '507f191e810c19729de860ea' }), '507f191e810c19729de860ea');
  assert.equal(normalizeId({ id: '507f191e810c19729de860ea' }), '507f191e810c19729de860ea');
  assert.equal(normalizeId({ toString: () => '507f191e810c19729de860ea' }), '507f191e810c19729de860ea');
  assert.equal(normalizeId(null), null);
});
