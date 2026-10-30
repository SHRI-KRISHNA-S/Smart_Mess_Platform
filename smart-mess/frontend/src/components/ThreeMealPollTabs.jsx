import React, { useState, useEffect, useCallback } from 'react';
import { MEAL_TIMING_CONFIG } from '../constants/mealTimings';
import { useAuth } from '../context/AuthContext';

/**
 * Calculates deadline info, live countdown, and warning color based on Asia/Kolkata timezone.
 */
function getDeadlineInfo(meal, now) {
  const isServerClosed = Boolean(meal?.isClosed);
  const closesAtStr = meal?.closesAt; // e.g. "2026-10-22 20:00:00"

  // Standard IST deadlines:
  // Breakfast & Lunch: 8:00 PM IST on previous calendar day
  // Dinner: 10:00 AM IST on meal date
  const deadlineTimeDisplay = meal?.mealType === 'dinner' ? '10:00 AM IST' : '8:00 PM IST';

  if (isServerClosed) {
    return {
      isClosed: true,
      countdownText: 'Poll closed',
      countdownColor: '#fb7185',
      deadlineDisplay: `Deadline: ${deadlineTimeDisplay}`
    };
  }

  if (!closesAtStr) {
    return {
      isClosed: false,
      countdownText: '',
      countdownColor: 'var(--text-muted)',
      deadlineDisplay: `Deadline: ${deadlineTimeDisplay}`
    };
  }

  // Parse as Asia/Kolkata (IST: UTC+05:30)
  const normalized = closesAtStr.trim().replace(' ', 'T').slice(0, 19);
  const targetMs = new Date(`${normalized}+05:30`).getTime();
  const diffMs = targetMs - now;

  if (isNaN(targetMs) || diffMs <= 0) {
    return {
      isClosed: true,
      countdownText: 'Poll closed',
      countdownColor: '#fb7185',
      deadlineDisplay: `Deadline: ${deadlineTimeDisplay}`
    };
  }

  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const pad = (n) => String(n).padStart(2, '0');
  const timeFormatted = days > 0
    ? `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`
    : `${pad(hours)}:${pad(mins)}:${pad(secs)}`;

  // Distinct warning colors:
  // < 30 minutes: urgent warning rose/red (#f43f5e)
  // < 2 hours: approaching warning amber (#f59e0b)
  // Otherwise: subtle muted text (#94a3b8)
  let countdownColor = 'var(--text-muted)';
  if (totalSec < 1800) {
    countdownColor = '#f43f5e';
  } else if (totalSec < 7200) {
    countdownColor = '#f59e0b';
  }

  return {
    isClosed: false,
    countdownText: `Closes in ${timeFormatted}`,
    countdownColor,
    deadlineDisplay: `Deadline: ${deadlineTimeDisplay}`
  };
}

