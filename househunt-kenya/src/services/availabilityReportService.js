import api from "./api";

export async function reportPropertyAvailability(propertyId, payload) {
	const response = await api.post(`/api/availability-reports/properties/${propertyId}`, payload);
	return response.data.data.report;
}

export async function getAvailabilityReports(params = {}) {
	const response = await api.get("/api/availability-reports", { params });
	return response.data.data;
}

export async function reviewAvailabilityReport(id, payload) {
	const response = await api.patch(`/api/availability-reports/${id}`, payload);
	return response.data.data.report;
}
