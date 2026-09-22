import PropertyCard from "./PropertyCard";

export default function PropertyGrid({
  properties = [],
  onView,
  user,
  onDel,
  favorites = [],
  onToggleFavorite,
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
          isFavorite={favorites.includes(property.id)}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}
