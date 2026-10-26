import mongoose from 'mongoose';
import AvailabilityReport from '../models/AvailabilityReport.js';
import Property from '../models/Property.js';

const REPORT_REASONS = new Set([
  'already-rented',
  'landlord-unresponsive',
  'incorrect-details',
  'other',
]);
const REVIEW_STATUSES = new Set(['RESOLVED', 'DISMISSED']);
const REPORT_STATUSES = new Set(['OPEN', 'RESOLVED', 'DISMISSED', 'ALL']);

function createError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireRole(actor, role) {
  if (!actor?.id) throw createError('Authentication required', 401);
  if (String(actor.role).toUpperCase() !== role) {
    throw createError(`Only ${role.toLowerCase()}s can access this resource`, 403);
  }
}

function reportData(report) {
  return {
    id: String(report._id),
    reason: report.reason,
    details: report.details,
    status: report.status,
    resolutionNote: report.resolutionNote,
    createdAt: report.createdAt,
    reviewedAt: report.reviewedAt,
    property: report.property
      ? {
          id: String(report.property._id),
          title: report.property.title,
          status: report.property.status,
          location: report.property.location,
        }
      : null,
    reporter: report.reporter
      ? {
          id: String(report.reporter._id),
          name: [report.reporter.firstName, report.reporter.lastName].filter(Boolean).join(' '),
          email: report.reporter.email,
        }
      : null,
    reviewer: report.reviewedBy
      ? {
          id: String(report.reviewedBy._id),
          name: [report.reviewedBy.firstName, report.reviewedBy.lastName].filter(Boolean).join(' '),
        }
      : null,
  };
}

export async function createAvailabilityReport(propertyId, actor, payload = {}) {
  requireRole(actor, 'TENANT');
  if (!mongoose.Types.ObjectId.isValid(propertyId)) {
    throw createError('Property not found', 404);
  }

  const reason = String(payload.reason || '');
  if (!REPORT_REASONS.has(reason)) {
    throw createError('Choose a valid reason for reporting this listing', 400);
  }

  const details = String(payload.details || '').trim();
  if (details.length > 500) {
    throw createError('Report details must be 500 characters or fewer', 400);
  }

  const property = await Property.findById(propertyId).select('isApproved status');
  if (!property) throw createError('Property not found', 404);
  if (!property.isApproved || property.status !== 'AVAILABLE') {
    throw createError('Only approved available listings can be reported', 409);
  }

  const duplicate = await AvailabilityReport.findOne({
    property: propertyId,
    reporter: actor.id,
    status: 'OPEN',
  }).lean();
  if (duplicate) {
    throw createError('You already have an open report for this listing', 409);
  }

  try {
    const report = await AvailabilityReport.create({
      property: propertyId,
      reporter: actor.id,
      reason,
      details,
    });
    return { report: { id: String(report._id), reason: report.reason, status: report.status, createdAt: report.createdAt } };
  } catch (error) {
    if (error?.code === 11000) {
      throw createError('You already have an open report for this listing', 409);
    }
    throw error;
  }
}

export async function listAvailabilityReports(actor, query = {}) {
  requireRole(actor, 'ADMIN');
  const status = String(query.status || 'OPEN').toUpperCase();
  if (!REPORT_STATUSES.has(status)) {
    throw createError('Choose a valid report status', 400);
  }

  const page = Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit || '25'), 10) || 25));
  const filter = status === 'ALL' ? {} : { status };
  const [reports, total] = await Promise.all([
    AvailabilityReport.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('property', 'title status location')
      .populate('reporter', 'firstName lastName email')
      .populate('reviewedBy', 'firstName lastName')
      .lean(),
    AvailabilityReport.countDocuments(filter),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    reports: reports.map(reportData),
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

export async function reviewAvailabilityReport(reportId, actor, payload = {}) {
  requireRole(actor, 'ADMIN');
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    throw createError('Availability report not found', 404);
  }

  const status = String(payload.status || '').toUpperCase();
  if (!REVIEW_STATUSES.has(status)) {
    throw createError('Report status must be RESOLVED or DISMISSED', 400);
  }
  const resolutionNote = String(payload.resolutionNote || '').trim();
  if (resolutionNote.length > 500) {
    throw createError('Review note must be 500 characters or fewer', 400);
  }

  const report = await AvailabilityReport.findOneAndUpdate(
    { _id: reportId, status: 'OPEN' },
    {
      $set: {
        status,
        resolutionNote,
        reviewedBy: actor.id,
        reviewedAt: new Date(),
      },
    },
    { new: true, runValidators: true }
  )
    .populate('property', 'title status location')
    .populate('reporter', 'firstName lastName email')
    .populate('reviewedBy', 'firstName lastName')
    .lean();
  if (!report) throw createError('Open availability report not found', 404);

  return { report: reportData(report) };
}
