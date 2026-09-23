import { Navigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";

export default function ProtectedRoute({ children, allowedRole }) {
  const { user, isRestoring } = useAuth();

  if (isRestoring) return null;

  if (!user || user.role !== allowedRole) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
