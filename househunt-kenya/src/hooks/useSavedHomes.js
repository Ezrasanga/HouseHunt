import { useCallback, useEffect, useRef, useState } from "react";
import {
  addSavedHome,
  getSavedHomeIds,
  removeSavedHome,
} from "../services/savedHomesService";

const GUEST_FAVORITES_KEY = "househunt-favorites";

function readGuestFavorites() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(GUEST_FAVORITES_KEY) || "[]");
    return Array.isArray(saved) ? [...new Set(saved.filter(id => typeof id === "string" && id))] : [];
  } catch {
    return [];
  }
}

function getErrorMessage(error) {
  return error.response?.data?.message || error.message || "Could not sync saved homes.";
}

export default function useSavedHomes(user) {
  const userId = user?.role === "tenant" ? user.data?.id : null;
  const [guestFavorites, setGuestFavorites] = useState(() => userId ? [] : readGuestFavorites());
  const [accountState, setAccountState] = useState({ userId: null, propertyIds: [], error: "" });
  const [retryCount, setRetryCount] = useState(0);
  const favoritesRef = useRef(guestFavorites);
  const operationQueue = useRef(Promise.resolve());

  const updateFavorites = useCallback(nextFavorites => {
    const uniqueFavorites = [...new Set(nextFavorites.map(String))];
    favoritesRef.current = uniqueFavorites;
    if (userId) {
      setAccountState({ userId, propertyIds: uniqueFavorites, error: "" });
    } else {
      setGuestFavorites(uniqueFavorites);
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    if (!userId) return () => { active = false; };

    const syncSavedHomes = async () => {
      const guestFavorites = readGuestFavorites();
      let serverFavorites = await getSavedHomeIds();
      const serverFavoriteSet = new Set(serverFavorites);
      for (const propertyId of guestFavorites) {
        if (!serverFavoriteSet.has(propertyId)) {
          serverFavorites = await addSavedHome(propertyId);
          serverFavorites.forEach(id => serverFavoriteSet.add(id));
        }
      }
      if (guestFavorites.length > 0) window.localStorage.removeItem(GUEST_FAVORITES_KEY);
      if (active) {
        favoritesRef.current = serverFavorites;
        setAccountState({ userId, propertyIds: serverFavorites, error: "" });
      }
    };

    syncSavedHomes()
      .catch(syncError => {
        if (active) {
          const fallbackFavorites = readGuestFavorites();
          favoritesRef.current = fallbackFavorites;
          setAccountState({ userId, propertyIds: fallbackFavorites, error: getErrorMessage(syncError) });
        }
      });

    return () => { active = false; };
  }, [retryCount, userId]);

  const toggleFavorite = useCallback(propertyId => {
    const operation = operationQueue.current.then(async () => {
      const isLoading = userId && accountState.userId !== userId;
      if (isLoading || accountState.error) {
        throw new Error(accountState.error || "Saved homes are still loading. Please try again.");
      }
      const currentFavorites = favoritesRef.current;
      const isSaved = currentFavorites.includes(propertyId);

      if (userId) {
        let syncedFavorites = currentFavorites;
        const guestFavorites = readGuestFavorites();
        if (guestFavorites.length > 0) {
          for (const guestId of guestFavorites) {
            if (!syncedFavorites.includes(guestId)) syncedFavorites = await addSavedHome(guestId);
          }
          window.localStorage.removeItem(GUEST_FAVORITES_KEY);
        }
        const hasTarget = syncedFavorites.includes(propertyId);
        const nextFavorites = hasTarget
          ? await removeSavedHome(propertyId)
          : await addSavedHome(propertyId);
        updateFavorites(nextFavorites);
        return;
      }

      const nextFavorites = isSaved
        ? currentFavorites.filter(id => id !== propertyId)
        : [...currentFavorites, propertyId];
      window.localStorage.setItem(GUEST_FAVORITES_KEY, JSON.stringify(nextFavorites));
      updateFavorites(nextFavorites);
    });
    operationQueue.current = operation.catch(() => {});
    return operation;
  }, [accountState, updateFavorites, userId]);

  const clearSavedHomes = useCallback(() => {
    const operation = operationQueue.current.then(async () => {
      if (userId && (accountState.userId !== userId || accountState.error)) {
        throw new Error(accountState.error || "Saved homes are still loading. Please try again.");
      }

      if (!userId) {
        window.localStorage.removeItem(GUEST_FAVORITES_KEY);
        updateFavorites([]);
        return;
      }

      for (const propertyId of [...favoritesRef.current]) {
        const remaining = await removeSavedHome(propertyId);
        favoritesRef.current = remaining;
        setAccountState({ userId, propertyIds: remaining, error: "" });
      }
    });
    operationQueue.current = operation.catch(() => {});
    return operation;
  }, [accountState, updateFavorites, userId]);

  const isAccountLoading = Boolean(userId && accountState.userId !== userId);
  const favorites = userId
    ? accountState.userId === userId ? accountState.propertyIds : []
    : guestFavorites;
  const error = userId && accountState.userId === userId ? accountState.error : "";

  return {
    favorites,
    loading: isAccountLoading,
    error,
    retry: () => setRetryCount(count => count + 1),
    toggleFavorite,
    clearSavedHomes,
  };
}
