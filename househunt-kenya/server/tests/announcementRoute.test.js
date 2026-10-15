import test from 'node:test';
import assert from 'node:assert/strict';

import announcementRoutes from '../routes/announcements.js';

const postRoute = announcementRoutes.stack.find(
  layer => layer.route?.path === '/' && layer.route.methods.post
)?.route;

test('announcement creation is restricted to admins', () => {
  assert.ok(postRoute, 'POST / announcement route should be registered');

  const authorization = postRoute.stack[1].handle;

  for (const role of ['TENANT', 'LANDLORD']) {
    let statusCode;
    let nextCalled = false;

    authorization(
      { user: { role } },
      {
        status(code) {
          statusCode = code;
          return this;
        },
        json() {},
      },
      () => { nextCalled = true; }
    );

    assert.equal(statusCode, 403, `${role} should be denied`);
    assert.equal(nextCalled, false, `${role} should not reach the controller`);
  }

  let nextCalled = false;
  authorization(
    { user: { role: 'ADMIN' } },
    { status() { return this; }, json() {} },
    () => { nextCalled = true; }
  );
  assert.equal(nextCalled, true, 'ADMIN should reach the controller');
});
