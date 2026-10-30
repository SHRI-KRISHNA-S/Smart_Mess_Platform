import React from 'react';
import { Link } from 'react-router-dom';
import ThreeMealPollTabs from '../components/ThreeMealPollTabs';
import { useAuth } from '../context/AuthContext';
import BoysMessMenu from '../components/BoysMessMenu';

export default function PollPage() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)' }}>
        <div style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid var(--border-medium)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '0.75rem' }} />
        <div>Authenticating session...</div>
      </div>
    );
  }

  const isKitchenAdmin = user?.role === 'admin';

  return (
    <div>
      <BoysMessMenu />
      {isKitchenAdmin ? (
        <div
          className="card"
          id="kitchen-admin-poll-notice"
          style={{
            maxWidth: '1060px',
            margin: '0 auto 1.5rem auto',
            padding: '1.25rem 1.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            backgroundColor: 'var(--surface-raised)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)'
          }}
        >
          <div>
            <span className="badge-tag admin" style={{ marginBottom: '0.35rem', display: 'inline-block' }}>
              Kitchen Admin View
            </span>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
              Viewing hostel mess menu. Meal attendance polls and preparation analytics are managed in the Kitchen Admin Dashboard.
            </div>
          </div>
          <Link to="/admin" className="btn btn-primary btn-sm" id="kitchen-admin-dashboard-link">
            Open Admin Dashboard
          </Link>
        </div>
      ) : (
        <ThreeMealPollTabs />
      )}
    </div>
  );
}

