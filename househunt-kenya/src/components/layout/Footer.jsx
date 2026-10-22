import Icon from "../common/Icon";

export default function Footer({ user, setTab, setAuthModal }) {
  const browseHomes = () => {
    setTab(user?.role === "tenant" ? "tenant" : "home");
  };

  const openLandlordArea = () => {
    if (user?.role === "landlord") {
      setTab("landlord");
    } else {
      setAuthModal("landlord");
    }
  };

  return (
    <footer className="site-footer">
      <div className="footer-main">
        <section className="footer-brand" aria-label="About HouseHunt Kenya">
          <button className="footer-logo" type="button" onClick={() => setTab("home")}>
            House<em>Hunt</em> <span>Kenya</span>
          </button>
          <p>Discover homes, compare listings, and connect with landlords directly.</p>
          <div className="footer-promise"><Icon name="mapPin" /> Made for finding your place in Kenya</div>
        </section>

        <nav className="footer-links" aria-label="Explore HouseHunt">
          <h2>Explore</h2>
          <button type="button" onClick={() => setTab("home")}>Home</button>
          <button type="button" onClick={browseHomes}>Browse homes</button>
          <button type="button" onClick={() => setTab("guide")}>How it works</button>
        </nav>

        <nav className="footer-links" aria-label="For landlords">
          <h2>For landlords</h2>
          <button type="button" onClick={openLandlordArea}>List or manage a property</button>
          {!user && <button type="button" onClick={() => setAuthModal("landlord")}>Landlord sign in</button>}
          <p>Listing is free. Optional boosts help your listing stand out.</p>
        </nav>

        <section className="footer-note" aria-label="Platform information">
          <span className="footer-note-mark"><Icon name="home" /></span>
          <h2>Find a home. Connect directly.</h2>
          <p>HouseHunt helps people discover listings. Tenancy arrangements and rent are handled directly between tenants and landlords.</p>
        </section>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} HouseHunt Kenya</span>
        <span>Property listings are provided by landlords; HouseHunt does not own the homes.</span>
      </div>
    </footer>
  );
}
