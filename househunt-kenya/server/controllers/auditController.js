import { listAuditEvents } from '../services/auditLogService.js';

export async function list(req, res) {
  try {
    const result = await listAuditEvents(req.user, req.query);
    return res.status(200).json({
      success: true,
      message: 'Audit events fetched successfully',
      data: result,
      errors: [],
    });
  } catch (error) {
    return res.status(error?.status || 500).json({
      success: false,
      message: error?.message || 'Unable to load audit events',
      data: null,
      errors: [],
    });
  }
}
