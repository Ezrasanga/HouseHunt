export default function PropertyDetails({ liveProp, user, isUnlocked, settings, setPayModal, setAuthModal, setSelProp }) {
  const KES = n => `KSh ${Number(n).toLocaleString()}`;

  return (
    <div className="mbody">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.66rem", color: "var(--rust)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 700 }}>{liveProp.type}</span>
        <span className={`sbadge sb-${liveProp.status === "available" ? "av" : "tk"}`}>{liveProp.status === "available" ? "✓ Available" : "⊘ Taken"}</span>
        {liveProp.boosted && <span style={{ fontSize: "0.66rem", color: "#C4991A", fontWeight: 700 }}>⭐ Boosted</span>}
        {liveProp.flagged && <span style={{ fontSize: "0.66rem", color: "#dc2626", fontWeight: 700 }}>🚩 Flagged</span>}
      </div>
      <h2>{liveProp.title}</h2>
      {user?.role !== "tenant" || isUnlocked(liveProp.id)
        ? <p style={{ color: "#7C3A1E", fontSize: "0.82rem", marginTop: 4 }}>📍 {liveProp.location}</p>
        : <p style={{ color: "#bbb", fontSize: "0.82rem", marginTop: 4 }}>📍 Location hidden — unlock to view</p>}
      <div className="mdets">
        <div className="mdet"><div className="mdet-l">Monthly Rent</div><div className="mdet-v" style={{ color: "var(--rust)" }}>{KES(liveProp.rent)}</div></div>
        <div className="mdet"><div className="mdet-l">Rooms</div><div className="mdet-v">{liveProp.rooms}</div></div>
        <div className="mdet"><div className="mdet-l">Media</div><div className="mdet-v">{liveProp.media?.length || 0} files</div></div>
      </div>
      <div className="tags" style={{ marginBottom: "1rem" }}>{liveProp.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
      <div className="mrules"><strong>House Rules</strong>{liveProp.rules}</div>

      {user?.role === "tenant" && !isUnlocked(liveProp.id) && (
        <div className="locked">
          <div className="li">🔒</div>
          <h4>Contact & Location Locked</h4>
          <p>Unlock to see the exact address and landlord contact details.</p>
          <button className="bunlock" onClick={() => setPayModal({ type: "unlock", propId: liveProp.id })}>🔓 Unlock for KSh {settings.unlockFee} via M-PESA</button>
        </div>
      )}
      {user?.role === "tenant" && isUnlocked(liveProp.id) && liveProp.contact && (
        <div className="mcbox">
          <h4>Contact the Landlord <span className="ulpill">🔓 Unlocked</span></h4>
          <div className="cgrid">
            {liveProp.contact.phone && <a className="citem" href={`tel:${liveProp.contact.phone}`}>📞 {liveProp.contact.phone}</a>}
            {liveProp.contact.email && <a className="citem" href={`mailto:${liveProp.contact.email}`}>✉️ {liveProp.contact.email}</a>}
            {liveProp.contact.whatsapp && <a className="citem" href={`https://wa.me/${liveProp.contact.whatsapp}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
          </div>
          <div className="srow">
            {liveProp.contact.whatsapp && <a className="sbtn sb-wa" href={`https://wa.me/${liveProp.contact.whatsapp}`} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
            {liveProp.contact.ig && <a className="sbtn sb-ig" href={`https://instagram.com/${liveProp.contact.ig}`} target="_blank" rel="noreferrer">📸 Instagram</a>}
            {liveProp.contact.fb && <a className="sbtn sb-fb" href={`https://facebook.com/${liveProp.contact.fb}`} target="_blank" rel="noreferrer">👍 Facebook</a>}
          </div>
        </div>
      )}
      {user?.role !== "tenant" && liveProp.contact && (liveProp.contact.phone || liveProp.contact.whatsapp) && (
        <div className="mcbox">
          <h4>Contact the Landlord</h4>
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
      {!user && <div className="locked">
        <div className="li">🔒</div><h4>Login to View Contacts</h4>
        <p>Create a free tenant account. Pay KSh {settings.unlockFee} to unlock contacts.</p>
        <button className="bp" style={{ marginTop: 0 }} onClick={() => { setSelProp(null); setAuthModal("tenant"); }}>Login / Sign Up Free →</button>
      </div>}
    </div>
  );
}
