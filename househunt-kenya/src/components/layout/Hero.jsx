export default function Hero({ user, setTab, setAuthModal, unlockFee }) {
  return (
    <div className="hero">
      <div className="hero-in">
        <div className="htag">🏡 Kenya's Premier Property Platform</div>
        <h1 className="h1">Find Your <em>Perfect Home</em><br/>Across Kenya</h1>
        <p className="hsub">Verified listings across Nairobi, Mombasa, Kisumu & beyond. Connect directly with landlords.</p>
        <div className="hbtns">
          <button className="bp" onClick={() => user?.role === "tenant" ? setTab("tenant") : setAuthModal("tenant")}>Browse Listings →</button>
          <button className="bo" onClick={() => user?.role === "landlord" ? setTab("landlord") : setAuthModal("landlord")}>List Your Property</button>
          {!user && <button className="bo" style={{ borderColor: "rgba(196,153,26,0.4)", color: "#C4991A" }} onClick={() => setAuthModal("admin")}>Admin Login</button>}
        </div>
        <p className="hnote">✓ Free to browse · ✓ Free to list · 🔓 Unlock contacts KSh {unlockFee}</p>
      </div>
    </div>
  );
}
