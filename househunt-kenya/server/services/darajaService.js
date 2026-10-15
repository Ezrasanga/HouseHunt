/* global process, Buffer */
import https from 'https';
import { URL } from 'url';

const ENV_MAP = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
};

let cached = {
  accessToken: null,
  expiresAt: 0,
};

function safeNow() {
  return Date.now();
}

function getBaseUrl() {
  const env = (process.env.MPESA_ENV || 'sandbox').toLowerCase();
  const baseUrl = ENV_MAP[env];
  if (!baseUrl) {
    const error = new Error('MPESA_ENV must be either sandbox or production');
    error.status = 500;
    throw error;
  }
  return baseUrl;
}

function buildAuthHeader(consumerKey, consumerSecret) {
  const creds = `${consumerKey}:${consumerSecret}`;
  return `Basic ${Buffer.from(creds, 'utf8').toString('base64')}`;
}

let httpGet = async function (url, headers = {}) {
  const parsed = new URL(url);
  const opts = {
    method: 'GET',
    hostname: parsed.hostname,
    path: `${parsed.pathname}${parsed.search}`,
    protocol: parsed.protocol,
    headers,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ statusCode: res.statusCode, body });
      });
    });

    req.setTimeout(15000, () => req.destroy(new Error('Daraja OAuth request timed out')));
    req.on('error', (err) => reject(err));
    req.end();
  });
}

export async function getAccessToken() {
  const now = safeNow();
  if (cached.accessToken && cached.expiresAt && now + 15000 < cached.expiresAt) {
    return cached.accessToken;
  }

  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  if (!key || !secret) {
    const error = new Error('MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be configured');
    error.status = 500;
    throw error;
  }

  const authHeader = buildAuthHeader(key, secret);
  const base = getBaseUrl();
  const url = `${base}/oauth/v1/generate?grant_type=client_credentials`;

  let res;
  try {
    res = await httpGet(url, { Authorization: authHeader });
  } catch {
    const error = new Error('Failed to reach Daraja OAuth endpoint');
    error.status = 502;
    throw error;
  }

  if (!res || typeof res.body !== 'string') {
    const error = new Error('Invalid response from Daraja OAuth');
    error.status = 502;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    const error = new Error('Malformed JSON from Daraja OAuth');
    error.status = 502;
    throw error;
  }

  if (res.statusCode !== 200) {
    const message = parsed?.error_description || parsed?.message || 'Daraja OAuth error';
    const error = new Error(`Daraja OAuth failed: ${message}`);
    error.status = 502;
    throw error;
  }

  if (!parsed.access_token || !parsed.expires_in) {
    const error = new Error('Daraja OAuth response missing token or expiry');
    error.status = 502;
    throw error;
  }

  const expiresAt = safeNow() + (Number(parsed.expires_in) * 1000);
  // small safety buffer
  cached.accessToken = parsed.access_token;
  cached.expiresAt = expiresAt;

  return cached.accessToken;
}

export function _resetCacheForTests() {
  cached = { accessToken: null, expiresAt: 0 };
}

export function __setHttpGet(fn) {
  httpGet = fn;
}

export function __restoreHttpGet() {
  // no-op in production; tests can reset by setting to original if they captured it
}

let httpPost = async function (url, headers = {}, body = {}) {
  const parsed = new URL(url);
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const opts = {
    method: 'POST',
    hostname: parsed.hostname,
    path: `${parsed.pathname}${parsed.search}`,
    protocol: parsed.protocol,
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
  };

  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ statusCode: res.statusCode, body });
      });
    });

    req.setTimeout(15000, () => req.destroy(new Error('Daraja STK request timed out')));
    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
};

export function __setHttpPost(fn) {
  httpPost = fn;
}

function makeTimestamp(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
}

