import React, { useState, useEffect } from 'react';
import { MEAL_TIMING_CONFIG, getMealServingTime } from '../constants/mealTimings';
import AIFoodWastePrediction from '../components/AIFoodWastePrediction';

export default function AdminPage() {
  const [polls, setPolls] = useState([]);
  const [selectedPollId, setSelectedPollId] = useState(null);
  const [pollDetails, setPollDetails] = useState(null);
  const [threeMealsStats, setThreeMealsStats] = useState(null);
  const [activeMealTab, setActiveMealTab] = useState('lunch');
  const [expectedCountInput, setExpectedCountInput] = useState('');
  const [updatingExpected, setUpdatingExpected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Fetch admin polls list
  const fetchPolls = async () => {
    try {
      const res = await fetch('/api/admin/polls');
      if (res.ok) {
        const data = await res.json();
        setPolls(data.polls);
        if (data.polls.length > 0 && !selectedPollId) {
          setSelectedPollId(data.polls[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load admin polls:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch details for selected poll
  const fetchPollDetails = async (id) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/admin/polls/${id}/results`);
      if (res.ok) {
        const data = await res.json();
        setPollDetails(data);
      }
    } catch (err) {
      console.error('Failed to load poll details:', err);
    }
  };

  // Fetch three meals stats
  const fetchThreeMealsStats = async () => {
    try {
      const res = await fetch('/api/admin/three-meals-stats');
      if (res.ok) {
        const data = await res.json();
        setThreeMealsStats(data);
        const curr = data?.meals?.[activeMealTab];
        if (curr?.expectedCount !== undefined) {
          setExpectedCountInput(String(curr.expectedCount));
        }
      }
    } catch (err) {
      console.error('Failed to load three meals stats:', err);
    }
  };

  useEffect(() => {
    fetchPolls();
    fetchThreeMealsStats();
  }, []);

  useEffect(() => {
    if (selectedPollId) {
      fetchPollDetails(selectedPollId);
    }
  }, [selectedPollId]);

  useEffect(() => {
    const curr = threeMealsStats?.meals?.[activeMealTab];
    if (curr?.expectedCount !== undefined) {
      setExpectedCountInput(String(curr.expectedCount));
    }
  }, [activeMealTab, threeMealsStats]);

  // Open or close poll
  const togglePollStatus = async (pollId, currentStatus) => {
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/polls/${pollId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentStatus })
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.details || data.error || 'Failed to update poll status');
      } else {
        setSuccessMsg(data.message);
        await fetchPolls();
        await fetchPollDetails(pollId);
        await fetchThreeMealsStats();
      }
    } catch (err) {
      setErrorMsg('Network error updating poll');
    } finally {
      setActionLoading(false);
    }
  };

  // Update expected meals count for poll
  const handleUpdateExpectedCount = async (pollId) => {
    if (!pollId) return;
    const countNum = parseInt(expectedCountInput, 10);
    if (isNaN(countNum) || countNum < 0) {
      setErrorMsg('Please enter a valid non-negative integer for expected meals count.');
      return;
    }

    setUpdatingExpected(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/polls/${pollId}/expected-count`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedCount: countNum })
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.details || data.error || 'Failed to update expected meal count');
      } else {
        setSuccessMsg('Expected meals count updated successfully.');
        await fetchThreeMealsStats();
        if (selectedPollId) await fetchPollDetails(selectedPollId);
      }
    } catch (err) {
      setErrorMsg('Error updating expected count');
    } finally {
      setUpdatingExpected(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
        Loading Admin Dashboard...
      </div>
    );
  }

  const currentPoll = pollDetails?.poll;
  const currentMealStats = threeMealsStats?.meals?.[activeMealTab] || null;

  return (
    <div>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Kitchen Administration Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Monitor meal preparation intelligence, attendance calculations, and manage daily polls
          </p>
        </div>

        {currentPoll && (
          <div>
            <button
              onClick={() => togglePollStatus(currentPoll.id, currentPoll.is_active)}
              disabled={actionLoading}
              className={`btn ${currentPoll.is_active ? 'btn-danger' : 'btn-primary'}`}
              id="admin-toggle-poll-btn"
            >
              {actionLoading
                ? 'Updating...'
                : currentPoll.is_active
                ? 'Close This Poll'
                : 'Reopen / Activate This Poll'}
            </button>
          </div>
        )}
      </div>

      {errorMsg && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{errorMsg}</div>}
      {successMsg && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{successMsg}</div>}

      {/* SECTION 1: Detailed Meal Information & Preparation Intelligence */}
      <div className="card" style={{ marginBottom: '2rem', padding: '1.75rem' }} id="admin-meal-intelligence-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <span className="badge-tag" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', marginBottom: '0.25rem', display: 'inline-block' }}>
              Kitchen Planning Intelligence
            </span>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
              Meal Preparation Breakdown
            </h2>
          </div>

          <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Target Date: <strong style={{ color: 'var(--text-main)' }}>{threeMealsStats?.targetMealDate}</strong>
          </div>
        </div>

        {/* Meal Selector Tabs */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {MEAL_TIMING_CONFIG.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveMealTab(tab.id)}
              className="btn"
              style={{
                backgroundColor: activeMealTab === tab.id ? 'var(--primary)' : 'var(--surface-alt)',
                color: activeMealTab === tab.id ? '#ffffff' : 'var(--text-main)',
                border: '1px solid var(--border-subtle)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 0.95rem'
              }}
              id={`admin-tab-${tab.id}`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '0.72rem',
                  opacity: 0.9,
                  padding: '0.1rem 0.4rem',
                  borderRadius: '3px',
                  backgroundColor: activeMealTab === tab.id ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.08)'
                }}
              >
                {tab.servingHours}
              </span>
            </button>
          ))}
        </div>

        {currentMealStats && (
          <div>
            {/* Top 5 Stat Boxes */}
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-box" id="admin-stat-expected">
                <div className="stat-value" style={{ color: '#60a5fa' }}>
                  {currentMealStats.expectedCount}
                </div>
                <div className="stat-label">Expected Meals</div>
              </div>

              <div className="stat-box" id="admin-stat-yes">
                <div className="stat-value" style={{ color: 'var(--primary)' }}>
                  {currentMealStats.yesVotes}
                </div>
                <div className="stat-label">YES Votes</div>
              </div>

              <div className="stat-box" id="admin-stat-no">
                <div className="stat-value" style={{ color: 'var(--danger)' }}>
                  {currentMealStats.noVotes}
                </div>
                <div className="stat-label">NO Votes (Skip)</div>
              </div>

              <div className="stat-box" id="admin-stat-unvoted">
                <div className="stat-value" style={{ color: 'var(--text-dim)' }}>
                  {currentMealStats.notVoted}
                </div>
                <div className="stat-label">Not Voted</div>
              </div>

              <div className="stat-box" style={{ border: '2px solid var(--primary)', backgroundColor: 'rgba(16, 185, 129, 0.08)' }} id="admin-stat-prepare">
                <div className="stat-value" style={{ color: 'var(--primary)', fontSize: '2.4rem' }}>
                  {currentMealStats.mealsToPrepare}
                </div>
                <div className="stat-label" style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                  Meals to Prepare
                </div>
              </div>
            </div>

            {/* Formula Explanation Banner */}
            <div
              style={{
                backgroundColor: 'var(--surface-alt)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.9rem 1.25rem',
                fontSize: '0.9rem',
                marginBottom: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem'
              }}
            >
              <div>
                <strong>Authoritative Calculation:</strong>{' '}
                <span style={{ color: '#60a5fa' }}>{currentMealStats.expectedCount} Expected</span> −{' '}
                <span style={{ color: 'var(--danger)' }}>{currentMealStats.noVotes} NO Votes</span> ={' '}
                <strong style={{ color: 'var(--primary)', fontSize: '1.05rem' }}>
                  {currentMealStats.mealsToPrepare} Meals to Prepare
                </strong>
              </div>

              <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                Status:{' '}
                <span
                  className="badge-tag"
                  style={{
                    backgroundColor: currentMealStats.isClosed ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                    color: currentMealStats.isClosed ? '#fb7185' : '#34d399'
                  }}
                >
                  {currentMealStats.status}
                </span>
                {' '}| Deadline: <strong>{currentMealStats.deadlineFormatted}</strong>
                {' '}| Serving: <strong style={{ color: '#93c5fd' }}>{getMealServingTime(currentMealStats.mealType)}</strong>
              </div>
            </div>

            {/* Structured Table of Details */}
            <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
              <table className="data-table" id="admin-meal-breakdown-table">
                <thead>
                  <tr>
                    <th>Detail</th>
                    <th>Value</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Meal Type</strong></td>
                    <td><span className="badge-tag">{currentMealStats.mealName}</span></td>
                    <td style={{ color: 'var(--text-muted)' }}>Selected service ({currentMealStats.mealType})</td>
                  </tr>
                  <tr>
                    <td><strong>Serving Time</strong></td>
                    <td><strong style={{ color: '#93c5fd' }}>{getMealServingTime(currentMealStats.mealType)}</strong></td>
                    <td style={{ color: 'var(--text-muted)' }}>Official serving window ({getMealServingTime(currentMealStats.mealType)} IST)</td>
                  </tr>
                  <tr>
                    <td><strong>Meal Date</strong></td>
                    <td><strong>{currentMealStats.mealDate}</strong></td>
                    <td style={{ color: 'var(--text-muted)' }}>Scheduled dining date</td>
                  </tr>
                  {currentMealStats.eligibleStudentCount !== undefined && (
                    <tr>
                      <td><strong>Eligible Students</strong></td>
                      <td style={{ color: '#a78bfa', fontWeight: 600 }}>{currentMealStats.eligibleStudentCount}</td>
                      <td style={{ color: 'var(--text-muted)' }}>Actual resident student headcount in system</td>
                    </tr>
                  )}
                  <tr>
                    <td><strong>Expected Meals</strong></td>
                    <td style={{ color: '#60a5fa', fontWeight: 700, fontSize: '1.1rem' }}>{currentMealStats.expectedCount}</td>
                    <td style={{ color: 'var(--text-muted)' }}>Baseline anticipated resident headcount</td>
                  </tr>
                  <tr>
                    <td><strong>YES Votes</strong></td>
                    <td style={{ color: 'var(--primary)', fontWeight: 600 }}>{currentMealStats.yesVotes}</td>
                    <td style={{ color: 'var(--text-muted)' }}>Students who confirmed attendance (does not reduce count)</td>
                  </tr>
                  <tr>
                    <td><strong>NO Votes</strong></td>
                    <td style={{ color: 'var(--danger)', fontWeight: 600 }}>{currentMealStats.noVotes}</td>
                    <td style={{ color: 'var(--text-muted)' }}>Students skipping meal (reduces expected count by 1 each)</td>
                  </tr>
                  <tr>
                    <td><strong>Not Voted</strong></td>
                    <td style={{ color: 'var(--text-dim)' }}>{currentMealStats.notVoted}</td>
                    <td style={{ color: 'var(--text-muted)' }}>Eligible students who have not responded (does not reduce count)</td>
                  </tr>
                  <tr style={{ backgroundColor: 'rgba(16, 185, 129, 0.08)' }}>
                    <td><strong style={{ color: 'var(--primary)', fontSize: '1.05rem' }}>Meals to Prepare</strong></td>
                    <td style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.3rem' }}>{currentMealStats.mealsToPrepare}</td>
                    <td style={{ color: 'var(--text-main)', fontWeight: 600 }}>Final kitchen portion demand ({currentMealStats.expectedCount} − {currentMealStats.noVotes})</td>
                  </tr>
                  <tr>
                    <td><strong>Poll Status</strong></td>
                    <td>
                      <span
                        className="badge-tag"
                        style={{
                          backgroundColor: currentMealStats.isClosed ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: currentMealStats.isClosed ? '#fb7185' : '#34d399'
                        }}
                      >
                        {currentMealStats.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{currentMealStats.isClosed ? 'Voting is closed' : 'Voting currently open'}</td>
                  </tr>
                  <tr>
                    <td><strong>Closing Deadline</strong></td>
                    <td><strong>{currentMealStats.deadlineFormatted}</strong></td>
                    <td style={{ color: 'var(--text-muted)' }}>Calculated in Asia/Kolkata (IST)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Configure Expected Meal Count Form */}
            <div style={{ backgroundColor: 'var(--surface-raised)', padding: '1rem 1.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Adjust Expected Meal Count for <strong>{currentMealStats.mealName}</strong>:
              </div>
              <input
                type="number"
                min="0"
                value={expectedCountInput}
                onChange={(e) => setExpectedCountInput(e.target.value)}
                style={{
                  width: '120px',
                  padding: '0.45rem 0.75rem',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border-medium)',
                  backgroundColor: 'var(--surface-card)',
                  color: 'var(--text-main)',
                  fontWeight: 600
                }}
                id={`input-expected-${activeMealTab}`}
              />
              <button
                onClick={() => handleUpdateExpectedCount(currentMealStats.pollId)}
                disabled={updatingExpected}
                className="btn btn-secondary btn-sm"
                id={`save-expected-${activeMealTab}`}
              >
                {updatingExpected ? 'Saving...' : 'Update Expected Count'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: AI Food Waste Prediction & Preparation Guidance */}
      <AIFoodWastePrediction currentMealStats={currentMealStats} />

      {/* SECTION 3: Top Stat Overview Grid for Registered Users */}
      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-value">{pollDetails?.registeredStudentCount || 0}</div>
          <div className="stat-label">Registered Students</div>
        </div>

        <div className="stat-box">
          <div className="stat-value">{pollDetails?.registeredFacultyCount || 0}</div>
          <div className="stat-label">Registered Faculty</div>
        </div>

        <div className="stat-box">
          <div className="stat-value">{pollDetails?.totalRegisteredUsers || 0}</div>
          <div className="stat-label">Total Users</div>
        </div>

        <div className="stat-box">
          <div className="stat-value">{pollDetails?.totalVotes || 0}</div>
          <div className="stat-label">Total Poll Votes</div>
        </div>
      </div>

      {/* SECTION 3: Detailed Individual Voters Audit Table */}
      <div className="card">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 700 }}>
          Individual Voter Records ({pollDetails?.voters?.length || 0})
        </h2>

        {pollDetails?.voters?.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No votes recorded yet for this poll.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Voter Name</th>
                  <th>College Name</th>
                  <th>Role</th>
                  <th>Selected Choice</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {pollDetails?.voters?.map((v) => (
                  <tr key={v.id}>
                    <td><strong>{v.user_name}</strong></td>
                    <td>{v.college_name}</td>
                    <td>
                      <span className="badge-tag">
                        {v.role === 'faculty' ? 'Faculty' : v.role === 'student' ? 'Student' : (v.student_type || 'Student')}
                      </span>
                    </td>
                    <td style={{ color: 'var(--primary)', fontWeight: 600 }}>{v.choice}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                      {new Date(v.voted_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
