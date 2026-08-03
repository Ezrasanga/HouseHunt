import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import AppShell from "../pages/AppShell";
import ProtectedRoute from "./ProtectedRoute";

function PropertyRoute() {
  const { id } = useParams();
  return <AppShell initialTab={"home"} propertyId={id} />;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell initialTab="home" />} />
        <Route path="/login" element={<AppShell initialTab="home" authMode="login" />} />
        <Route path="/register" element={<AppShell initialTab="home" authMode="register" />} />
        <Route path="/property/:id" element={<PropertyRoute />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRole="admin">
              <AppShell initialTab="admin" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/landlord"
          element={
            <ProtectedRoute allowedRole="landlord">
              <AppShell initialTab="landlord" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tenant"
          element={
            <ProtectedRoute allowedRole="tenant">
              <AppShell initialTab="tenant" />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