export async function initiateSTKPush({ amount, phone, accountReference, transactionDesc }) {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const callbackUrl = process.env.MPESA_CALLBACK_URL;

  if (!shortcode || !passkey || !callbackUrl) {
    const err = new Error('MPESA_SHORTCODE, MPESA_PASSKEY and MPESA_CALLBACK_URL must be configured');
    err.status = 500;
    throw err;
  }

  let parsedCallbackUrl;
  try {
    parsedCallbackUrl = new URL(callbackUrl);
  } catch {
    const error = new Error('MPESA_CALLBACK_URL must be a valid public HTTPS URL');
    error.status = 500;
    throw error;
  }
  if (parsedCallbackUrl.protocol !== 'https:') {
    const error = new Error('MPESA_CALLBACK_URL must use HTTPS');
    error.status = 500;
    throw error;
  }
  if (!Number.isInteger(Number(amount)) || Number(amount) <= 0) {
    const error = new Error('STK Push amount must be a positive whole number of KES');
    error.status = 400;
    throw error;
  }

  const token = await getAccessToken();
  const timestamp = makeTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`, 'utf8').toString('base64');

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Number(amount),
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: accountReference,
    TransactionDesc: transactionDesc || 'HouseHunt payment',
  };

  const url = `${getBaseUrl()}/mpesa/stkpush/v1/processrequest`;
  let res;
  try {
    res = await httpPost(url, { Authorization: `Bearer ${token}` }, payload);
  } catch {
    const error = new Error('Failed to reach Daraja STK endpoint');
    error.status = 502;
    throw error;
  }

  if (!res || typeof res.body !== 'string') {
    const error = new Error('Invalid response from Daraja STK');
    error.status = 502;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    const error = new Error('Malformed JSON from Daraja STK');
    error.status = 502;
    throw error;
  }

  if (res.statusCode !== 200) {
    const message = parsed?.errorMessage || parsed?.error || parsed?.errorMessage || 'Daraja STK error';
    const error = new Error(`Daraja STK failed: ${message}`);
    error.status = 502;
    throw error;
  }

  // Expected success structure may include MerchantRequestID and CheckoutRequestID
  const merchantRequestId = parsed.MerchantRequestID || parsed.merchantRequestId || '';
  const checkoutRequestId = parsed.CheckoutRequestID || parsed.checkoutRequestId || '';
  const responseDescription = parsed.ResponseDescription || parsed.responseDescription || parsed.CustomerMessage || '';

  if (!merchantRequestId || !checkoutRequestId) {
    const error = new Error('Daraja STK response missing request identifiers');
    error.status = 502;
    throw error;
  }

  return { merchantRequestId, checkoutRequestId, responseDescription, raw: parsed };
}

async function performSTKPushQuery({ checkoutRequestId }) {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;

  if (!shortcode || !passkey) {
    const error = new Error('MPESA_SHORTCODE and MPESA_PASSKEY must be configured');
    error.status = 500;
    throw error;
  }
  if (!checkoutRequestId || typeof checkoutRequestId !== 'string') {
    const error = new Error('A valid CheckoutRequestID is required');
    error.status = 400;
    throw error;
  }

  const token = await getAccessToken();
  const timestamp = makeTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`, 'utf8').toString('base64');
  const url = `${getBaseUrl()}/mpesa/stkpushquery/v1/query`;
  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  let response;
  try {
    response = await httpPost(url, { Authorization: `Bearer ${token}` }, payload);
  } catch {
    const error = new Error('Failed to reach Daraja STK query endpoint');
    error.status = 502;
    throw error;
  }

  if (!response || typeof response.body !== 'string') {
    const error = new Error('Invalid response from Daraja STK query');
    error.status = 502;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    const error = new Error('Malformed JSON from Daraja STK query');
    error.status = 502;
    throw error;
  }

  if (response.statusCode !== 200 || String(parsed.ResponseCode ?? '') !== '0') {
    const message = parsed.errorMessage || parsed.ResponseDescription || parsed.error || 'Daraja STK query failed';
    const error = new Error(`Daraja STK query failed: ${message}`);
    error.status = 502;
    throw error;
  }

  const parsedResultCode = parsed.ResultCode === undefined || parsed.ResultCode === null || parsed.ResultCode === ''
    ? null
    : Number(parsed.ResultCode);

  return {
    merchantRequestId: parsed.MerchantRequestID || '',
    checkoutRequestId: parsed.CheckoutRequestID || '',
    resultCode: Number.isFinite(parsedResultCode) ? parsedResultCode : null,
    resultDescription: parsed.ResultDesc || parsed.ResultDescription || parsed.ResponseDescription || '',
  };
}

let stkQuery = performSTKPushQuery;

export async function querySTKPush(params) {
  return stkQuery(params);
}

export function __setStkQuery(fn) {
  stkQuery = fn;
}

export function __resetStkQuery() {
  stkQuery = performSTKPushQuery;
}
