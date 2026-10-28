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
  onSignIn,
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
          {user
            ? "Your saved homes are connected to your account and available when you sign in on another device."
            : "Sign in to view homes saved to your account. Saved homes are not stored on this device when you are signed out."}
        </p>
        {user && favoriteIds.length > 0 && (
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
      {user && clearError && <div className="form-error" role="alert">{clearError}</div>}
      {user && savedHomesError && (
        <div className="form-error" role="alert">
          Could not sync your saved homes: {savedHomesError}
          <button type="button" className="bghost" onClick={onRetrySavedHomes}>Retry sync</button>
        </div>
      )}
      {user && loadingSavedHomes && <p className="saved-homes-message" role="status">Syncing saved homes…</p>}
      {user && loading && properties.length === 0 && <p className="saved-homes-message" role="status">Loading your saved homes…</p>}
      {user && error && (
        <div className="form-error" role="alert">
          {error}
          <button type="button" className="bghost" onClick={() => { setError(""); setLoading(true); setRefreshKey(value => value + 1); }}>Retry</button>
        </div>
      )}
      {user && unavailableCount > 0 && (
        <p className="saved-homes-message" role="status">
          {unavailableCount} saved {unavailableCount === 1 ? "listing could" : "listings could"} not be found. Clear saved homes to remove old listings and start fresh.
        </p>
      )}
      {!user && (
        <div className="noresult">
          <h3>Sign in to see your saved homes</h3>
          <p>Your shortlist is private to your account and won’t be shown while you’re signed out.</p>
          <button type="button" onClick={onSignIn}>Sign in to your account</button>
        </div>
      )}
      {user && !loading && !loadingSavedHomes && !error && !savedHomesError && favoriteIds.length === 0 && (
        <div className="noresult">
          <h3>No saved homes yet</h3>
          <p>Use the heart on a listing to save it to your account.</p>
          <button type="button" onClick={onBrowse}>Browse homes</button>
        </div>
      )}
      {user && !error && properties.length > 0 && (
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
