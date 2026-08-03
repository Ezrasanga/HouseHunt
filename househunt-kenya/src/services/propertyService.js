// src/services/propertyService.js

import API from "./api";

export const getProperties = () =>
  API.get("/properties");

export const getProperty = (id) =>
  API.get(`/properties/${id}`);

export const createProperty = (property) =>
  API.post("/properties", property);

export const updateProperty = (id, property) =>
  API.put(`/properties/${id}`, property);

export const deleteProperty = (id) =>
  API.delete(`/properties/${id}`);