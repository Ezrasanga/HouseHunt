import Icon from "../common/Icon";

export default function PropertyActions({ canManage, liveProp, markTaken, adminVerify, flagProp, approveProp, setSelProp, user }) {
  if (!canManage) return null;

  return (
    <div className="vsec">
      <h4><Icon name="home" /> Listing Availability</h4>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="bver" onClick={() => { markTaken(liveProp.id); setSelProp(null); }}>{liveProp.status === "taken" ? "Mark Available" : <><Icon name="home" /> Mark Taken</>}</button>
        {user?.role === "admin" && liveProp.status === "taken" && <button className="bp" style={{ padding: "6px 14px", fontSize: "0.78rem" }} onClick={() => { adminVerify(liveProp.id); setSelProp(null); }}><Icon name="check" /> Admin Verify</button>}
        {user?.role === "admin" && !liveProp.flagged && <button className="bban" onClick={() => { flagProp(liveProp.id); setSelProp(null); }}><Icon name="flag" /> Flag</button>}
        {user?.role === "admin" && liveProp.flagged && <button className="bapp" onClick={() => { approveProp(liveProp.id); setSelProp(null); }}><Icon name="check" /> Restore</button>}
      </div>
    </div>
  );
}
