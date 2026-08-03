// src/services/authService.js

import API from "./api";

export const login = (credentials) =>
  API.post("/auth/login", credentials);

export const register = (userData) =>
  API.post("/auth/register", userData);

export const getProfile = () =>
  API.get("/auth/profile");