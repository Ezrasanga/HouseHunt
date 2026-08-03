export async function list(req, res, next) {
  try { res.json({ success: true, data: [] }); } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try { res.json({ success: true, message: 'Create announcement (not implemented)' }); } catch (err) { next(err); }
}
