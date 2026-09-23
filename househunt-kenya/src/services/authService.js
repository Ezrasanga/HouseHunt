import api from "./api";

export const login = payload => api.post("/api/auth/login", payload);

export const register = payload => api.post("/api/auth/register", payload);

export const profile = () => api.get("/api/auth/profile");
