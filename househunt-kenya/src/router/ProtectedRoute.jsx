import { Navigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";

export default function ProtectedRoute({ children, allowedRole }) {
  const { user, isRestoring } = useAuth();
  const userDashboard = user ? {
    admin: "/admin",
    landlord: "/landlord",
    tenant: "/tenant",
  }[user.role] : null;

  if (isRestoring) return null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== allowedRole) {
    return <Navigate to={userDashboard || "/"} replace />;
  }

  return children;
}