export default function ThreeMealPollTabs() {
  const { user } = useAuth();
  const [pollData, setPollData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [votingMeal, setVotingMeal] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Update timer every second
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchPolls = useCallback(async () => {
    // Kitchen admins do not participate in polls
    if (user?.role === 'admin') {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/polls/three-meals');
      if (res.ok) {
        const data = await res.json();
        setPollData(data);
      }
    } catch (err) {
      console.error('Failed to fetch meal polls:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user?.role !== 'admin') {
      fetchPolls();
    } else {
      setLoading(false);
    }
  }, [fetchPolls, user]);

  const handleVote = async (mealType, voteChoice) => {
    if (user?.role === 'admin') return;
    const meal = pollData?.meals?.[mealType];
    const { isClosed } = getDeadlineInfo(meal, now);
    if (!meal || isClosed || meal.isClosed) return;

    setVotingMeal(mealType);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch('/api/polls/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealDate: meal.mealDate,
          mealType: mealType,
          voteChoice: voteChoice
        })
      });

      const result = await res.json();

      if (!res.ok) {
        setActionError(result.details || result.error || 'Failed to submit vote');
        await fetchPolls();
      } else {
        setActionSuccess(`Saved: ${meal.mealName} (${voteChoice})`);
        await fetchPolls();
      }
    } catch (err) {
      setActionError('Network error while recording meal selection. Please try again.');
    } finally {
      setVotingMeal(null);
    }
  };

  // Kitchen admins do not vote in student/resident polls
  if (user?.role === 'admin') {
    return null;
  }


  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
        <div
          style={{
            display: 'inline-block',
            width: '24px',
            height: '24px',
            border: '2px solid var(--border-medium)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            marginBottom: '0.5rem'
          }}
        />
        <div style={{ fontSize: '0.9rem' }}>Loading meals...</div>
      </div>
    );
  }

  const meals = pollData?.meals || {};

  return (
    <div
      className="card"
      id="simple-meal-polls-card"
      style={{
        maxWidth: '1060px',
        margin: '0 auto 1.75rem auto'
      }}
    >
      {/* Compact Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--border-subtle)'
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
            Meal Attendance Poll
          </h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
            Target Date: {pollData?.targetMealDate || 'Upcoming'}
          </div>
        </div>

        <button
          onClick={fetchPolls}
          id="refresh-polls-btn"
          title="Refresh polls"
          style={{
            background: 'none',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-xs)',
            color: 'var(--text-muted)',
            padding: '0.3rem 0.6rem',
            fontSize: '0.8rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-main)';
            e.currentTarget.style.borderColor = 'var(--border-medium)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.borderColor = 'var(--border-subtle)';
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Notifications */}
      {actionError && (
        <div
          className="alert alert-error"
          style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', marginBottom: '0.75rem' }}
        >
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div
          className="alert alert-success"
          style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem', marginBottom: '0.75rem' }}
        >
          {actionSuccess}
        </div>
      )}

      {/* Three Compact Horizontal Meal Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {MEAL_TIMING_CONFIG.map(({ id: mealType, label, servingHours }) => {
          const meal = meals[mealType];
          if (!meal) return null;

          const userVote = meal.userVote; // 'YES', 'NO', or 'Not voted'
          const isVoting = votingMeal === mealType;
          const { isClosed, countdownText, countdownColor, deadlineDisplay } = getDeadlineInfo(meal, now);
          const effectiveClosed = isClosed || meal.isClosed;

          return (
            <div
              key={mealType}
              id={`meal-section-${mealType}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
                padding: '0.9rem 1.25rem',
                backgroundColor: 'var(--surface-alt)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                transition: 'background-color 0.15s ease'
              }}
            >
              {/* Top Row: Meal Name & Serving Hours on left, Live Countdown Timer + Yes/No buttons on right */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.75rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: '1rem',
                      color: 'var(--text-main)'
                    }}
                  >
                    {label}
                  </span>

                  <span
                    id={`serving-time-${mealType}`}
                    className="badge-tag"
                    style={{
                      fontSize: '0.74rem',
                      padding: '0.14rem 0.5rem',
                      backgroundColor: 'rgba(59, 130, 246, 0.12)',
                      color: '#93c5fd',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      borderRadius: '4px',
                      fontWeight: 500
                    }}
                  >
                    Serving: {servingHours}
                  </span>

                  {effectiveClosed && (
                    <span
                      id={`status-badge-${mealType}`}
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '0.12rem 0.45rem',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(244, 63, 94, 0.14)',
                        color: '#fb7185',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                      }}
                    >
                      Closed
                    </span>
                  )}
                </div>

                {/* Right: Countdown timer & small Yes/No buttons aligned horizontally */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85rem',
                    flexWrap: 'wrap'
                  }}
                >
                  {/* Live Countdown Timer */}
                  <span
                    id={`countdown-${mealType}`}
                    style={{
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                      color: countdownColor,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {countdownText}
                  </span>

                  {/* Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    {/* YES option */}
                    <button
                      type="button"
                      id={`vote-yes-${mealType}`}
                      disabled={effectiveClosed || isVoting}
                      onClick={() => handleVote(mealType, 'YES')}
                      aria-label={`Vote YES for ${label}`}
                      style={{
                        minWidth: '56px',
                        padding: '0.35rem 0.85rem',
                        fontSize: '0.86rem',
                        fontWeight: userVote === 'YES' ? 700 : 500,
                        borderRadius: 'var(--radius-xs)',
                        cursor: effectiveClosed ? 'not-allowed' : 'pointer',
                        opacity: effectiveClosed ? 0.4 : 1,
                        transition: 'all 0.15s ease',
                        border: userVote === 'YES' ? '1px solid #10b981' : '1px solid var(--border-medium)',
                        backgroundColor: userVote === 'YES' ? '#10b981' : 'transparent',
                        color: userVote === 'YES' ? '#ffffff' : 'var(--text-main)',
                        boxShadow: userVote === 'YES' ? '0 1px 4px rgba(16, 185, 129, 0.35)' : 'none'
                      }}
                    >
                      {isVoting && userVote !== 'YES' ? '...' : 'Yes'}
                    </button>

                    {/* NO option */}
                    <button
                      type="button"
                      id={`vote-no-${mealType}`}
                      disabled={effectiveClosed || isVoting}
                      onClick={() => handleVote(mealType, 'NO')}
                      aria-label={`Vote NO for ${label}`}
                      style={{
                        minWidth: '56px',
                        padding: '0.35rem 0.85rem',
                        fontSize: '0.86rem',
                        fontWeight: userVote === 'NO' ? 700 : 500,
                        borderRadius: 'var(--radius-xs)',
                        cursor: effectiveClosed ? 'not-allowed' : 'pointer',
                        opacity: effectiveClosed ? 0.4 : 1,
                        transition: 'all 0.15s ease',
                        border: userVote === 'NO' ? '1px solid #f43f5e' : '1px solid var(--border-medium)',
                        backgroundColor: userVote === 'NO' ? '#f43f5e' : 'transparent',
                        color: userVote === 'NO' ? '#ffffff' : 'var(--text-main)',
                        boxShadow: userVote === 'NO' ? '0 1px 4px rgba(244, 63, 94, 0.35)' : 'none'
                      }}
                    >
                      {isVoting && userVote !== 'NO' ? '...' : 'No'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom Row: Question & Status message on left, Deadline time on right */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <div
                    id={`question-${mealType}`}
                    style={{
                      fontSize: '0.84rem',
                      color: 'var(--text-muted)'
                    }}
                  >
                    Planning to have this meal?
                  </div>

                  <div
                    id={`status-message-${mealType}`}
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      color: userVote === 'YES' ? '#34d399' : userVote === 'NO' ? '#fb7185' : 'var(--text-dim)'
                    }}
                  >
                    {meal.statusMessage || (!meal.hasVoted ? 'You have not voted yet.' : (userVote === 'YES' ? 'Your response is recorded: Attending meal.' : 'Your response is recorded: Skipping meal.'))}
                    {!meal.hasVoted && (
                      <span
                        id={`default-pref-${mealType}`}
                        style={{
                          marginLeft: '0.45rem',
                          color: '#60a5fa',
                          fontSize: '0.78rem',
                          fontWeight: 500
                        }}
                      >
                        (Default: Eating · YES)
                      </span>
                    )}
                  </div>
                </div>

                <div
                  id={`deadline-${mealType}`}
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--text-dim)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {deadlineDisplay}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
