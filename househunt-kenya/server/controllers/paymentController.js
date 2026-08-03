export async function charge(req, res, next) {
  try { res.json({ success: true, message: 'Charge (not implemented)' }); } catch (err) { next(err); }
}

export async function history(req, res, next) {
  try { res.json({ success: true, data: [] }); } catch (err) { next(err); }
}
