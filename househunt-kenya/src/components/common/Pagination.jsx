import Button from "./Button";

export default function Pagination({
  pagination,
  onPageChange,
  loading = false,
  ariaLabel = "Result pages",
  totalLabel = "items",
  className = "property-pagination",
  summaryClassName,
  style,
}) {
  if (!pagination || pagination.totalPages <= 1) return null;

  return (
    <nav className={className} aria-label={ariaLabel} style={style}>
      <Button
        variant="ghost"
        disabled={!pagination.hasPrevPage || loading}
        onClick={() => onPageChange(pagination.page - 1)}
      >
        Previous
      </Button>
      <span className={summaryClassName} aria-live="polite">
        Page {pagination.page} of {pagination.totalPages}
        {pagination.total != null && ` · ${pagination.total} ${totalLabel}`}
      </span>
      <Button
        variant="ghost"
        disabled={!pagination.hasNextPage || loading}
        onClick={() => onPageChange(pagination.page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
