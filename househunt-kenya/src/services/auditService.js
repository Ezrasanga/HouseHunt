import api from "./api";

export async function getAuditEvents(params = {}) {
	const response = await api.get("/api/audit", { params });
	return {
		events: response.data.data?.events || [],
		pagination: response.data.data?.pagination || null,
	};
}
