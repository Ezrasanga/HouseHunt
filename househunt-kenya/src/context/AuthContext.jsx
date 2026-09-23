import { useEffect, useState } from "react";
import { AuthContext } from "./auth-context";
import { login as loginRequest, profile as profileRequest, register as registerRequest } from "../services/authService";

const TOKEN_KEY = "token";
const USER_KEY = "househunt-user";

function readStoredUser() {
	try {
		return JSON.parse(window.localStorage.getItem(USER_KEY) || "null");
	} catch {
		return null;
	}
}

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

export function AuthProvider({ children }) {
	const [user, setUser] = useState(() => readStoredUser());
	const [isRestoring, setIsRestoring] = useState(() => Boolean(window.localStorage.getItem(TOKEN_KEY)));
	const [isLoading, setIsLoading] = useState(false);

	const clearSession = () => {
		window.localStorage.removeItem(TOKEN_KEY);
		window.localStorage.removeItem(USER_KEY);
		setUser(null);
	};

	const updateUser = updater => {
		setUser(current => {
			const nextUser = typeof updater === "function" ? updater(current) : updater;
			window.localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
			return nextUser;
		});
	};

	const saveSession = session => {
		const nextUser = normalizeUser(session.user);
		window.localStorage.setItem(TOKEN_KEY, session.token);
		window.localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
		setUser(nextUser);
		return nextUser;
	};

	useEffect(() => {
		if (!window.localStorage.getItem(TOKEN_KEY)) {
			return undefined;
		}

		let active = true;
		profileRequest()
			.then(response => {
				if (active && response.data.success) {
					const storedToken = window.localStorage.getItem(TOKEN_KEY);
					saveSession({ token: storedToken, user: response.data.data.user });
				}
			})
			.catch(() => {
				if (active) clearSession();
			})
			.finally(() => {
				if (active) setIsRestoring(false);
			});

		return () => { active = false; };
	}, []);

	const login = async payload => {
		setIsLoading(true);
		try {
			const response = await loginRequest({
				...payload,
				role: payload.role ? String(payload.role).toUpperCase() : undefined,
			});
			if (!response.data.success) throw new Error(response.data.message || "Login failed.");
			return saveSession(response.data.data);
		} catch (error) {
			throw new Error(errorMessage(error), { cause: error });
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
			return saveSession(response.data.data);
		} catch (error) {
			throw new Error(errorMessage(error), { cause: error });
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
		updateUser,
		logout: clearSession,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
