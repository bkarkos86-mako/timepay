import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';

export default function Layout() {
  const { employee, logout, isManager } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="dot" />
          TimePay
        </div>
        <nav className="topbar-nav">
          <NavLink to="/" end>
            My Dashboard
          </NavLink>
          <NavLink to="/leave">Leave</NavLink>
          {isManager && <NavLink to="/admin">Admin</NavLink>}
          <NavLink to="/schedule">Schedule</NavLink>
        </nav>
        <div className="topbar-actions">
          <span className="muted">{employee?.firstName} {employee?.lastName}</span>
          <ThemeToggle />
          <button className="btn btn-secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
