export const AUTH_COOKIE_NAME = 'househunt_session';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function getAuthCookieOptions(isSecureRequest = false) {
  return {
    httpOnly: true,
    secure: isSecureRequest,
    sameSite: isSecureRequest ? 'none' : 'lax',
    path: '/api',
    maxAge: SESSION_MAX_AGE_MS,
  };
}

function isSecureRequest(res) {
  const forwardedProtocol = res.req?.get?.('x-forwarded-proto')?.split(',')[0].trim();
  return Boolean(res.req?.secure || forwardedProtocol === 'https');
}

export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions(isSecureRequest(res)));
}

export function clearAuthCookie(res) {
  const options = { ...getAuthCookieOptions(isSecureRequest(res)) };
  delete options.maxAge;
  res.clearCookie(AUTH_COOKIE_NAME, options);
}
