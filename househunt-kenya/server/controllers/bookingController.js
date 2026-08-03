export async function create(req, res, next) {
  try { res.json({ success: true, message: 'Create booking (not implemented)' }); } catch (err) { next(err); }
}

export async function list(req, res, next) {
  try { res.json({ success: true, data: [] }); } catch (err) { next(err); }
}

export async function get(req, res, next) {
  try { res.json({ success: true, data: null }); } catch (err) { next(err); }
}
