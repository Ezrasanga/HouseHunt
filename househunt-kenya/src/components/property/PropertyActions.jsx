import Icon from "../common/Icon";

export default function PropertyActions({ canManage, liveProp, markTaken, markAvailable, canConfirmExternalVacancy, flagProp, approveProp, setSelProp, user }) {
  if (!canManage) return null;
  const externalTenancy = liveProp.externalTenancies?.find(tenancy => !tenancy.endedAt);
  const isLandlord = user?.role === "landlord";

  return (
    <div className="vsec">
      <h4><Icon name="home" /> Listing Availability</h4>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {isLandlord && liveProp.status === "available" && (
          <button className="bver" onClick={() => { markTaken(liveProp.id); setSelProp(null); }}>
            <Icon name="home" /> Record external tenancy
          </button>
        )}
        {isLandlord && liveProp.status === "taken" && externalTenancy && (
          <button
            className="bver"
            disabled={!canConfirmExternalVacancy}
            onClick={() => { markAvailable(liveProp.id); setSelProp(null); }}
          >
            {canConfirmExternalVacancy ? "Confirm vacant & mark available" : "Available after lease end"}
          </button>
        )}
        {isLandlord && liveProp.status === "taken" && !externalTenancy && (
          <button className="bver" onClick={() => { markTaken(liveProp.id); setSelProp(null); }}>
            Record existing external tenancy
          </button>
        )}
        {user?.role === "admin" && !liveProp.flagged && <button className="bban" onClick={() => { flagProp(liveProp.id); setSelProp(null); }}><Icon name="flag" /> Flag</button>}
        {user?.role === "admin" && liveProp.flagged && <button className="bapp" onClick={() => { approveProp(liveProp.id); setSelProp(null); }}><Icon name="check" /> Restore</button>}
      </div>
    </div>
  );
}
