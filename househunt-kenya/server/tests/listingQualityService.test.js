import test from 'node:test';
import assert from 'node:assert/strict';

import Property from '../models/Property.js';
import propertyRouter from '../routes/properties.js';
import {
  dismissListingQualityReview,
  evaluateListingQuality,
  listListingQualityReviews,
} from '../services/listingQualityService.js';

const originalPropertyFind = Property.find;
const originalPropertyFindOneAndUpdate = Property.findOneAndUpdate;

test.afterEach(() => {
  Property.find = originalPropertyFind;
  Property.findOneAndUpdate = originalPropertyFindOneAndUpdate;
});

const admin = { id: '507f191e810c19729de860ea', role: 'ADMIN' };
const landlordId = '507f191e810c19729de860eb';

function listing(id, overrides = {}) {
  return {
    _id: id,
    owner: landlordId,
    title: `Home ${id}`,
    description: 'A comfortable rental home with natural light and convenient access to local services.',
    price: 100000,
    propertyType: 'Apartment',
    location: { county: 'Nairobi', town: 'Nairobi', estate: 'Kilimani' },
    bedrooms: 2,
    bathrooms: 1,
    images: ['photo.jpg'],
    status: 'AVAILABLE',
    isApproved: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

test('quality checks report missing details, potential duplicates, and price outliers', () => {
  const base = listing('listing-1', {
    title: 'Shared title',
    description: 'Small description',
    images: [],
    location: { county: 'Nairobi', town: 'Nairobi', estate: '' },
  });
  const duplicate = listing('listing-2', {
    title: '  SHARED   TITLE ',
    location: { county: 'Nairobi', town: 'nairobi', estate: '' },
  });
  const comparables = [
    listing('listing-3', { title: 'Comparable 1', owner: 'landlord-2', price: 90000 }),
    listing('listing-4', { title: 'Comparable 2', owner: 'landlord-3', price: 100000 }),
    listing('listing-5', { title: 'Comparable 3', owner: 'landlord-4', price: 110000 }),
    listing('listing-outlier', { title: 'Unusually cheap', owner: 'landlord-5', price: 1000 }),
  ];

  const results = evaluateListingQuality([
    base,
    duplicate,
    ...comparables,
    listing('listing-hidden', { status: 'HIDDEN' }),
  ]);
  const result = results.find(item => item.id === 'listing-1');
  const codes = result.reasons.map(reason => reason.code);

  assert.ok(codes.includes('short-description'));
  assert.ok(codes.includes('no-photos'));
  assert.ok(codes.includes('missing-area'));
  assert.ok(codes.includes('possible-duplicate'));
  assert.equal(results.some(item => item.id === 'listing-hidden'), false);
  assert.ok(results.find(item => item.id === 'listing-outlier').reasons.some(reason => reason.code === 'price-outlier'));
});

test('price outliers require three other approved available comparables and use their median', () => {
  const comparables = [
    listing('comparable-1', { owner: 'landlord-1', price: 90000 }),
    listing('comparable-2', { owner: 'landlord-2', price: 100000 }),
    listing('comparable-3', { owner: 'landlord-3', price: 110000 }),
  ];
  const qualityReasons = property => (
    evaluateListingQuality([...comparables, property])
      .find(result => result.id === property._id)?.reasons || []
  );

  assert.equal(qualityReasons(listing('exactly-four-times', { price: 400000 })).some(reason => reason.code === 'price-outlier'), false);
  assert.equal(qualityReasons(listing('above-four-times', { price: 400001 })).some(reason => reason.code === 'price-outlier'), true);
  assert.equal(qualityReasons(listing('exactly-quarter', { price: 25000 })).some(reason => reason.code === 'price-outlier'), false);
  assert.equal(qualityReasons(listing('below-quarter', { price: 24999 })).some(reason => reason.code === 'price-outlier'), true);
  assert.equal(
    evaluateListingQuality([comparables[0], comparables[1], listing('only-two-comps', { price: 1 })])
      .some(result => result.id === 'only-two-comps'),
    false
  );
  assert.equal(
    evaluateListingQuality([...comparables.slice(0, 2), listing('pending-comparison', { isApproved: false }), listing('only-two-live-comps', { price: 1 })])
      .some(result => result.id === 'only-two-live-comps'),
    false
  );
});

test('dismissed quality flags stay out of the review queue until listing edits clear dismissal', () => {
  const dismissedListing = listing('listing-dismissed', {
    description: 'Brief',
    images: [],
    qualityReviewDismissedAt: new Date(),
    qualityReviewDismissedBy: admin.id,
  });

  assert.equal(evaluateListingQuality([dismissedListing]).length, 0);
  assert.ok(evaluateListingQuality([{ ...dismissedListing, qualityReviewDismissedAt: null, qualityReviewDismissedBy: null }]).length > 0);
});

test('quality-review endpoints require admin access', () => {
  const getRoute = propertyRouter.stack.find(layer => layer.route?.path === '/quality-review');
  const dismissRoute = propertyRouter.stack.find(layer => layer.route?.path === '/:id/quality-review/dismiss');

  assert.ok(getRoute);
  assert.equal(getRoute.route.methods.get, true);
  assert.equal(getRoute.route.stack.length, 3);
  assert.ok(dismissRoute);
  assert.equal(dismissRoute.route.methods.patch, true);
  assert.equal(dismissRoute.route.stack.length, 3);
});

test('admin quality review queue filters hidden listings and paginates quality signals', async () => {
  const properties = [
    listing('listing-a', { description: 'Brief', images: [] }),
    listing('listing-b', { description: 'Brief', images: [] }),
  ];
  let filter;
  let selected;
  Property.find = value => {
    filter = value;
    return {
      select(valueSelected) { selected = valueSelected; return this; },
      populate() { return this; },
      lean: async () => properties,
    };
  };

  const result = await listListingQualityReviews(admin, { page: '2', limit: '1' });

  assert.deepEqual(filter, { status: { $ne: 'HIDDEN' } });
  assert.match(selected, /qualityReviewDismissedAt/);
  assert.equal(result.listings.length, 1);
  assert.equal(result.pagination.page, 2);
  assert.equal(result.pagination.total, 2);
});

test('quality review queue rejects non-admin access', async () => {
  await assert.rejects(
    listListingQualityReviews({ id: landlordId, role: 'LANDLORD' }),
    error => error.status === 403
  );
});

test('admin can dismiss quality flags for an existing listing', async () => {
  let query;
  let update;
  Property.findOneAndUpdate = async (filter, values) => {
    query = filter;
    update = values;
    return { _id: '507f191e810c19729de860ec', qualityReviewDismissedAt: new Date() };
  };

  const result = await dismissListingQualityReview('507f191e810c19729de860ec', admin);

  assert.deepEqual(query, { _id: '507f191e810c19729de860ec', status: { $ne: 'HIDDEN' } });
  assert.equal(update.$set.qualityReviewDismissedBy, admin.id);
  assert.equal(result.propertyId, '507f191e810c19729de860ec');
});

test('only admins can dismiss quality flags', async () => {
  await assert.rejects(
    dismissListingQualityReview('507f191e810c19729de860ec', { id: landlordId, role: 'LANDLORD' }),
    error => error.status === 403
  );
});
