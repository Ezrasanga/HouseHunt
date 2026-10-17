import Badge from "../common/Badge";
import Button from "../common/Button";
import Card from "../common/Card";
import Icon from "../common/Icon";

export default function PropertyCard({ p, onView, user, onDel, isFavorite = false, onToggleFavorite }) {
  const KES = n => `KSh ${Number(n).toLocaleString()}`;
  const canDel = user?.role === "admin" || (user?.role === "landlord" && p.landlordId === user.data.id);
  const cover = p.media?.find(m => m.type === "image");

  return (
    <Card as="article" className={`pcard${p.boosted ? " boosted" : ""}${p.status === "taken" ? " taken" : ""}${p.flagged ? " flagged" : ""}`}>
      {p.boosted && <div className="crown"><Icon name="star" /> Featured Listing</div>}
      <button type="button" className="pthumb" onClick={() => onView(p)} aria-label={`View details for ${p.title}`}>
        <div className="pthumb-bg" style={{ background: `linear-gradient(135deg,${p.color}cc,${p.color}77)` }} />
        {cover ? (
          <>
            <img src={cover.url} alt={p.title} loading="lazy" decoding="async" />
            <div className="pthumb-ov" />
          </>
        ) : (
          <div className="pthumb-empty"><span>{p.initials}</span><small>Photo coming soon</small></div>
        )}
        <span className="pinit">{p.initials}</span>
        <div className="ptyp">{p.type}</div>
        {p.status === "taken" && <div className="ptaken">Taken</div>}
        {p.flagged && <div className="pflag"><Icon name="flag" /> Flagged</div>}
        {p.media?.length > 0 && <div className="pmcnt"><Icon name="camera" /> {p.media.length}</div>}
      </button>
      <div className="pbody">
        <div className="ptitle">{p.title}</div>
        <div className="ploc"><Icon name="mapPin" /> {p.location}</div>
        <div className="ptrust"><span className="pverified">{p.approved ? <><Icon name="checkCircle" /> Admin reviewed</> : <><Icon name="clock" /> Pending review</>}</span><Badge className={`pavailability ${p.status === "available" ? "available" : "taken"}`}>{p.status === "available" ? "Available" : p.status === "pending" ? "Pending" : "Taken"}</Badge></div>
        <div className="pmeta">
          <div className="prent">{KES(p.rent)}<sub>/mo</sub></div>
          <div className="prooms">{p.rooms}</div>
        </div>
        <div className="tags">{p.tags.slice(0, 3).map(t => <span key={t} className="tag">{t}</span>)}</div>
        <div className="pfoot">
          <Button className="pvbtn" onClick={() => onView(p)}>View Details →</Button>
          <Button title={isFavorite ? "Remove saved home" : "Save home"} className={`pfavbtn${isFavorite ? " saved" : ""}`} onClick={() => onToggleFavorite?.(p.id)} aria-label={isFavorite ? `Remove ${p.title} from saved homes` : `Save ${p.title}`} aria-pressed={isFavorite}>{isFavorite ? "♥" : "♡"}</Button>
          {canDel && <Button className="pdbtn" title="Delete property" onClick={e => { e.stopPropagation(); onDel(p.id); }} aria-label={`Delete ${p.title}`}><Icon name="trash" /></Button>}
        </div>
      </div>
    </Card>
  );
}
