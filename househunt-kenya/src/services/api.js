import axios from "axios";
import { API_URL } from "../config/api";

const api = axios.create({
	baseURL: API_URL,
	timeout: 10000,
});

api.interceptors.request.use(config => {
	config.withCredentials = true;
	config.headers["X-HouseHunt-Request"] = "1";

	if (config.data && !(config.data instanceof FormData)) {
		config.headers["Content-Type"] = "application/json";
	}

	return config;
});

api.interceptors.response.use(
	response => response,
	error => {
		const payload = error.response?.data;

		if (error.response?.status === 401) {
			window.dispatchEvent(new CustomEvent("househunt:session-expired"));
		}

		if (payload && typeof payload === "object") {
			error.apiErrors = payload.errors;
			if (payload.message) {
				error.message = payload.message;
			}
		}

		return Promise.reject(error);
	},
);

export default api;
