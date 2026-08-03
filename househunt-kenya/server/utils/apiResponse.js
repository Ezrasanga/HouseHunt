export function success(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

export function fail(res, message = 'Error', code = 400) {
  return res.status(code).json({ success: false, message });
}
