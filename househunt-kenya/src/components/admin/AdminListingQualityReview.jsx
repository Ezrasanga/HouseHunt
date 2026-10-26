import { useEffect, useState } from "react";
import {
  dismissListingQualityReview,
  getListingQualityReviews,
} from "../../services/propertyService";

function locationLabel(property) {
  const location = property?.location || {};
  return [location.estate, location.town, location.county].filter(Boolean).join(", ") || "Location unavailable";
}

export default function AdminListingQualityReview({ onView, onTakeOffline }) {
  const [listings, setListings] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");

  useEffect(() => {
    let active = true;
    getListingQualityReviews({ page, limit: 25 })
      .then(result => {
        if (!active) return;
        setListings(result.listings);
        setPagination(result.pagination);
      })
      .catch(requestError => {
        if (active) setError(requestError.response?.data?.message || requestError.message || "Could not load listing quality reviews.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [page, refreshKey]);

  const dismiss = async listing => {
    setUpdatingId(listing.id);
    setError("");
    try {
      await dismissListingQualityReview(listing.id);
      setListings(current => current.filter(item => item.id !== listing.id));
      setRefreshKey(value => value + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Could not dismiss these flags.");
    } finally {
      setUpdatingId("");
    }
  };

  const takeOffline = async listing => {
    setUpdatingId(listing.id);
    setError("");
    try {
      await onTakeOffline(listing.id);
      setListings(current => current.filter(item => item.id !== listing.id));
      setRefreshKey(value => value + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Could not take this listing offline.");
    } finally {
      setUpdatingId("");
    }
  };

  return (
    <section className="atab listing-quality-review" aria-labelledby="listing-quality-title">
      <div className="listing-quality-heading">
        <div>
          <h3 id="listing-quality-title">Listing Quality Review</h3>
          <p className="sub">Review possible issues before deciding what to do. Signals are advisory and never hide listings automatically.</p>
        </div>
        <button
          type="button"
          className="bghost"
          disabled={loading}
          onClick={() => { setError(""); setLoading(true); setRefreshKey(value => value + 1); }}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className="listing-quality-rules">
        Checks flag descriptions under 80 characters, listings without photos or an estate/neighbourhood, matching listings from the same landlord, and prices more than 4x above or below the median of at least three other approved, available listings of the same type in that town.
      </div>
      {error && <p className="availability-report-error" role="alert">{error}</p>}
      {loading && listings.length === 0 && <p className="availability-report-empty" role="status">Loading quality review queue…</p>}
      {!loading && !error && listings.length === 0 && (
        <p className="availability-report-empty">No listings currently need quality review.</p>
      )}
      <div className="availability-report-list">
        {listings.map(listing => (
          <article className="availability-report-card" key={listing.id}>
            <div className="availability-report-card-head">
              <div>
                <h4>{listing.title}</h4>
                <p>{locationLabel(listing)} · {listing.type} · KSh {Number(listing.rent).toLocaleString()}/mo</p>
              </div>
              <span className={`availability-report-status ${listing.approved ? "status-resolved" : "status-open"}`}>
                {listing.approved ? "LIVE" : "PENDING"}
              </span>
            </div>
            <dl className="availability-report-meta">
              <div><dt>Landlord</dt><dd>{listing.landlord?.name || listing.landlordId || "Unknown"}</dd></div>
              <div><dt>Details</dt><dd>{listing.rooms} · {listing.media?.length || 0} photos</dd></div>
            </dl>
            <ul className="listing-quality-reasons">
              {listing.qualityReasons.map(reason => <li key={reason.code}>{reason.label}</li>)}
            </ul>
            <div className="availability-report-actions">
              <button type="button" className="bghost" onClick={() => onView(listing)} disabled={Boolean(updatingId)}>View listing</button>
              {!listing.flagged && (
                <button type="button" className="bban" onClick={() => void takeOffline(listing)} disabled={Boolean(updatingId)}>
                  {updatingId === listing.id ? "Updating…" : "Take offline"}
                </button>
              )}
              <button type="button" className="bapp" onClick={() => void dismiss(listing)} disabled={Boolean(updatingId)}>
                {updatingId === listing.id ? "Updating…" : "Dismiss flags"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {pagination && pagination.totalPages > 1 && (
        <div className="availability-report-pagination">
          <button type="button" className="bghost" onClick={() => { setLoading(true); setPage(value => Math.max(1, value - 1)); }} disabled={!pagination.hasPrevPage || loading}>Previous</button>
          <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total} listings</span>
          <button type="button" className="bghost" onClick={() => { setLoading(true); setPage(value => value + 1); }} disabled={!pagination.hasNextPage || loading}>Next</button>
        </div>
      )}
    </section>
  );
}
