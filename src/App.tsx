import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Loading, ToastHost } from './components/ui';
import { AttendancePage } from './pages/AttendancePage';
import { CalendarPage } from './pages/CalendarPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { PlayerDetailPage } from './pages/PlayerDetailPage';
import { PlayersPage } from './pages/PlayersPage';
import { ReportPage } from './pages/ReportPage';
import { RulesPage } from './pages/RulesPage';

// HashRouter: GitHub Pages no reescribe rutas, así que /#/plantilla funciona
// al recargar o compartir un enlace sin necesidad de un 404.html.

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/acceso" replace state={{ from: location.pathname }} />;
  return children;
}

export function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/acceso" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="categorias" element={<CategoriesPage />} />
            <Route path="plantilla" element={<PlayersPage />} />
            <Route path="plantilla/:id" element={<PlayerDetailPage />} />
            <Route path="asistencia" element={<AttendancePage />} />
            <Route path="reporte" element={<ReportPage />} />
            <Route path="calendario" element={<CalendarPage />} />
            <Route path="reglas" element={<RulesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      <ToastHost />
    </AuthProvider>
  );
}
