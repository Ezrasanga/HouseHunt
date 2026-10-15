import { useCallback, useEffect, useState } from "react";
import { getAuditEvents } from "../../services/auditService";

export default function AdminActivityLog() {
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEvents = useCallback(async requestedPage => {
    setLoading(true);
    setError("");
    try {
      const result = await getAuditEvents({ page: requestedPage, limit: 50 });
      setEvents(result.events);
      setPagination(result.pagination);
      setPage(requestedPage);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Unable to load the audit log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadEvents(1); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadEvents]);

  return (
    <div className="atab">
      <h3>Activity Log</h3>
      <p className="sub">Persisted platform activity recorded by the server.</p>
      <button type="button" className="bghost" onClick={() => void loadEvents(page)} disabled={loading}>
        {loading ? "Loading…" : "Refresh activity"}
      </button>
      {error && <div className="form-error" role="alert">{error}</div>}
      {loading && <div className="empty-adm"><p>Loading activity…</p></div>}
      {!loading && !error && events.length === 0 && <div className="empty-adm"><p>No activity has been recorded yet.</p></div>}
      {!loading && !error && events.length > 0 && (
        <div className="actlog">
          {events.map(event => (
            <div key={event.id} className="actrow">
              <div className={`actdot ${event.outcome === "FAILURE" ? "warn" : "info"}`} />
              <span className="actt">{new Date(event.createdAt).toLocaleString("en-KE")}</span>
              <span className="acta">{event.action}</span>
              <span className="actd">— {event.description} · {event.actor?.name || "System"} ({event.actor?.role || "SYSTEM"})</span>
            </div>
          ))}
        </div>
      )}
      {pagination && pagination.totalPages > 1 && (
        <div className="property-pagination">
          <button type="button" className="bghost" disabled={!pagination.hasPrevPage || loading} onClick={() => void loadEvents(page - 1)}>Previous</button>
          <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total} events</span>
          <button type="button" className="bghost" disabled={!pagination.hasNextPage || loading} onClick={() => void loadEvents(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
