import { FiArrowRight, FiCheck, FiSearch } from "react-icons/fi";

export default function Hero({ user, setTab, setAuthModal, unlockFee }) {
  return (
    <div className="hero">
      <div className="hero-in">
        <div className="htag"><FiSearch aria-hidden="true" /> Kenya's Premier Property Platform</div>
        <h1 className="h1">Find Your <em>Perfect Home</em><br/>Across Kenya</h1>
        <p className="hsub">Verified listings across Nairobi, Mombasa, Kisumu & beyond. Connect directly with landlords.</p>
        <div className="hmeta">Instant search filters, quick property previews, and trusted contacts to help you move faster.</div>
        <div className="hbtns">
          <button className="bp" onClick={() => user?.role === "tenant" ? setTab("tenant") : setAuthModal("tenant")}>Browse Listings <FiArrowRight aria-hidden="true" /></button>
          <button className="bo" onClick={() => user?.role === "landlord" ? setTab("landlord") : setAuthModal("landlord")}>List Your Property</button>
        </div>
        <p className="hnote"><FiCheck aria-hidden="true" /> Free to browse <span>·</span> <FiCheck aria-hidden="true" /> Free to list <span>·</span> Unlock contacts KSh {unlockFee}</p>
      </div>
    </div>
  );
}
