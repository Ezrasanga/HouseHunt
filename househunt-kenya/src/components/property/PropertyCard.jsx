export default function PropertyCard({ p, onView, user, onDel }) {
  const KES = n => `KSh ${Number(n).toLocaleString()}`;
  const canDel = user?.role === "admin" || (user?.role === "landlord" && p.landlordId === user.data.id);
  const cover = p.media?.find(m => m.type === "image");

  return (
    <div className={`pcard${p.boosted ? " boosted" : ""}${p.status === "taken" ? " taken" : ""}${p.flagged ? " flagged" : ""}`}>
      {p.boosted && <div className="crown">⭐ Featured Listing</div>}
      <div className="pthumb" onClick={() => onView(p)}>
        <div className="pthumb-bg" style={{ background: `linear-gradient(135deg,${p.color}cc,${p.color}77)` }} />
        {cover && <img src={cover.url} alt={p.title} />}
        {cover && <div className="pthumb-ov" />}
        <span className="pinit">{p.initials}</span>
        <div className="ptyp">{p.type}</div>
        {p.status === "taken" && <div className="ptaken">⊘ Taken</div>}
        {p.flagged && <div className="pflag">🚩 Flagged</div>}
        {p.media?.length > 0 && <div className="pmcnt">📷 {p.media.length}</div>}
      </div>
      <div className="pbody">
        <div className="ptitle">{p.title}</div>
        <div className="ploc">📍 {p.location}</div>
        <div className="pmeta">
          <div className="prent">{KES(p.rent)}<sub>/mo</sub></div>
          <div className="prooms">{p.rooms}</div>
        </div>
        <div className="tags">{p.tags.slice(0, 3).map(t => <span key={t} className="tag">{t}</span>)}</div>
        <div className="pfoot">
          <button className="pvbtn" onClick={() => onView(p)}>View Details →</button>
          {canDel && <button className="pdbtn" onClick={e => { e.stopPropagation(); onDel(p.id); }}>🗑</button>}
        </div>
      </div>
    </div>
  );
}
