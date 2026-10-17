import Icon from "../common/Icon";

export default function Hero({ user, setTab, setAuthModal }) {
  return (
    <div className="hero">
      <div className="hero-in">
        <div className="htag"><Icon name="search" /> Kenya's Premier Property Platform</div>
        <h1 className="h1">Find Your <em>Perfect Home</em><br/>Across Kenya</h1>
        <p className="hsub">Explore homes across Kenya, compare listing details, and connect with landlords when you find the right place.</p>
        <div className="hmeta">Instant search filters, quick property previews, and trusted contacts to help you move faster.</div>
        <div className="hbtns">
          <button className="bp" onClick={() => user?.role === "tenant" ? setTab("tenant") : setAuthModal("tenant")}>Browse Listings <Icon name="arrowRight" /></button>
          <button className="bo" onClick={() => user?.role === "landlord" ? setTab("landlord") : setAuthModal("landlord")}>List Your Property</button>
        </div>
        <p className="hnote"><Icon name="check" /> Free to browse <span>·</span> <Icon name="check" /> Free to list <span>·</span> Pay securely by M-PESA to unlock contacts</p>
      </div>
    </div>
  );
}
