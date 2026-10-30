import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import GoogleSignInButton from '../components/GoogleSignInButton';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('student');
  const [collegeName, setCollegeName] = useState('');
  const [homeCollegeName, setHomeCollegeName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Load public config to pre-fill college name
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.homeCollegeName) {
          setHomeCollegeName(data.homeCollegeName);
          setCollegeName(data.homeCollegeName);
        }
      })
      .catch((err) => console.error('Failed to load config:', err));
  }, []);

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

    // Client-side quick checks
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must contain at least one letter and one number.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          college_name: collegeName || homeCollegeName,
          role,
          password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (Array.isArray(data.details)) {
          setError(data.details.map((d) => d.message).join(', '));
        } else {
          setError(data.details || data.error || 'Registration failed');
        }
      } else {
        login(data.user);
        navigate('/poll');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '2rem auto 0', padding: '0 1rem' }}>
      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            Portal Registration
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Register as a Student or Faculty member
          </p>
        </div>

        {error && <div className="alert alert-error" id="register-error-msg">{error}</div>}

        {/* Quick Google Sign-Up with Domain Restriction */}
        <div style={{ marginBottom: '1rem' }}>
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label className="form-label" htmlFor="register-google-role">Register As</label>
            <select
              id="register-google-role"
              className="form-select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="student">Student</option>
              <option value="faculty">Faculty</option>
            </select>
            <span className="form-hint">Select your role before signing up with your Google account</span>
          </div>

          <GoogleSignInButton
            text="signup_with"
            role={role}
            collegeName={collegeName || homeCollegeName}
            name={name}
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            disabled={submitting}
          />
        </div>

        <div className="auth-divider">
          <span>or create standard account</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="register-name">Full Name</label>
            <input
              id="register-name"
              type="text"
              required
              className="form-input"
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-email">Email Address</label>
            <input
              id="register-email"
              type="email"
              required
              className="form-input"
              placeholder="e.g. rahul@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-role">Role</label>
            <select
              id="register-role"
              className="form-select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="student">Student</option>
              <option value="faculty">Faculty</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-college">College / Institution Name</label>
            <input
              id="register-college"
              type="text"
              required
              className="form-input"
              placeholder="Enter your college name"
              value={collegeName}
              onChange={(e) => setCollegeName(e.target.value)}
            />
            {Boolean(homeCollegeName) && (
              <span className="form-hint">Host institution name</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-password">Password</label>
            <input
              id="register-password"
              type="password"
              required
              className="form-input"
              placeholder="Minimum 8 characters with letter & number"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="form-hint">Must be 8-72 characters, with at least 1 letter and 1 digit</span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.75rem' }}
            id="register-submit-btn"
          >
            {submitting ? 'Creating account...' : 'Complete Registration'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: 600 }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
