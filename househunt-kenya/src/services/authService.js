import api from "./api";

export const login = payload => api.post("/api/auth/login", payload);

export const register = payload => api.post("/api/auth/register", payload);

export const profile = () => api.get("/api/auth/profile");

export const updateProfile = payload => api.patch("/api/users/profile", payload);

export const changePassword = payload => api.patch("/api/users/change-password", payload);

export const requestPasswordReset = email => api.post("/api/auth/password-reset/request", { email });

export const completePasswordReset = payload => api.post("/api/auth/password-reset/complete", payload);
