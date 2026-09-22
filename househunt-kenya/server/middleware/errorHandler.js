export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);
  const status = err.status || 500;
  const message = status >= 500 ? 'Internal Server Error' : (err.message || 'Request failed');
  res.status(status).json({
    success: false,
    message,
    data: null,
    errors: [{ field: 'server', message }],
  });
}
