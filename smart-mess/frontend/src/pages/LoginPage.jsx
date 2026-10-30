import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import GoogleSignInButton from '../components/GoogleSignInButton';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleGoogleSuccess = (userData) => {
    login(userData);
    if (userData.role === 'admin') {
      navigate('/admin');
    } else {
      navigate('/poll');
    }
  };

  const handleGoogleError = (errorMessage) => {
    setError(errorMessage);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.details || data.error || 'Invalid email or password');
      } else {
        login(data.user);
        if (data.user.role === 'admin') {
          navigate('/admin');
        } else {
          navigate('/poll');
        }
      }
    } catch (err) {
      setError('Connection error. Please ensure the backend server is running.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '440px', margin: '3rem auto 0', padding: '0 1rem' }}>
      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div className="nav-logo-icon" style={{ margin: '0 auto 0.75rem', width: '48px', height: '48px', fontSize: '1.5rem' }}>
            M
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Smart Mess Portal
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Sign in to submit your meal preference and intention
          </p>
        </div>

        {error && <div className="alert alert-error" id="login-error-msg">{error}</div>}

        {/* Google Authentication with BIT Domain Restriction */}
        <GoogleSignInButton
          text="signin_with"
          onSuccess={handleGoogleSuccess}
          onError={handleGoogleError}
          disabled={submitting}
        />

        <div className="auth-divider">
          <span>or sign in with credentials</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email Address</label>
            <input
              id="login-email"
              type="email"
              required
              className="form-input"
              placeholder="e.g. rahul@bitsathy.ac.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              required
              className="form-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
            id="login-submit-btn"
          >
            {submitting ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
          Students sign in directly with their verified BIT Google account.<br />
          Student accounts and department details are established automatically.
        </div>
      </div>
    </div>
  );
}
