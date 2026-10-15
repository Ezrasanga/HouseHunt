export default function PropertyPagination({ pagination, onPageChange, loading = false }) {
  if (!pagination || pagination.totalPages <= 1) return null;

  return (
    <nav className="property-pagination" aria-label="Property result pages">
      <button
        type="button"
        className="bghost"
        disabled={!pagination.hasPrevPage || loading}
        onClick={() => onPageChange(pagination.page - 1)}
      >
        Previous
      </button>
      <span aria-live="polite">
        Page {pagination.page} of {pagination.totalPages} · {pagination.total} homes
      </span>
      <button
        type="button"
        className="bghost"
        disabled={!pagination.hasNextPage || loading}
        onClick={() => onPageChange(pagination.page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
