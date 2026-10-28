import { useCallback, useEffect, useState } from "react";
import useAuth from "./useAuth";
import {
  approveBooking as approveBookingRequest,
  cancelBooking as cancelBookingRequest,
  createBooking as createBookingRequest,
  getLandlordBookings,
  getTenantBookings,
  rejectBooking as rejectBookingRequest,
  updateBookingCompletion as updateBookingCompletionRequest,
  updateEarlyTermination as updateEarlyTerminationRequest,
} from "../services/bookingService";

function bookingErrorMessage(error) {
  return error?.response?.data?.message || error?.message || "Unable to update bookings.";
}

export default function useBookings() {
  const { user } = useAuth();

  const [tenantBookings, setTenantBookings] = useState([]);
  const [landlordBookings, setLandlordBookings] = useState([]);
  const [activeLandlordBookings, setActiveLandlordBookings] = useState([]);
  const [landlordBookingsPagination, setLandlordBookingsPagination] = useState(null);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [landlordLoading, setLandlordLoading] = useState(false);
  const [activeTenancyLoading, setActiveTenancyLoading] = useState(false);
  const [tenantError, setTenantError] = useState("");
  const [landlordError, setLandlordError] = useState("");
  const [activeTenancyError, setActiveTenancyError] = useState("");

  const loadTenantBookings = useCallback(async (params = {}) => {
    if (!user || user.role !== "tenant") {
      setTenantBookings([]);
      return [];
    }

    setTenantLoading(true);
    setTenantError("");

    try {
      const result = await getTenantBookings({ limit: 10, ...params });
      setTenantBookings(result.bookings || []);
      return result.bookings || [];
    } catch (error) {
      const message = bookingErrorMessage(error);
      setTenantError(message);
      throw error;
    } finally {
      setTenantLoading(false);
    }
  }, [user]);

  const loadLandlordBookings = useCallback(async (params = {}) => {
    if (!user || user.role !== "landlord") {
      setLandlordBookings([]);
      return [];
    }

    setLandlordLoading(true);
    setLandlordError("");

    try {
      const result = await getLandlordBookings({ limit: 10, ...params });
      setLandlordBookings(result.bookings || []);
      setLandlordBookingsPagination(result.pagination || null);
      return result.bookings || [];
    } catch (error) {
      const message = bookingErrorMessage(error);
      setLandlordError(message);
      throw error;
    } finally {
      setLandlordLoading(false);
    }
  }, [user]);

  const loadActiveLandlordBookings = useCallback(async () => {
    if (!user || user.role !== "landlord") {
      setActiveLandlordBookings([]);
      return [];
    }

    setActiveTenancyLoading(true);
    setActiveTenancyError("");
    try {
      const result = await getLandlordBookings({ status: "APPROVED", limit: 100 });
      setActiveLandlordBookings(result.bookings || []);
      return result.bookings || [];
    } catch (error) {
      const message = bookingErrorMessage(error);
      setActiveTenancyError(message);
      throw error;
    } finally {
      setActiveTenancyLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;

    const timer = setTimeout(() => {
      if (user.role === "tenant") {
        void loadTenantBookings({ limit: 10 });
        return;
      }

      if (user.role === "landlord") {
        void loadLandlordBookings({ limit: 10 });
        void loadActiveLandlordBookings();
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [loadActiveLandlordBookings, loadLandlordBookings, loadTenantBookings, user]);

  const createBooking = useCallback(async (payload) => {
    const booking = await createBookingRequest(payload);
    await loadTenantBookings({ limit: 10 });
    return booking;
  }, [loadTenantBookings]);

  const cancelBooking = useCallback(async (id) => {
    const booking = await cancelBookingRequest(id);
    setTenantBookings(current => current.map(item => item.id === id ? booking : item));
    await loadTenantBookings({ limit: 10 });
    return booking;
  }, [loadTenantBookings]);

  const approveBooking = useCallback(async (id) => {
    const booking = await approveBookingRequest(id);
    setLandlordBookings(current => current.map(item => item.id === id ? booking : item));
    await Promise.all([loadLandlordBookings({ limit: 10 }), loadActiveLandlordBookings()]);
    return booking;
  }, [loadActiveLandlordBookings, loadLandlordBookings]);

  const rejectBooking = useCallback(async (id) => {
    const booking = await rejectBookingRequest(id);
    setLandlordBookings(current => current.map(item => item.id === id ? booking : item));
    await loadLandlordBookings({ limit: 10 });
    return booking;
  }, [loadLandlordBookings]);

  const updateBookingCompletion = useCallback(async (id, action) => {
    const booking = await updateBookingCompletionRequest(id, action);
    setTenantBookings(current => current.map(item => item.id === id ? booking : item));
    setLandlordBookings(current => current.map(item => item.id === id ? booking : item));
    if (user?.role === "tenant") await loadTenantBookings({ limit: 10 });
    if (user?.role === "landlord") {
      await Promise.all([loadLandlordBookings({ limit: 10 }), loadActiveLandlordBookings()]);
    }
    return booking;
  }, [loadActiveLandlordBookings, loadLandlordBookings, loadTenantBookings, user]);

  const updateEarlyTermination = useCallback(async (id, action, reason = "") => {
    const booking = await updateEarlyTerminationRequest(id, action, reason);
    setTenantBookings(current => current.map(item => item.id === id ? booking : item));
    setLandlordBookings(current => current.map(item => item.id === id ? booking : item));
    if (user?.role === "tenant") await loadTenantBookings({ limit: 10 });
    if (user?.role === "landlord") {
      await Promise.all([loadLandlordBookings({ limit: 10 }), loadActiveLandlordBookings()]);
    }
    return booking;
  }, [loadActiveLandlordBookings, loadLandlordBookings, loadTenantBookings, user]);

  return {
    tenantBookings,
    landlordBookings,
    activeLandlordBookings,
    landlordBookingsPagination,
    activeTenancyLoading,
    tenantLoading,
    landlordLoading,
    tenantError,
    landlordError,
    activeTenancyError,
    loadTenantBookings,
    loadLandlordBookings,
    loadActiveLandlordBookings,
    createBooking,
    cancelBooking,
    approveBooking,
    rejectBooking,
    updateBookingCompletion,
    updateEarlyTermination,
  };
}
