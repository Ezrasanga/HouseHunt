import mongoose from 'mongoose';
import Property from '../models/Property.js';
import { normalizeId } from './propertyService.js';

const MIN_DESCRIPTION_LENGTH = 80;
const MIN_COMPARABLES = 3;
const LOW_PRICE_RATIO = 0.25;
const HIGH_PRICE_RATIO = 4;
const REVIEW_FIELDS = [
  'title',
  'description',
  'price',
  'propertyType',
  'location',
  'bedrooms',
  'bathrooms',
  'images',
  'owner',
  'status',
  'isApproved',
  'qualityReviewDismissedAt',
  'qualityReviewDismissedBy',
];

function makeError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireAdmin(actor) {
  if (!actor?.id) throw makeError('Authentication required', 401);
  if (String(actor.role).toUpperCase() !== 'ADMIN') {
    throw makeError('Only admins can review listing quality', 403);
  }
}

function normalized(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function duplicateKey(property) {
  const location = property.location || {};
  return [
    normalizeId(property.owner),
    normalized(property.title),
    normalized(property.propertyType),
    normalized(location.town),
    normalized(location.estate),
    Number(property.bedrooms),
  ].join('|');
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function evaluateListingQuality(properties) {
  const visibleProperties = properties.filter(property => property.status !== 'HIDDEN');
  const comparableProperties = visibleProperties.filter(
    property => property.status === 'AVAILABLE' && property.isApproved
  );
  const groups = new Map();
  const duplicateGroups = new Map();

  comparableProperties.forEach(property => {
    const town = normalized(property.location?.town);
    const key = `${normalized(property.propertyType)}|${town}`;
    if (!groups.has(key)) groups.set(key, []);
    if (Number.isFinite(Number(property.price)) && Number(property.price) > 0) {
      groups.get(key).push(property);
    }

    const keyForDuplicate = duplicateKey(property);
    if (!duplicateGroups.has(keyForDuplicate)) duplicateGroups.set(keyForDuplicate, []);
    duplicateGroups.get(keyForDuplicate).push(property);
  });

  return visibleProperties.flatMap(property => {
    const reasons = [];
    const description = String(property.description || '').trim();
    const images = Array.isArray(property.images) ? property.images : [];
    const ownerId = normalizeId(property.owner);
    const dupes = duplicateGroups.get(duplicateKey(property)) || [];

    if (description.length < MIN_DESCRIPTION_LENGTH) {
      reasons.push({
        code: 'short-description',
        label: `Description is brief (${description.length} characters; aim for at least ${MIN_DESCRIPTION_LENGTH}).`,
      });
    }
    if (images.length === 0) {
      reasons.push({ code: 'no-photos', label: 'No listing photos have been provided.' });
    }
    if (!String(property.location?.estate || '').trim()) {
      reasons.push({ code: 'missing-area', label: 'Estate or neighbourhood is not specified.' });
    }
    if (Number(property.price) <= 0) {
      reasons.push({ code: 'invalid-price', label: 'Monthly price is zero or less.' });
    } else {
      const priceKey = `${normalized(property.propertyType)}|${normalized(property.location?.town)}`;
      const comparableListings = (groups.get(priceKey) || []).filter(
        comparable => normalizeId(comparable._id) !== normalizeId(property._id)
      );
      const comparablePrices = comparableListings.map(comparable => Number(comparable.price));
      const townMedian = median(comparablePrices);
      if (
        comparablePrices.length >= MIN_COMPARABLES
        && townMedian > 0
        && (Number(property.price) < townMedian * LOW_PRICE_RATIO
          || Number(property.price) > townMedian * HIGH_PRICE_RATIO)
      ) {
        reasons.push({
          code: 'price-outlier',
          label: `Monthly price is a strong outlier against ${comparablePrices.length} other approved, available listings of this type in this town (median KSh ${Math.round(townMedian).toLocaleString()}). Verify the amount.`,
        });
      }
    }
    if (dupes.length > 1) {
      const otherIds = dupes
        .filter(candidate => normalizeId(candidate._id) !== normalizeId(property._id))
        .map(candidate => String(candidate._id));
      if (otherIds.length) {
        reasons.push({
          code: 'possible-duplicate',
          label: `Possible duplicate: same landlord, title, property type, bedrooms, and neighbourhood as listing${otherIds.length === 1 ? '' : 's'} ${otherIds.join(', ')}.`,
        });
      }
    }

    const dismissedAt = property.qualityReviewDismissedAt;
    const dismissed = dismissedAt && property.qualityReviewDismissedBy;
    return reasons.length && !dismissed
      ? [{
          id: String(property._id),
          title: property.title,
          description: property.description,
          price: property.price,
          propertyType: property.propertyType,
          location: property.location,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          images,
          status: property.status,
          isApproved: Boolean(property.isApproved),
          createdAt: property.createdAt,
          landlordId: ownerId,
          landlord: property.owner && typeof property.owner === 'object'
            ? {
                id: ownerId,
                name: [property.owner.firstName, property.owner.lastName].filter(Boolean).join(' '),
                email: property.owner.email || '',
              }
            : null,
          reasons,
        }]
      : [];
  });
}

export async function listListingQualityReviews(actor, query = {}) {
  requireAdmin(actor);
  const page = Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit || '25'), 10) || 25));
  const properties = await Property.find({ status: { $ne: 'HIDDEN' } })
    .select(REVIEW_FIELDS.join(' '))
    .populate('owner', 'firstName lastName email')
    .lean();
  const reviews = evaluateListingQuality(properties);
  const total = reviews.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    listings: reviews
      .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
      .slice((page - 1) * limit, page * limit),
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

export async function dismissListingQualityReview(id, actor) {
  requireAdmin(actor);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError('Property not found', 404);
  }
  const updatedProperty = await Property.findOneAndUpdate(
    { _id: id, status: { $ne: 'HIDDEN' } },
    {
      $set: {
        qualityReviewDismissedAt: new Date(),
        qualityReviewDismissedBy: actor.id,
      },
    },
    { new: true }
  );
  if (!updatedProperty) throw makeError('Property not found', 404);
  return { propertyId: String(updatedProperty._id), dismissedAt: updatedProperty.qualityReviewDismissedAt };
}
