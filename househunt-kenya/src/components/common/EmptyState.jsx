export default function EmptyState({ children, className = "empty-adm", role }) {
  return (
    <div className={className} role={role}>
      {typeof children === "string" ? <p>{children}</p> : children}
    </div>
  );
}
