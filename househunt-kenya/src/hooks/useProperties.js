import { useCallback, useEffect, useState } from "react";
import { getProperties } from "../services/propertyService";

export default function useProperties() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadProperties = useCallback(async () => {
    try {
      const { data } = await getProperties();
      setProperties(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  return {
    properties,
    loading,
    reload: loadProperties,
  };
}