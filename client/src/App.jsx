import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import EmployeeDashboard from './pages/EmployeeDashboard';
import LeavePage from './pages/LeavePage';
import AdminDashboard from './pages/AdminDashboard';
import SchedulePage from './pages/SchedulePage';
import PingChallengeResponder from './components/PingChallengeResponder';

function RequireAuth({ children }) {
  const { employee, loading } = useAuth();
  if (loading) return null;
  if (!employee) return <Navigate to="/login" replace />;
  return children;
}

function RequireManager({ children }) {
  const { isManager } = useAuth();
  if (!isManager) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<EmployeeDashboard />} />
        <Route path="/leave" element={<LeavePage />} />
        <Route
          path="/admin"
          element={
            <RequireManager>
              <AdminDashboard />
            </RequireManager>
          }
        />
        <Route
          path="/schedule"
          element={
            <RequireManager>
              <SchedulePage />
            </RequireManager>
          }
        />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <PingChallengeResponder />
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
