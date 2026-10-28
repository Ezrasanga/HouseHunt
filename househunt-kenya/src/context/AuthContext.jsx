import { useEffect, useState } from "react";
import { AuthContext } from "./auth-context";
import { login as loginRequest, logout as logoutRequest, profile as profileRequest, register as registerRequest, updateProfile as updateProfileRequest } from "../services/authService";

function normalizeUser(user) {
	if (!user) return null;

	const name = user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "";
	return {
		role: String(user.role || "").toLowerCase(),
		data: { ...user, name },
	};
}

function errorMessage(error) {
	const response = error.response?.data;
	const message = response?.message || error.message || "Authentication request failed.";
	const details = response?.errors?.map(item => item.message).filter(detail => detail && detail !== message) || [];
	return details.length ? `${message}: ${details.join(", ")}` : message;
}

function authenticationError(error, fallback) {
	const nextError = new Error(errorMessage(error) || fallback, { cause: error });
	nextError.fieldErrors = error.response?.data?.errors || error.apiErrors || [];
	return nextError;
}

export function AuthProvider({ children }) {
	const [user, setUser] = useState(null);
	const [isRestoring, setIsRestoring] = useState(true);
	const [isLoading, setIsLoading] = useState(false);

	const clearSession = () => {
		setUser(null);
	};

	const updateUser = updater => {
		setUser(current => {
			return typeof updater === "function" ? updater(current) : updater;
		});
	};

	const saveSession = userData => {
		const nextUser = normalizeUser(userData);
		setUser(nextUser);
		return nextUser;
	};

	useEffect(() => {
		const handleSessionExpired = () => clearSession();
		window.addEventListener("househunt:session-expired", handleSessionExpired);
		window.localStorage.removeItem("token");
		window.localStorage.removeItem("househunt-user");

		let active = true;
		profileRequest()
			.then(response => {
				if (active && response.data.success) {
					saveSession(response.data.data.user);
				}
			})
			.catch(error => {
				if (active && error.response?.status !== 401) {
					console.error("Unable to restore the HouseHunt session.", error);
				}
			})
			.finally(() => {
				if (active) setIsRestoring(false);
			});

		return () => {
			active = false;
			window.removeEventListener("househunt:session-expired", handleSessionExpired);
		};
	}, []);

	const login = async payload => {
		setIsLoading(true);
		try {
			const response = await loginRequest({
				...payload,
				role: payload.role ? String(payload.role).toUpperCase() : undefined,
			});
			if (!response.data.success) throw new Error(response.data.message || "Login failed.");
			return saveSession(response.data.data.user);
		} catch (error) {
			throw authenticationError(error, "Login failed.");
		} finally {
			setIsLoading(false);
		}
	};

	const register = async payload => {
		setIsLoading(true);
		try {
			const response = await registerRequest({
				...payload,
				role: String(payload.role || "TENANT").toUpperCase(),
			});
			if (!response.data.success) throw new Error(response.data.message || "Registration failed.");
			return saveSession(response.data.data.user);
		} catch (error) {
			throw authenticationError(error, "Registration failed.");
		} finally {
			setIsLoading(false);
		}
	};

	const updateProfile = async payload => {
		setIsLoading(true);
		try {
			const response = await updateProfileRequest(payload);
			if (!response.data.success) throw new Error(response.data.message || "Profile update failed.");
			return saveSession(response.data.data.user);
		} catch (error) {
			throw authenticationError(error, "Profile update failed.");
		} finally {
			setIsLoading(false);
		}
	};

	const logout = async () => {
		setIsLoading(true);
		try {
			const response = await logoutRequest();
			if (!response.data.success) throw new Error(response.data.message || "Sign out failed.");
			clearSession();
		} catch (error) {
			throw authenticationError(error, "Sign out failed.");
		} finally {
			setIsLoading(false);
		}
	};

	const value = {
		user,
		isLoading,
		isRestoring,
		login,
		register,
		updateProfile,
		updateUser,
		logout,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
