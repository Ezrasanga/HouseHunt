import api from "./api";

const COLORS = ["#B5451B", "#2D5016", "#1A1A2E", "#7C3A1E", "#C4991A", "#E05A1E"];

function propertyStatus(status) {
	return {
		AVAILABLE: "available",
		OCCUPIED: "taken",
		PENDING: "pending",
		HIDDEN: "hidden",
	}[String(status || "").toUpperCase()] || "pending";
}

function locationLabel(location = {}) {
	return [location.estate, location.town, location.county].filter(Boolean).join(", ") || "Location unavailable";
}

function amenityTags(amenities = {}) {
	return Object.entries(amenities)
		.filter(([, enabled]) => enabled)
		.map(([name]) => name.replace(/([A-Z])/g, " $1").replace(/^./, char => char.toUpperCase()));
}

export function normalizeProperty(property, index = 0) {
	const owner = property?.owner && typeof property.owner === "object" ? property.owner : null;
	const media = (property?.images || []).map(url => ({ url, type: "image" }));
	const tags = amenityTags(property?.amenities);

	return {
		...property,
		id: property?.id || property?._id,
		title: property?.title || "Untitled property",
		location: locationLabel(property?.location),
		rent: property?.price ?? 0,
		rooms: `${property?.bedrooms ?? 0} Bed · ${property?.bathrooms ?? 0} Bath`,
		type: property?.propertyType === "Single Room" ? "Room" : property?.propertyType || "Property",
		rules: property?.description || "No description available.",
		tags,
		color: COLORS[index % COLORS.length],
		initials: (property?.title || "P").slice(0, 2).toUpperCase(),
		media,
		landlordId: owner?.id || owner?._id || property?.owner,
		landlord: owner,
		status: propertyStatus(property?.status),
		boosted: Boolean(property?.featured),
		flagged: propertyStatus(property?.status) === "hidden",
		approved: Boolean(property?.isApproved),
		contact: null,
	};
}

function propertyFromResponse(response) {
	return normalizeProperty(response.data.data.property);
}

export async function getProperties(params = {}) {
	const response = await api.get("/api/properties", { params });
	return {
		properties: (response.data.data?.properties || []).map(normalizeProperty),
		pagination: response.data.data?.pagination || null,
	};
}

export async function getPropertyById(id) {
	const response = await api.get(`/api/properties/${id}`);
	return propertyFromResponse(response);
}

export async function createProperty(payload) {
	const response = await api.post("/api/properties", payload);
	return propertyFromResponse(response);
}

export async function updateProperty(id, payload) {
	const response = await api.patch(`/api/properties/${id}`, payload);
	return propertyFromResponse(response);
}

export async function deleteProperty(id) {
	const response = await api.delete(`/api/properties/${id}`);
	return response.data.data?.property ? normalizeProperty(response.data.data.property) : null;
}

export async function approveProperty(id, isApproved) {
	const response = await api.patch(`/api/properties/${id}/approve`, { isApproved });
	return propertyFromResponse(response);
}

export async function updatePropertyStatus(id, status) {
	const response = await api.patch(`/api/properties/${id}/status`, { status: status.toUpperCase() });
	return propertyFromResponse(response);
}

export async function featureProperty(id, featured) {
	const response = await api.patch(`/api/properties/${id}/feature`, { featured });
	return propertyFromResponse(response);
}
