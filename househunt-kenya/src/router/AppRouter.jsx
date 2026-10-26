import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import AppShell from "../pages/AppShell";
import ProtectedRoute from "./ProtectedRoute";

function resolveRoute(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const propertyMatch = path.match(/^\/property\/([^/]+)$/);
  const routes = {
    "/": { tab: "home" },
    "/login": { tab: "home", authMode: "login" },
    "/register": { tab: "home", authMode: "register" },
    "/reset-password": { tab: "home", authMode: "reset" },
    "/guide": { tab: "guide" },
    "/tenant": { tab: "tenant", allowedRole: "tenant" },
    "/saved": { tab: "saved" },
    "/landlord": { tab: "landlord", allowedRole: "landlord" },
    "/admin": { tab: "admin", allowedRole: "admin" },
  };

  if (propertyMatch) {
    return { tab: "home", propertyId: propertyMatch[1] };
  }

  return routes[path] || { tab: "home", notFound: true };
}

function AppRoute() {
  const location = useLocation();
  const route = resolveRoute(location.pathname);

  return (
    <ProtectedRoute allowedRole={route.allowedRole}>
      <AppShell
        initialTab={route.tab}
        authMode={route.authMode || null}
        propertyId={route.propertyId || null}
        notFound={Boolean(route.notFound)}
      />
    </ProtectedRoute>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<AppRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
