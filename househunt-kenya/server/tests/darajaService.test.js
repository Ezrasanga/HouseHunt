/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as daraja from '../services/darajaService.js';

// Mock environment
const origKey = process.env.MPESA_CONSUMER_KEY;
const origSecret = process.env.MPESA_CONSUMER_SECRET;
const origEnv = process.env.MPESA_ENV;
const origShortcode = process.env.MPESA_SHORTCODE;
const origPasskey = process.env.MPESA_PASSKEY;
const origCallbackUrl = process.env.MPESA_CALLBACK_URL;

test('getAccessToken fails when credentials missing', async () => {
  process.env.MPESA_CONSUMER_KEY = '';
  process.env.MPESA_CONSUMER_SECRET = '';
  daraja._resetCacheForTests();

  await assert.rejects(async () => {
    await daraja.getAccessToken();
  }, (err) => {
    assert.equal(err.status, 500);
    assert.match(err.message, /must be configured/);
    return true;
  });
});

// The following tests mock the HTTP call by injecting a replacement via the
// exported setter.
const origHttpGetSetter = daraja.__setHttpGet || null;

function setHttpGet(fn) {
  daraja.__setHttpGet(fn);
}

function restoreHttpGet() {
  if (origHttpGetSetter) daraja.__setHttpGet(origHttpGetSetter);
}

test('getAccessToken parses successful response and caches', async () => {
  process.env.MPESA_CONSUMER_KEY = 'key';
  process.env.MPESA_CONSUMER_SECRET = 'secret';
  process.env.MPESA_ENV = 'sandbox';
  daraja._resetCacheForTests();

  const fake = async () => ({ statusCode: 200, body: JSON.stringify({ access_token: 'token-123', expires_in: 3600 }) });
  setHttpGet(fake);

  const t1 = await daraja.getAccessToken();
  assert.equal(t1, 'token-123');

  // cached
  const t2 = await daraja.getAccessToken();
  assert.equal(t2, 'token-123');

  restoreHttpGet();
});

test('getAccessToken requests new token when expired', async () => {
  process.env.MPESA_CONSUMER_KEY = 'key';
  process.env.MPESA_CONSUMER_SECRET = 'secret';
  daraja._resetCacheForTests();

  let calls = 0;
  const fake = async () => {
    calls += 1;
    return { statusCode: 200, body: JSON.stringify({ access_token: `token-${calls}`, expires_in: 1 }) };
  };

  setHttpGet(fake);
  const t1 = await daraja.getAccessToken();
  assert.equal(t1, 'token-1');
  // wait for expiry
  await new Promise((r) => setTimeout(r, 1200));
  const t2 = await daraja.getAccessToken();
  assert.equal(t2, 'token-2');

  restoreHttpGet();
});

test('getAccessToken handles HTTP errors safely', async () => {
  process.env.MPESA_CONSUMER_KEY = 'key';
  process.env.MPESA_CONSUMER_SECRET = 'secret';
  daraja._resetCacheForTests();

  const fake = async () => ({ statusCode: 500, body: JSON.stringify({ error: 'server error' }) });
  setHttpGet(fake);

  await assert.rejects(async () => {
    await daraja.getAccessToken();
  }, (err) => {
    assert.equal(err.status, 502);
    assert.match(err.message, /Daraja OAuth failed|Failed to reach/);
    return true;
  });

  restoreHttpGet();
});

test('initiateSTKPush rejects successful responses missing request identifiers', async () => {
  process.env.MPESA_CONSUMER_KEY = 'key';
  process.env.MPESA_CONSUMER_SECRET = 'secret';
  process.env.MPESA_SHORTCODE = '123456';
  process.env.MPESA_PASSKEY = 'passkey';
  process.env.MPESA_CALLBACK_URL = 'https://example.com/callback';
  daraja._resetCacheForTests();
  daraja.__setHttpGet(async () => ({
    statusCode: 200,
    body: JSON.stringify({ access_token: 'test-token', expires_in: 3600 }),
  }));
  daraja.__setHttpPost(async () => ({
    statusCode: 200,
    body: JSON.stringify({ ResponseDescription: 'Accepted' }),
  }));

  await assert.rejects(async () => {
    await daraja.initiateSTKPush({
      amount: 1000,
      phone: '254712345678',
      accountReference: 'HH-test',
    });
  }, (err) => {
    assert.equal(err.status, 502);
    assert.match(err.message, /missing request identifiers/);
    return true;
  });
});

test.after(() => {
  process.env.MPESA_CONSUMER_KEY = origKey;
  process.env.MPESA_CONSUMER_SECRET = origSecret;
  process.env.MPESA_ENV = origEnv;
  process.env.MPESA_SHORTCODE = origShortcode;
  process.env.MPESA_PASSKEY = origPasskey;
  process.env.MPESA_CALLBACK_URL = origCallbackUrl;
  restoreHttpGet();
});
