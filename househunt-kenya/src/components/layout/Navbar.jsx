import { useEffect, useRef, useState } from "react";

export default function Navbar({ tab, setTab, user, logout, setAuthModal }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef(null);
  const navigateTo = target => {
    if ((target === "landlord" || target === "tenant") && !user) setAuthModal(target);
    else setTab(target);
    setMobileOpen(false);
  };

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const closeOnEscape = event => event.key === "Escape" && setMobileOpen(false);
    const closeOnOutsideClick = event => {
      if (!navRef.current?.contains(event.target)) setMobileOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [mobileOpen]);

  return (
    <header className="hdr">
      <div className="logo" onClick={() => navigateTo("home")} role="button" tabIndex={0} onKeyDown={event => event.key === "Enter" && navigateTo("home")}>House<em>Hunt</em> Kenya</div>
      <button className="mobile-nav-toggle" type="button" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} onClick={() => setMobileOpen(open => !open)}>☰</button>
      <nav ref={navRef} className={`hnav${mobileOpen ? " open" : ""}`} aria-label="Primary navigation">
        {[["home", "🏠 Home"], ["tenant", "Find a Home"], ["landlord", "For Landlords"], ["guide", "How It Works"]].map(([t, l]) => (
          <button
            key={t}
            className={`nb${tab === t ? " on" : ""}`}
            onClick={() => navigateTo(t)}
          >
            {l}
          </button>
        ))}
        {user?.role === "admin" && (
          <button className={`nb adm${tab === "admin" ? " on" : ""}`} onClick={() => navigateTo("admin")}>
            ⚙️ Admin
          </button>
        )}
      </nav>
      <div className="hdr-actions">
        {user ? (
          <div className="userpill">
            <div className={`uav${user.role === "admin" ? " adm" : ""}`}>{user.role === "admin" ? "A" : user.data.name[0]}</div>
            <span>{user.role === "admin" ? "Administrator" : user.data.name.split(" ")[0]}</span>
            <button className="sout" onClick={logout}>Sign out</button>
          </div>
        ) : (
          <>
            <button className="admin-login-link" onClick={() => setAuthModal("admin")}>
              🛡️ Admin
            </button>
            <button className="bghost" style={{ fontSize: "0.74rem", padding: "5px 12px" }} onClick={() => setAuthModal("tenant")}>Tenant Login</button>
            <button className="bp" style={{ fontSize: "0.74rem", padding: "5px 12px" }} onClick={() => setAuthModal("landlord")}>Landlord Login</button>
          </>
        )}
      </div>
    </header>
  );
}
