import api from "./api";

function normalizeBooking(item = null) {
  if (!item) return null;

  const tenant = item.tenant && typeof item.tenant === "object" ? {
    ...item.tenant,
    id: item.tenant.id || item.tenant._id,
  } : item.tenant;

  const landlord = item.landlord && typeof item.landlord === "object" ? {
    ...item.landlord,
    id: item.landlord.id || item.landlord._id,
  } : item.landlord;

  const property = item.property && typeof item.property === "object" ? {
    ...item.property,
    id: item.property.id || item.property._id,
  } : item.property;

  return {
    ...item,
    id: item.id || item._id,
    propertyId: property?.id || item.propertyId || item.property,
    property,
    tenant,
    landlord,
  };
}

export async function createBooking(payload) {
  const response = await api.post("/api/bookings", payload);
  const booking = response.data?.data?.booking || response.data?.booking;
  return normalizeBooking(booking);
}

export async function getTenantBookings(params = {}) {
  const response = await api.get("/api/bookings", { params });
  return {
    bookings: (response.data?.data?.bookings || []).map(normalizeBooking),
    pagination: response.data?.data?.pagination || null,
  };
}

export async function cancelBooking(id) {
  const response = await api.patch(`/api/bookings/${id}/cancel`);
  const booking = response.data?.data?.booking || response.data?.booking;
  return normalizeBooking(booking);
}

export async function getLandlordBookings(params = {}) {
  const response = await api.get("/api/bookings/landlord", { params });
  return {
    bookings: (response.data?.data?.bookings || []).map(normalizeBooking),
    pagination: response.data?.data?.pagination || null,
  };
}

export async function approveBooking(id) {
  const response = await api.patch(`/api/bookings/${id}/approve`);
  const booking = response.data?.data?.booking || response.data?.booking;
  return normalizeBooking(booking);
}

export async function rejectBooking(id) {
  const response = await api.patch(`/api/bookings/${id}/reject`);
  const booking = response.data?.data?.booking || response.data?.booking;
  return normalizeBooking(booking);
}

export async function getBookingById(id) {
  const response = await api.get(`/api/bookings/${id}`);
  const booking = response.data?.data?.booking || response.data?.booking;
  return normalizeBooking(booking);
}
