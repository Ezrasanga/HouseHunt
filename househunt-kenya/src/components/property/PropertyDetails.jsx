import Badge from "../common/Badge";
import Icon from "../common/Icon";
import { formatAvailabilityConfirmation } from "../../utils/availability";
import { useState } from "react";
import { reportPropertyAvailability } from "../../services/availabilityReportService";

export default function PropertyDetails({
  liveProp,
  landlord,
  user,
  isUnlocked,
  settings,
  onRequestPayment,
  setAuthModal,
  closeModal,
  canBook,
  onBookRequest,
  onShare,
}) {
  const [reportReason, setReportReason] = useState("already-rented");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportSuccess, setReportSuccess] = useState("");
  const KES = n => `KSh ${Number(n).toLocaleString()}`;
  const statusKey = liveProp.status === "available" ? "av" : "tk";
  const isAvailable = liveProp.status === "available";
  const hasContact = liveProp.contact && (liveProp.contact.phone || liveProp.contact.whatsapp || liveProp.contact.email);
  const submitAvailabilityReport = async event => {
    event.preventDefault();
    setReportSubmitting(true);
    setReportError("");
    setReportSuccess("");
    try {
      await reportPropertyAvailability(liveProp.id, { reason: reportReason, details: reportDetails });
      setReportDetails("");
      setReportSuccess("Thanks. Your report has been sent to our admin team for review.");
    } catch (error) {
      setReportError(error.response?.data?.message || error.message || "Could not submit your report.");
    } finally {
      setReportSubmitting(false);
    }
  };

  return (
    <div className="mbody">
      <div className="mdetail-head">
        <div>
          <div className="mdetail-badges">
            <Badge className={`sbadge sb-${statusKey}`}>{isAvailable ? "✓ Available" : "⊘ Taken"}</Badge>
            {liveProp.boosted && <Badge className="sbadge sb-bo"><Icon name="star" /> Boosted</Badge>}
            {liveProp.flagged && <Badge className="sbadge sb-fl"><Icon name="flag" /> Flagged</Badge>}
          </div>
          <h2 id="property-details-title" className="mdetail-title">{liveProp.title}</h2>
          <p className="mdetail-location"><Icon name="mapPin" /> {user?.role !== "tenant" || isUnlocked(liveProp.id) ? liveProp.location : "Location hidden — unlock to view"}</p>
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
              {isAvailable && <div><span>Availability last confirmed</span><strong>{formatAvailabilityConfirmation(liveProp.availabilityConfirmedAt)}</strong></div>}
              <div><span>Media files</span><strong>{liveProp.media?.length || 0}</strong></div>
            </div>
          </div>
        </div>

        <aside className="pd-right">
          <div className="pd-action-panel">
            <button className="bp detail-back" type="button" onClick={closeModal}>← Back to listings</button>
            <button className="bghost" type="button" onClick={() => onShare(liveProp)}><Icon name="share" /> Share listing</button>
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
              <div className="li"><Icon name="lock" /></div>
              <h4>Contact & location locked</h4>
              <p>Unlock to reveal the exact address and landlord contact info.</p>
              <button className="bunlock" type="button" onClick={() => onRequestPayment({ type: "unlock", propId: liveProp.id })}><Icon name="unlock" /> Unlock for KSh {settings.unlockFee}</button>
            </div>
          )}

          {user?.role === "tenant" && canBook && (
            <div className="pd-action-panel" style={{ marginTop: "1rem" }}>
              <button className="bp" type="button" onClick={onBookRequest}><Icon name="calendar" /> Request booking</button>
            </div>
          )}

          {user?.role === "tenant" && isAvailable && liveProp.approved && (
            <details className="availability-report-form">
              <summary>Report that this listing may be unavailable</summary>
              <form onSubmit={submitAvailabilityReport}>
                <label htmlFor="availability-report-reason">What happened?</label>
                <select id="availability-report-reason" value={reportReason} onChange={event => setReportReason(event.target.value)}>
                  <option value="already-rented">It appears to be rented or occupied</option>
                  <option value="landlord-unresponsive">The landlord says it is unavailable</option>
                  <option value="incorrect-details">The listing details appear incorrect</option>
                  <option value="other">Other availability concern</option>
                </select>
                <label htmlFor="availability-report-details">Additional details (optional)</label>
                <textarea
                  id="availability-report-details"
                  maxLength={500}
                  rows={3}
                  value={reportDetails}
                  onChange={event => setReportDetails(event.target.value)}
                  placeholder="Share helpful context (up to 500 characters)"
                />
                {reportError && <p className="availability-report-error" role="alert">{reportError}</p>}
                {reportSuccess && <p className="availability-report-success" role="status">{reportSuccess}</p>}
                <button className="bghost" type="submit" disabled={reportSubmitting || Boolean(reportSuccess)}>
                  {reportSubmitting ? "Sending…" : reportSuccess ? "Report submitted" : "Send report"}
                </button>
                <p className="availability-report-disclaimer">Your report helps our team review the listing. It will not mark the property as taken automatically.</p>
              </form>
            </details>
          )}
          {!user && isAvailable && liveProp.approved && (
            <p className="availability-report-signin">
              Think this listing is unavailable? <button type="button" onClick={() => setAuthModal("tenant")}>Sign in to report it</button>
            </p>
          )}

          {((user?.role === "tenant" && isUnlocked(liveProp.id)) || user?.role !== "tenant") && hasContact && (
            <div className="mcbox">
              <h4>Contact the landlord</h4>
              <div className="cgrid">
                {liveProp.contact.phone && <a className="citem" href={`tel:${liveProp.contact.phone}`}><Icon name="phone" /> {liveProp.contact.phone}</a>}
                {liveProp.contact.email && <a className="citem" href={`mailto:${liveProp.contact.email}`}><Icon name="mail" /> {liveProp.contact.email}</a>}
                {liveProp.contact.whatsapp && <a className="citem" href={`https://wa.me/${liveProp.contact.whatsapp}`} target="_blank" rel="noreferrer"><Icon name="message" /> WhatsApp</a>}
              </div>
              <div className="srow">
                {liveProp.contact.whatsapp && <a className="sbtn sb-wa" href={`https://wa.me/${liveProp.contact.whatsapp}`} target="_blank" rel="noreferrer"><Icon name="message" /> WhatsApp</a>}
                {liveProp.contact.ig && <a className="sbtn sb-ig" href={`https://instagram.com/${liveProp.contact.ig}`} target="_blank" rel="noreferrer"><Icon name="camera" /> Instagram</a>}
                {liveProp.contact.fb && <a className="sbtn sb-fb" href={`https://facebook.com/${liveProp.contact.fb}`} target="_blank" rel="noreferrer"><Icon name="users" /> Facebook</a>}
                {liveProp.contact.tt && <a className="sbtn sb-tt" href={`https://tiktok.com/@${liveProp.contact.tt}`} target="_blank" rel="noreferrer"><Icon name="message" /> TikTok</a>}
                {liveProp.contact.tw && <a className="sbtn sb-tw" href={`https://twitter.com/${liveProp.contact.tw}`} target="_blank" rel="noreferrer">𝕏 Twitter</a>}
              </div>
            </div>
          )}

          {user?.role === "tenant" && !hasContact && (
            <div className="locked detail-locked">
              <div className="li"><Icon name="info" /></div>
              <h4>No landlord contact available</h4>
              <p>This listing does not include phone or WhatsApp details yet.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
