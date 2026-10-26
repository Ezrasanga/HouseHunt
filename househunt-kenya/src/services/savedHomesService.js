import api from "./api";

function propertyIdsFromResponse(response) {
  return response.data.data?.propertyIds || [];
}

export async function getSavedHomeIds() {
  const response = await api.get("/api/users/saved-homes");
  return propertyIdsFromResponse(response);
}

export async function addSavedHome(propertyId) {
  const response = await api.post(`/api/users/saved-homes/${encodeURIComponent(propertyId)}`);
  return propertyIdsFromResponse(response);
}

export async function removeSavedHome(propertyId) {
  const response = await api.delete(`/api/users/saved-homes/${encodeURIComponent(propertyId)}`);
  return propertyIdsFromResponse(response);
}
