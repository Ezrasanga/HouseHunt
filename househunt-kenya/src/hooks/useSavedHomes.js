import { useCallback, useEffect, useRef, useState } from "react";
import {
  addSavedHome,
  getSavedHomeIds,
  removeSavedHome,
} from "../services/savedHomesService";

const GUEST_FAVORITES_KEY = "househunt-favorites";

function getErrorMessage(error) {
  return error.response?.data?.message || error.message || "Could not sync saved homes.";
}

export default function useSavedHomes(user) {
  const userId = user?.data?.id || null;
  const [accountState, setAccountState] = useState({ userId: null, propertyIds: [], error: "" });
  const [retryCount, setRetryCount] = useState(0);
  const favoritesRef = useRef([]);
  const operationQueue = useRef(Promise.resolve());

  const updateFavorites = useCallback(nextFavorites => {
    const uniqueFavorites = [...new Set(nextFavorites.map(String))];
    favoritesRef.current = uniqueFavorites;
    setAccountState({ userId, propertyIds: uniqueFavorites, error: "" });
  }, [userId]);

  useEffect(() => {
    window.localStorage.removeItem(GUEST_FAVORITES_KEY);
  }, []);

  useEffect(() => {
    let active = true;
    if (!userId) {
      favoritesRef.current = [];
      return () => { active = false; };
    }

    const syncSavedHomes = async () => {
      const serverFavorites = await getSavedHomeIds();
      if (active) {
        favoritesRef.current = serverFavorites;
        setAccountState({ userId, propertyIds: serverFavorites, error: "" });
      }
    };

    syncSavedHomes()
      .catch(syncError => {
        if (active) {
          favoritesRef.current = [];
          setAccountState({ userId, propertyIds: [], error: getErrorMessage(syncError) });
        }
      });

    return () => { active = false; };
  }, [retryCount, userId]);

  const toggleFavorite = useCallback(propertyId => {
    const operation = operationQueue.current.then(async () => {
      const isLoading = userId && accountState.userId !== userId;
      if (!userId) {
        throw new Error("Sign in to save homes to your account.");
      }
      if (isLoading || accountState.error) {
        throw new Error(accountState.error || "Saved homes are still loading. Please try again.");
      }
      const currentFavorites = favoritesRef.current;
      const isSaved = currentFavorites.includes(propertyId);

      const nextFavorites = isSaved
        ? await removeSavedHome(propertyId)
        : await addSavedHome(propertyId);
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

      if (!userId) return;

      for (const propertyId of [...favoritesRef.current]) {
        const remaining = await removeSavedHome(propertyId);
        favoritesRef.current = remaining;
        setAccountState({ userId, propertyIds: remaining, error: "" });
      }
    });
    operationQueue.current = operation.catch(() => {});
    return operation;
  }, [accountState, userId]);

  const isAccountLoading = Boolean(userId && accountState.userId !== userId);
  const favorites = userId && accountState.userId === userId ? accountState.propertyIds : [];
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
