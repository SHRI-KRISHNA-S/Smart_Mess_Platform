import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getRoleLabel = () => {
    if (!user) return '';
    if (user.role === 'admin') return 'Kitchen Admin';
    if (user.role === 'faculty') return 'Faculty';
    return 'Student';
  };

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <div className="nav-brand">
        <div className="nav-logo-icon" aria-hidden="true">M</div>
        <div className="nav-title-group">
          <Link to={user?.role === 'admin' ? '/admin' : '/poll'} className="nav-brand-title">
            Smart Mess
          </Link>
          <span className="nav-brand-subtitle">Dining & Food Waste Agent</span>
        </div>
      </div>

      {user && (
        <div className="nav-user-meta">
          <div className="user-badge">
            <span style={{ fontWeight: 600 }}>{user.name}</span>
            <span className={`badge-tag ${user.role === 'admin' ? 'admin' : user.role === 'faculty' ? 'faculty' : ''}`}>
              {getRoleLabel()}
            </span>
          </div>

          {user.role === 'admin' && (
            <Link to="/admin" className="btn btn-secondary btn-sm">
              Admin Dashboard
            </Link>
          )}

          <Link to="/poll" className="btn btn-secondary btn-sm">
            Mess Menu
          </Link>

          <button onClick={handleLogout} className="btn btn-secondary btn-sm" id="logout-btn">
            Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}
