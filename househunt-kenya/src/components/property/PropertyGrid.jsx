import PropertyCard from "./PropertyCard";

export default function PropertyGrid({
  properties = [],
  onView,
  user,
  onDel,
  className = "pgrid",
  emptyState = null,
}) {
  if (!properties.length) {
    return emptyState ? <div className={className}>{emptyState}</div> : <div className={className} />;
  }

  return (
    <div className={className}>
      {properties.map((property) => (
        <PropertyCard
          key={property.id}
          p={property}
          onView={onView}
          user={user}
          onDel={onDel}
        />
      ))}
    </div>
  );
}
