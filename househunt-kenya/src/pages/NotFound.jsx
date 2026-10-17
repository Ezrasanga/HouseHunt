import { Link } from "react-router-dom";
import Icon from "../components/common/Icon";

export default function NotFound() {
  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <div className="not-found-icon"><Icon name="home" /></div>
      <p className="shey">404 · Page not found</p>
      <h1 id="not-found-title">We couldn’t find that page.</h1>
      <p className="not-found-description">The link may be outdated, or the address may have been entered incorrectly. You can head home or explore how HouseHunt works.</p>
      <div className="not-found-actions">
        <Link className="bp" to="/"><Icon name="home" /> Return to HouseHunt Kenya</Link>
        <Link className="not-found-guide" to="/guide">Explore the guide <Icon name="arrowRight" /></Link>
      </div>
    </section>
  );
}
