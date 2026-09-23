import { useCallback, useEffect, useState } from "react";
import {
	approveProperty,
	createProperty,
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

export default function useProperties({ limit = 12 } = {}) {
	const [properties, setProperties] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const refresh = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const result = await getProperties({ limit });
			setProperties(result.properties);
			return result;
		} catch (requestError) {
			setError(errorMessage(requestError));
			throw requestError;
		} finally {
			setLoading(false);
		}
	}, [limit]);

	useEffect(() => {
		let active = true;
		getProperties({ limit })
			.then(result => {
				if (active) setProperties(result.properties);
			})
			.catch(requestError => {
				if (active) setError(errorMessage(requestError));
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => { active = false; };
	}, [limit]);

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
		setProperties,
		loading,
		error,
		refresh,
		loadProperty,
		addProperty,
		removeProperty,
		updateProperty: async (id, payload) => replaceProperty(await updateProperty(id, payload)),
		approveProperty: async (id, isApproved) => replaceProperty(await approveProperty(id, isApproved)),
		updatePropertyStatus: async (id, status) => replaceProperty(await updatePropertyStatus(id, status)),
		featureProperty: async (id, featured) => replaceProperty(await featureProperty(id, featured)),
		normalizeProperty,
	};
}
