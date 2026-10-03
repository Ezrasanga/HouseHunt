import api from "./api";

function normalizeUser(user = {}) {
  const role = String(user.role || "TENANT").toUpperCase();
  const fullName = user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "Unknown User";
  const isActive = user.isActive !== undefined ? Boolean(user.isActive) : true;

  return {
    ...user,
    id: user.id || user._id,
    name: fullName,
    role,
    isActive,
    banned: !isActive,
    joined: user.createdAt ? new Date(user.createdAt).toISOString().slice(0, 10) : "",
  };
}

export async function getUsers(params = {}) {
  const response = await api.get("/api/users", { params });
  return {
    users: (response.data.data?.users || []).map(normalizeUser),
    pagination: response.data.data?.pagination || null,
  };
}

export async function updateUserStatus(id, isActive) {
  const response = await api.patch(`/api/users/${id}/status`, { isActive });
  return normalizeUser(response.data.data?.user || response.data.data || {});
}

export async function deleteUser(id) {
  const response = await api.delete(`/api/users/${id}`);
  return normalizeUser(response.data.data?.user || response.data.data || {});
}
