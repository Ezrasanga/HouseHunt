export default function Navbar({ tab, setTab, user, logout, setAuthModal }) {
  return (
    <header className="hdr">
      <div className="logo" onClick={() => setTab("home")}>House<em>Hunt</em> Kenya</div>
      <nav className="hnav">
        {[["home", "🏠 Home"], ["tenant", "Find a Home"], ["landlord", "For Landlords"], ["guide", "How It Works"]].map(([t, l]) => (
          <button
            key={t}
            className={`nb${tab === t ? " on" : ""}`}
            onClick={() => {
              if ((t === "landlord" || t === "tenant") && !user) {
                setAuthModal(t);
              } else {
                setTab(t);
              }
            }}
          >
            {l}
          </button>
        ))}
        {user?.role === "admin" && (
          <button className={`nb adm${tab === "admin" ? " on" : ""}`} onClick={() => setTab("admin")}>
            ⚙️ Admin
          </button>
        )}
      </nav>
      {user ? (
        <div className="userpill">
          <div className={`uav${user.role === "admin" ? " adm" : ""}`}>{user.role === "admin" ? "A" : user.data.name[0]}</div>
          <span>{user.role === "admin" ? "Administrator" : user.data.name.split(" ")[0]}</span>
          <button className="sout" onClick={logout}>Sign out</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 5 }}>
          <button className="bghost" style={{ fontSize: "0.74rem", padding: "5px 12px" }} onClick={() => setAuthModal("tenant")}>Tenant Login</button>
          <button className="bp" style={{ fontSize: "0.74rem", padding: "5px 12px" }} onClick={() => setAuthModal("landlord")}>Landlord Login</button>
        </div>
      )}
    </header>
  );
}
