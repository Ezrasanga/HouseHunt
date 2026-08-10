export default function PropertyDetails({ liveProp, landlord, user, isUnlocked, settings, setPayModal, setAuthModal, closeModal }) {
  const KES = n => `KSh ${Number(n).toLocaleString()}`;
  const statusKey = liveProp.status === "available" ? "av" : "tk";
  const isAvailable = liveProp.status === "available";
  const hasContact = liveProp.contact && (liveProp.contact.phone || liveProp.contact.whatsapp || liveProp.contact.email);

  return (
    <div className="mbody">
      <div className="mdetail-head">
        <div>
          <div className="mdetail-badges">
            <span className={`sbadge sb-${statusKey}`}>{isAvailable ? "✓ Available" : "⊘ Taken"}</span>
            {liveProp.boosted && <span className="sbadge sb-bo">⭐ Boosted</span>}
            {liveProp.flagged && <span className="sbadge sb-fl">🚩 Flagged</span>}
          </div>
          <h2 id="property-details-title" className="mdetail-title">{liveProp.title}</h2>
          <p className="mdetail-location">📍 {user?.role !== "tenant" || isUnlocked(liveProp.id) ? liveProp.location : "Location hidden — unlock to view"}</p>
          <div className="mdetail-meta-row">
            <span>{liveProp.type}</span>
            {liveProp.rooms && <span>{liveProp.rooms}</span>}
            <span>{liveProp.media?.length || 0} media</span>
          </div>
        </div>

        <div className="mdetail-rent-panel">
          <div className="mdetail-rent-label">Monthly rent</div>
          <div className="mdetail-rent-value">{KES(liveProp.rent)}</div>
          <div className="mdetail-rent-sub">per month</div>
        </div>
      </div>

      <div className="pd-grid">
        <div className="pd-left">
          <div className="pd-section">
            <h3>Property overview</h3>
            <div className="mdets">
              <div className="mdet"><div className="mdet-l">Type</div><div className="mdet-v">{liveProp.type}</div></div>
              <div className="mdet"><div className="mdet-l">Rent</div><div className="mdet-v" style={{ color: "var(--rust)" }}>{KES(liveProp.rent)}</div></div>
              <div className="mdet"><div className="mdet-l">Rooms</div><div className="mdet-v">{liveProp.rooms || "N/A"}</div></div>
            </div>
            <div className="tags">{liveProp.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
          </div>

          <div className="pd-section">
            <h3>Description</h3>
            <div className="mrules"><strong>House Rules</strong>{liveProp.rules}</div>
          </div>

          <div className="pd-section">
            <h3>Listing details</h3>
            <div className="linfo-grid">
              <div><span>Listing ID</span><strong>{liveProp.id}</strong></div>
              <div><span>Landlord</span><strong>{landlord ? landlord.name : liveProp.landlordId}</strong></div>
              <div><span>Status</span><strong>{isAvailable ? "Available" : "Taken"}</strong></div>
              <div><span>Media files</span><strong>{liveProp.media?.length || 0}</strong></div>
            </div>
          </div>
        </div>

        <aside className="pd-right">
          <div className="pd-action-panel">
            <button className="bp" type="button" onClick={closeModal}>← Back to listings</button>
            {!user && <button className="bghost" type="button" onClick={() => { closeModal(); setAuthModal("tenant"); }}>Login to unlock</button>}
          </div>

          {landlord && (
            <div className="pd-section">
              <h3>Landlord profile</h3>
              <div className="linfo-grid">
                <div><span>Name</span><strong>{landlord.name}</strong></div>
                <div><span>Email</span><strong>{landlord.email}</strong></div>
                <div><span>Phone</span><strong>{landlord.phone || "N/A"}</strong></div>
                <div><span>Joined</span><strong>{landlord.joined}</strong></div>
              </div>
            </div>
          )}

          {user?.role === "tenant" && !isUnlocked(liveProp.id) && (
            <div className="locked detail-locked">
              <div className="li">🔒</div>
              <h4>Contact & location locked</h4>
              <p>Unlock to reveal the exact address and landlord contact info.</p>
              <button className="bunlock" type="button" onClick={() => setPayModal({ type: "unlock", propId: liveProp.id })}>🔓 Unlock for KSh {settings.unlockFee}</button>
            </div>
          )}

          {((user?.role === "tenant" && isUnlocked(liveProp.id)) || user?.role !== "tenant") && hasContact && (
            <div className="mcbox">
              <h4>Contact the landlord</h4>
              <div className="cgrid">
                {liveProp.contact.phone && <a className="citem" href={`tel:${liveProp.contact.phone}`}>📞 {liveProp.contact.phone}</a>}
                {liveProp.contact.email && <a className="citem" href={`mailto:${liveProp.contact.email}`}>✉️ {liveProp.contact.email}</a>}
                {liveProp.contact.whatsapp && <a className="citem" href={`https://wa.me/${liveProp.contact.whatsapp}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
              </div>
              <div className="srow">
                {liveProp.contact.whatsapp && <a className="sbtn sb-wa" href={`https://wa.me/${liveProp.contact.whatsapp}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
                {liveProp.contact.ig && <a className="sbtn sb-ig" href={`https://instagram.com/${liveProp.contact.ig}`} target="_blank" rel="noreferrer">📸 Instagram</a>}
                {liveProp.contact.fb && <a className="sbtn sb-fb" href={`https://facebook.com/${liveProp.contact.fb}`} target="_blank" rel="noreferrer">👍 Facebook</a>}
                {liveProp.contact.tt && <a className="sbtn sb-tt" href={`https://tiktok.com/@${liveProp.contact.tt}`} target="_blank" rel="noreferrer">🎵 TikTok</a>}
                {liveProp.contact.tw && <a className="sbtn sb-tw" href={`https://twitter.com/${liveProp.contact.tw}`} target="_blank" rel="noreferrer">𝕏 Twitter</a>}
              </div>
            </div>
          )}

          {user?.role === "tenant" && !hasContact && (
            <div className="locked detail-locked">
              <div className="li">ℹ️</div>
              <h4>No landlord contact available</h4>
              <p>This listing does not include phone or WhatsApp details yet.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
