import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, allowedRole }) {
  if (typeof window === "undefined") {
    return null;
  }

  const user = JSON.parse(window.localStorage.getItem("househunt-user") || "null");

  if (!user || user.role !== allowedRole) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
