import test from 'node:test';
import assert from 'node:assert/strict';

import AvailabilityReport from '../models/AvailabilityReport.js';
import Property from '../models/Property.js';
import availabilityReportRouter from '../routes/availabilityReports.js';
import {
  createAvailabilityReport,
  listAvailabilityReports,
  reviewAvailabilityReport,
} from '../services/availabilityReportService.js';

const originalReportCreate = AvailabilityReport.create;
const originalReportFind = AvailabilityReport.find;
const originalReportFindOne = AvailabilityReport.findOne;
const originalReportFindOneAndUpdate = AvailabilityReport.findOneAndUpdate;
const originalReportCountDocuments = AvailabilityReport.countDocuments;
const originalPropertyFindById = Property.findById;

test.afterEach(() => {
  AvailabilityReport.create = originalReportCreate;
  AvailabilityReport.find = originalReportFind;
  AvailabilityReport.findOne = originalReportFindOne;
  AvailabilityReport.findOneAndUpdate = originalReportFindOneAndUpdate;
  AvailabilityReport.countDocuments = originalReportCountDocuments;
  Property.findById = originalPropertyFindById;
});

const tenant = { id: '507f191e810c19729de860ea', role: 'TENANT' };
const admin = { id: '507f191e810c19729de860eb', role: 'ADMIN' };
const propertyId = '507f191e810c19729de860ec';
const reportId = '507f191e810c19729de860ed';

test('availability report routes restrict tenant submissions and admin review', () => {
  const createRoute = availabilityReportRouter.stack.find(layer => layer.route?.path === '/properties/:propertyId');
  const listRoute = availabilityReportRouter.stack.find(layer => layer.route?.path === '/');
  const reviewRoute = availabilityReportRouter.stack.find(layer => layer.route?.path === '/:id');

  assert.ok(createRoute);
  assert.equal(createRoute.route.methods.post, true);
  assert.equal(createRoute.route.stack.length, 3);
  assert.equal(listRoute.route.methods.get, true);
  assert.equal(listRoute.route.stack.length, 3);
  assert.equal(reviewRoute.route.methods.patch, true);
  assert.equal(reviewRoute.route.stack.length, 3);
});

test('tenant can report an approved available listing once', async () => {
  Property.findById = () => ({ select: async () => ({ isApproved: true, status: 'AVAILABLE' }) });
  AvailabilityReport.findOne = () => ({ lean: async () => null });
  AvailabilityReport.create = async report => ({ _id: reportId, ...report, status: 'OPEN', createdAt: new Date() });

  const result = await createAvailabilityReport(propertyId, tenant, {
    reason: 'already-rented',
    details: 'The landlord confirmed the unit has been rented.',
  });

  assert.equal(result.report.id, reportId);
  assert.equal(result.report.status, 'OPEN');
});

test('availability report rejects duplicate open reports and invalid listing states', async () => {
  Property.findById = () => ({ select: async () => ({ isApproved: true, status: 'AVAILABLE' }) });
  AvailabilityReport.findOne = () => ({ lean: async () => ({ _id: reportId }) });

  await assert.rejects(
    createAvailabilityReport(propertyId, tenant, { reason: 'other' }),
    error => error.status === 409 && /open report/.test(error.message)
  );

  AvailabilityReport.findOne = () => ({ lean: async () => null });
  Property.findById = () => ({ select: async () => ({ isApproved: true, status: 'OCCUPIED' }) });
  await assert.rejects(
    createAvailabilityReport(propertyId, tenant, { reason: 'other' }),
    error => error.status === 409
  );
});

test('availability reports require a tenant and a supported reason', async () => {
  await assert.rejects(
    createAvailabilityReport(propertyId, admin, { reason: 'other' }),
    error => error.status === 403
  );
  await assert.rejects(
    createAvailabilityReport(propertyId, tenant, { reason: 'made-up' }),
    error => error.status === 400
  );
});

test('admin can list reports with bounded pagination', async () => {
  const report = {
    _id: reportId,
    reason: 'already-rented',
    details: '',
    status: 'OPEN',
    createdAt: new Date(),
    property: { _id: propertyId, title: 'Listing', status: 'AVAILABLE', location: {} },
    reporter: { _id: tenant.id, firstName: 'Tenant', lastName: 'Example', email: 'tenant@example.test' },
  };
  let query;
  AvailabilityReport.find = filter => {
    query = { filter };
    return {
      sort(value) { query.sort = value; return this; },
      skip(value) { query.skip = value; return this; },
      limit(value) { query.limit = value; return this; },
      populate() { return this; },
      lean: async () => [report],
    };
  };
  AvailabilityReport.countDocuments = async () => 51;

  const result = await listAvailabilityReports(admin, { page: '2', limit: '25', status: 'OPEN' });

  assert.deepEqual(query.filter, { status: 'OPEN' });
  assert.equal(query.skip, 25);
  assert.equal(query.limit, 25);
  assert.equal(result.reports[0].property.title, 'Listing');
  assert.equal(result.pagination.totalPages, 3);
  await assert.rejects(
    listAvailabilityReports(tenant, {}),
    error => error.status === 403
  );
});

test('admin can close an open report without changing the property', async () => {
  let update;
  const report = {
    _id: reportId,
    reason: 'already-rented',
    details: '',
    status: 'RESOLVED',
    resolutionNote: 'Contacted landlord and verified the update.',
    createdAt: new Date(),
    reviewedAt: new Date(),
    property: { _id: propertyId, title: 'Listing', status: 'AVAILABLE', location: {} },
    reporter: { _id: tenant.id, firstName: 'Tenant', lastName: 'Example' },
    reviewedBy: { _id: admin.id, firstName: 'Admin', lastName: 'Example' },
  };
  AvailabilityReport.findOneAndUpdate = (filter, values) => {
    update = { filter, values };
    return {
      populate() { return this; },
      lean: async () => report,
    };
  };

  const result = await reviewAvailabilityReport(reportId, admin, {
    status: 'RESOLVED',
    resolutionNote: 'Contacted landlord and verified the update.',
  });

  assert.deepEqual(update.filter, { _id: reportId, status: 'OPEN' });
  assert.equal(update.values.$set.status, 'RESOLVED');
  assert.equal(result.report.status, 'RESOLVED');
  assert.equal(result.report.property.status, 'AVAILABLE');
});

test('admin report review accepts only final statuses', async () => {
  await assert.rejects(
    reviewAvailabilityReport(reportId, admin, { status: 'OPEN' }),
    error => error.status === 400
  );
});
