export default function PropertyCard({ p, onView, user, onDel, isFavorite = false, onToggleFavorite }) {
  const KES = n => `KSh ${Number(n).toLocaleString()}`;
  const canDel = user?.role === "admin" || (user?.role === "landlord" && p.landlordId === user.data.id);
  const cover = p.media?.find(m => m.type === "image");

  return (
    <div className={`pcard${p.boosted ? " boosted" : ""}${p.status === "taken" ? " taken" : ""}${p.flagged ? " flagged" : ""}`}>
      {p.boosted && <div className="crown">⭐ Featured Listing</div>}
      <button type="button" className="pthumb" onClick={() => onView(p)} aria-label={`View details for ${p.title}`}>
        <div className="pthumb-bg" style={{ background: `linear-gradient(135deg,${p.color}cc,${p.color}77)` }} />
        {cover ? (
          <>
            <img src={cover.url} alt={p.title} />
            <div className="pthumb-ov" />
          </>
        ) : (
          <div className="pthumb-empty"><span>{p.initials}</span><small>Photo coming soon</small></div>
        )}
        <span className="pinit">{p.initials}</span>
        <div className="ptyp">{p.type}</div>
        {p.status === "taken" && <div className="ptaken">⊘ Taken</div>}
        {p.flagged && <div className="pflag">🚩 Flagged</div>}
        {p.media?.length > 0 && <div className="pmcnt">📷 {p.media.length}</div>}
      </button>
      <div className="pbody">
        <div className="ptitle">{p.title}</div>
        <div className="ploc">📍 {p.location}</div>
        <div className="ptrust"><span className="pverified">{p.approved ? "✓ Verified listing" : "⏳ Pending approval"}</span><span className={`pavailability ${p.status === "available" ? "available" : "taken"}`}>{p.status === "available" ? "Available" : p.status === "pending" ? "Pending" : "Taken"}</span></div>
        <div className="pmeta">
          <div className="prent">{KES(p.rent)}<sub>/mo</sub></div>
          <div className="prooms">{p.rooms}</div>
        </div>
        <div className="tags">{p.tags.slice(0, 3).map(t => <span key={t} className="tag">{t}</span>)}</div>
        <div className="pfoot">
          <button className="pvbtn" onClick={() => onView(p)}>View Details →</button>
          <button type="button" title={isFavorite ? "Remove saved home" : "Save home"} className={`pfavbtn${isFavorite ? " saved" : ""}`} onClick={() => onToggleFavorite?.(p.id)} aria-label={isFavorite ? `Remove ${p.title} from saved homes` : `Save ${p.title}`} aria-pressed={isFavorite}>{isFavorite ? "♥" : "♡"}</button>
          {canDel && <button className="pdbtn" title="Delete property" onClick={e => { e.stopPropagation(); onDel(p.id); }} aria-label={`Delete ${p.title}`}>🗑</button>}
        </div>
      </div>
    </div>
  );
}
