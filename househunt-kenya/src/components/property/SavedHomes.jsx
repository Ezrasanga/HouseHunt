import { useEffect, useState } from "react";
import PropertyGrid from "./PropertyGrid";
import { getPropertyById } from "../../services/propertyService";

export default function SavedHomes({
  favorites,
  onToggleFavorite,
  onView,
  onBrowse,
  user,
  loadingSavedHomes = false,
  savedHomesError = "",
  onRetrySavedHomes,
  onClearSavedHomes,
}) {
  const [properties, setProperties] = useState([]);
  const [unavailableCount, setUnavailableCount] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState("");
  const favoriteIds = Array.isArray(favorites) ? [...new Set(favorites.map(String))] : [];
  const favoriteKey = JSON.stringify(favoriteIds);

  useEffect(() => {
    let active = true;
    const ids = JSON.parse(favoriteKey);
    Promise.allSettled(ids.map(id => getPropertyById(id)))
      .then(results => {
        if (!active) return;
        const loaded = results.filter(result => result.status === "fulfilled").map(result => result.value);
        const failures = results.filter(result => result.status === "rejected");
        setProperties(loaded);
        setUnavailableCount(failures.length);
        const retriableFailures = failures.filter(result => ![403, 404].includes(result.reason.response?.status));
        setError(retriableFailures[0]?.reason.response?.data?.message
          || retriableFailures[0]?.reason.message
          || "");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [favoriteKey, refreshKey]);

  return (
    <div className="page saved-homes-page">
      <div className="sh">
        <div className="shey">Your shortlist</div>
        <div className="shtt">Saved homes</div>
        <p className="saved-homes-note">
          {user?.role === "tenant"
            ? "Your saved homes are synced to your account and available when you sign in on another device."
            : "Your saved homes are kept in this browser, so you can return to them later on this device."}
        </p>
        {favoriteIds.length > 0 && (
          <button
            type="button"
            className="saved-homes-clear"
            disabled={clearing || loadingSavedHomes}
            onClick={async () => {
              setClearing(true);
              setClearError("");
              try {
                await onClearSavedHomes();
              } catch (clearRequestError) {
                setClearError(clearRequestError.message || "Could not clear saved homes.");
              } finally {
                setClearing(false);
              }
            }}
          >
            {clearing ? "Clearing saved homes…" : "Clear saved homes"}
          </button>
        )}
      </div>
      {clearError && <div className="form-error" role="alert">{clearError}</div>}
      {savedHomesError && (
        <div className="form-error" role="alert">
          Could not sync your saved homes: {savedHomesError}
          <button type="button" className="bghost" onClick={onRetrySavedHomes}>Retry sync</button>
        </div>
      )}
      {loadingSavedHomes && <p className="saved-homes-message" role="status">Syncing saved homes…</p>}
      {loading && properties.length === 0 && <p className="saved-homes-message" role="status">Loading your saved homes…</p>}
      {error && (
        <div className="form-error" role="alert">
          {error}
          <button type="button" className="bghost" onClick={() => { setError(""); setLoading(true); setRefreshKey(value => value + 1); }}>Retry</button>
        </div>
      )}
      {unavailableCount > 0 && (
        <p className="saved-homes-message" role="status">
          {unavailableCount} saved {unavailableCount === 1 ? "listing could" : "listings could"} not be found. Clear saved homes to remove old listings and start fresh.
        </p>
      )}
      {!loading && !loadingSavedHomes && !error && !savedHomesError && favoriteIds.length === 0 && (
        <div className="noresult">
          <h3>No saved homes yet</h3>
          <p>Use the heart on a listing to save it here for later.</p>
          <button type="button" onClick={onBrowse}>Browse homes</button>
        </div>
      )}
      {!error && properties.length > 0 && (
        <PropertyGrid
          properties={properties}
          onView={onView}
          user={user}
          favorites={favoriteIds}
          onToggleFavorite={onToggleFavorite}
        />
      )}
    </div>
  );
}
