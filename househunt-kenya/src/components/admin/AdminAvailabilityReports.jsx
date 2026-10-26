import { useEffect, useState } from "react";
import {
  getAvailabilityReports,
  reviewAvailabilityReport,
} from "../../services/availabilityReportService";

const REASONS = {
  "already-rented": "Already rented or occupied",
  "landlord-unresponsive": "Landlord says it is unavailable",
  "incorrect-details": "Listing details appear incorrect",
  other: "Other availability concern",
};

function dateLabel(value) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

export default function AdminAvailabilityReports() {
  const [status, setStatus] = useState("OPEN");
  const [page, setPage] = useState(1);
  const [reports, setReports] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewingId, setReviewingId] = useState("");
  const [notes, setNotes] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    getAvailabilityReports({ status, page, limit: 25 })
      .then(result => {
        if (!active) return;
        setReports(result.reports || []);
        setPagination(result.pagination || null);
      })
      .catch(loadError => {
        if (active) setError(loadError.response?.data?.message || loadError.message || "Could not load availability reports.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [page, refreshKey, status]);

  const review = async (report, nextStatus) => {
    setReviewingId(report.id);
    setError("");
    try {
      await reviewAvailabilityReport(report.id, {
        status: nextStatus,
        resolutionNote: notes[report.id] || "",
      });
      setLoading(true);
      setRefreshKey(value => value + 1);
    } catch (reviewError) {
      setError(reviewError.response?.data?.message || reviewError.message || "Could not update this report.");
    } finally {
      setReviewingId("");
    }
  };

  return (
    <section className="atab availability-reports" aria-labelledby="availability-reports-title">
      <div className="availability-reports-heading">
        <div>
          <h3 id="availability-reports-title">Availability Reports</h3>
          <p className="sub">Review tenant reports. Reports do not change listing availability automatically.</p>
        </div>
        <button type="button" className="bghost" onClick={() => { setError(""); setLoading(true); setRefreshKey(value => value + 1); }} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="availability-reports-filter">
        <label htmlFor="availability-report-status">Show reports</label>
        <select
          id="availability-report-status"
          value={status}
          onChange={event => { setError(""); setLoading(true); setPage(1); setStatus(event.target.value); }}
        >
          <option value="OPEN">Open</option>
          <option value="RESOLVED">Resolved</option>
          <option value="DISMISSED">Dismissed</option>
          <option value="ALL">All reports</option>
        </select>
      </div>

      {error && <p className="availability-report-error" role="alert">{error}</p>}
      {loading && reports.length === 0 && <p className="availability-report-empty">Loading availability reports…</p>}
      {!loading && !error && reports.length === 0 && (
        <p className="availability-report-empty">No {status === "ALL" ? "" : `${status.toLowerCase()} `}availability reports found.</p>
      )}

      <div className="availability-report-list">
        {reports.map(report => (
          <article className="availability-report-card" key={report.id}>
            <div className="availability-report-card-head">
              <div>
                <h4>{report.property?.title || "Listing no longer available"}</h4>
                <p>{[report.property?.location?.estate, report.property?.location?.town, report.property?.location?.county].filter(Boolean).join(", ") || "Location unavailable"}</p>
              </div>
              <span className={`availability-report-status status-${report.status.toLowerCase()}`}>{report.status}</span>
            </div>
            <dl className="availability-report-meta">
              <div><dt>Reason</dt><dd>{REASONS[report.reason] || report.reason}</dd></div>
              <div><dt>Listing status</dt><dd>{report.property?.status || "Deleted"}</dd></div>
              <div><dt>Submitted</dt><dd>{dateLabel(report.createdAt)}</dd></div>
              <div><dt>Reported by</dt><dd>{report.reporter?.name || "Unknown tenant"}{report.reporter?.email ? ` · ${report.reporter.email}` : ""}</dd></div>
            </dl>
            {report.details && <p className="availability-report-details">{report.details}</p>}
            {report.resolutionNote && <p className="availability-report-details"><strong>Admin note:</strong> {report.resolutionNote}</p>}
            {report.status === "OPEN" && (
              <div className="availability-report-review">
                <label htmlFor={`availability-review-note-${report.id}`}>Review note (optional)</label>
                <textarea
                  id={`availability-review-note-${report.id}`}
                  maxLength={500}
                  value={notes[report.id] || ""}
                  onChange={event => setNotes(current => ({ ...current, [report.id]: event.target.value }))}
                  rows={2}
                />
                <div className="availability-report-actions">
                  <button type="button" className="bp" onClick={() => void review(report, "RESOLVED")} disabled={Boolean(reviewingId)}>
                    {reviewingId === report.id ? "Saving…" : "Mark reviewed"}
                  </button>
                  <button type="button" className="bghost" onClick={() => void review(report, "DISMISSED")} disabled={Boolean(reviewingId)}>
                    Dismiss report
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="availability-report-pagination">
          <button type="button" className="bghost" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={!pagination.hasPrevPage || loading}>Previous</button>
          <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total} reports</span>
          <button type="button" className="bghost" onClick={() => setPage(value => value + 1)} disabled={!pagination.hasNextPage || loading}>Next</button>
        </div>
      )}
    </section>
  );
}
