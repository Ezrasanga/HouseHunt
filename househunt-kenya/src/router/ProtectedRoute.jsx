import { Navigate, useLocation } from "react-router-dom";
import useAuth from "../hooks/useAuth";

export default function ProtectedRoute({ children, allowedRole }) {
  const { user, isRestoring } = useAuth();
  const location = useLocation();
  const userDashboard = user ? {
    admin: "/admin",
    landlord: "/landlord",
    tenant: "/tenant",
  }[user.role] : null;

  if (!allowedRole) return children;
  if (isRestoring) {
    return <div className="route-loading" role="status">Restoring your session…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location, role: allowedRole }} />;
  }

  if (user.role !== allowedRole) {
    return <Navigate to={userDashboard || "/"} replace />;
  }

  return children;
}
