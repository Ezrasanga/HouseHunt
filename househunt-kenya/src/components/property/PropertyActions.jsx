export default function PropertyActions({ canManage, liveProp, markTaken, adminVerify, flagProp, approveProp, setSelProp, user }) {
  if (!canManage) return null;

  return (
    <div className="vsec">
      <h4>🏠 Availability Management</h4>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="bver" onClick={() => { markTaken(liveProp.id); setSelProp(null); }}>{liveProp.status === "taken" ? "↩ Mark Available" : "🏠 Mark Taken"}</button>
        {user?.role === "admin" && liveProp.status === "taken" && <button className="bp" style={{ padding: "6px 14px", fontSize: "0.78rem" }} onClick={() => { adminVerify(liveProp.id); setSelProp(null); }}>✅ Admin Verify</button>}
        {user?.role === "admin" && !liveProp.flagged && <button className="bban" onClick={() => { flagProp(liveProp.id); setSelProp(null); }}>🚩 Flag</button>}
        {user?.role === "admin" && liveProp.flagged && <button className="bapp" onClick={() => { approveProp(liveProp.id); setSelProp(null); }}>✓ Restore</button>}
      </div>
    </div>
  );
}
