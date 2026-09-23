import api from "./api";

export async function getAnnouncements() {
	const response = await api.get("/api/announcements");
	return response.data.data || [];
}