import AuditEvent from '../models/AuditEvent.js';

function safeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

export async function recordAuditEvent({
  actor = null,
  action,
  description,
  resourceType = '',
  resourceId = '',
  outcome = 'SUCCESS',
} = {}) {
  try {
    return await AuditEvent.create({
      actorId: actor?.id || actor?._id || null,
      actorRole: actor?.role ? String(actor.role).toUpperCase() : 'SYSTEM',
      action: safeText(action, 80),
      description: safeText(description, 240),
      resourceType: safeText(resourceType, 40),
      resourceId: safeText(resourceId, 80),
      outcome,
    });
  } catch (error) {
    console.error('Audit event could not be persisted', {
      action: safeText(action, 80),
      error: error?.message || 'Unknown persistence error',
    });
    return null;
  }
}

export async function listAuditEvents(actor, query = {}) {
  if (!actor?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }
  if (String(actor.role).toUpperCase() !== 'ADMIN') {
    const error = new Error('Only admins can access the audit log');
    error.status = 403;
    throw error;
  }

  const page = Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit || '50'), 10) || 50));
  const filter = {};
  if (query.action) filter.action = safeText(query.action, 80);

  const [events, total] = await Promise.all([
    AuditEvent.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actorId', 'firstName lastName email role')
      .lean(),
    AuditEvent.countDocuments(filter),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    events: events.map(event => ({
      id: String(event._id),
      action: event.action,
      description: event.description,
      actor: event.actorId
        ? {
            id: String(event.actorId._id),
            name: [event.actorId.firstName, event.actorId.lastName].filter(Boolean).join(' '),
            email: event.actorId.email,
            role: event.actorId.role,
          }
        : { id: null, name: 'System', email: '', role: 'SYSTEM' },
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      outcome: event.outcome,
      createdAt: event.createdAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}
