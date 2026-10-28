import { useCallback, useEffect, useState } from "react";
import {
	approveProperty,
	createProperty,
	confirmPropertyAvailability,
	deleteProperty,
	featureProperty,
	getProperties,
	getPropertyById,
	normalizeProperty,
	updateProperty,
	updatePropertyStatus,
} from "../services/propertyService";

function errorMessage(error) {
	return error.response?.data?.message || error.message || "Unable to load properties.";
}

export default function useProperties({ limit = 12, query = {} } = {}) {
	const [properties, setProperties] = useState([]);
	const [pagination, setPagination] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const queryKey = JSON.stringify(query);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const result = await getProperties({ ...JSON.parse(queryKey), limit });
			setProperties(result.properties);
			setPagination(result.pagination);
			return result;
		} catch (requestError) {
			setError(errorMessage(requestError));
			throw requestError;
		} finally {
			setLoading(false);
		}
	}, [limit, queryKey]);

	useEffect(() => {
		let active = true;
		const timer = window.setTimeout(() => {
			setLoading(true);
			setError("");
			getProperties({ ...JSON.parse(queryKey), limit })
			.then(result => {
				if (active) {
					setProperties(result.properties);
					setPagination(result.pagination);
				}
			})
			.catch(requestError => {
				if (active) setError(errorMessage(requestError));
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		}, 250);

		return () => {
			active = false;
			window.clearTimeout(timer);
		};
	}, [limit, queryKey]);

	const loadProperty = useCallback(async id => {
		try {
			return await getPropertyById(id);
		} catch (requestError) {
			setError(errorMessage(requestError));
			throw requestError;
		}
	}, []);

	const replaceProperty = property => {
		setProperties(current => current.map(item => item.id === property.id ? property : item));
		return property;
	};

	const addProperty = async payload => {
		const property = await createProperty(payload);
		setProperties(current => [property, ...current]);
		return property;
	};

	const removeProperty = async id => {
		await deleteProperty(id);
		setProperties(current => current.filter(property => property.id !== id));
	};

	return {
		properties,
		pagination,
		setProperties,
		loading,
		error,
		refresh,
		loadProperty,
		addProperty,
		removeProperty,
		updateProperty: async (id, payload) => replaceProperty(await updateProperty(id, payload)),
		approveProperty: async (id, isApproved) => replaceProperty(await approveProperty(id, isApproved)),
		confirmPropertyAvailability: async id => replaceProperty(await confirmPropertyAvailability(id)),
		updatePropertyStatus: async (id, status, details) => replaceProperty(await updatePropertyStatus(id, status, details)),
		featureProperty: async (id, featured) => replaceProperty(await featureProperty(id, featured)),
		normalizeProperty,
	};
}
