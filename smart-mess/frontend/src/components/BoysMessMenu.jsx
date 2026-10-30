import React, { useState, useEffect, useCallback } from 'react';
import { MEAL_SERVING_TIMES } from '../constants/mealTimings';

// Returns current calendar date in Asia/Kolkata timezone (YYYY-MM-DD)
function getTodayKolkataString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function getTomorrowKolkataString() {
  const todayStr = getTodayKolkataString();
  const [year, month, day] = todayStr.split('-').map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  return nextDay.toISOString().split('T')[0];
}

const MEAL_ICONS = {
  breakfast: '☀️',
  lunch: '🌤️',
  dinner: '🌙'
};

const MEAL_DEFAULT_HOURS = MEAL_SERVING_TIMES;

export default function BoysMessMenu() {
  const [hostel, setHostel] = useState('boys');
  const [selectedDate, setSelectedDate] = useState(getTodayKolkataString);
  const [activeMealTab, setActiveMealTab] = useState('lunch');
  const [menuData, setMenuData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showPdf, setShowPdf] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  const fetchLiveMenu = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMsg(null);

    try {
      const url = `/api/mess-menu?hostel=${hostel}&date=${selectedDate}${isManualRefresh ? '&refresh=true' : ''}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.details || data.error || 'Failed to fetch mess menu');
      }

      setMenuData(data);

      // Auto-focus current meal if returned and matches valid category
      const currentType = data?.currentMeal?.mealType?.toLowerCase?.();
      if (currentType && ['breakfast', 'lunch', 'dinner'].includes(currentType)) {
        setActiveMealTab(currentType);
      }
    } catch (err) {
      console.error('Mess menu fetch error:', err);
      setErrorMsg('Unable to fetch the menu. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hostel, selectedDate]);

  useEffect(() => {
    fetchLiveMenu(false);
  }, [fetchLiveMenu]);

  const handleHostelChange = (newHostel) => {
    if (newHostel !== hostel) {
      setHostel(newHostel);
    }
  };

  const handleDateChange = (newDate) => {
    if (newDate) {
      setSelectedDate(newDate);
    }
  };

  const currentMealObj = menuData?.currentMeal;
  const hasCurrentMealItems = Array.isArray(currentMealObj?.items) && currentMealObj.items.length > 0;
  const currentTabItems = menuData?.fullMenu?.[activeMealTab] || [];
  const isLoading = loading || refreshing;

  return (
    <div className="card" style={{ maxWidth: '1060px', margin: '0 auto 1.75rem auto' }}>
      {/* Header Strip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
            Mess Dining Schedule & Menu
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', marginTop: '0.25rem' }}>
            {menuData?.day ? `${menuData.day}, ` : ''}{selectedDate} &bull; {hostel === 'boys' ? 'Boys Mess' : 'Girls Mess'} Daily Service
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => fetchLiveMenu(true)}
            disabled={loading || refreshing}
            className="btn btn-secondary btn-sm"
            id="refresh-menu-btn"
            title="Fetch latest updates from source"
          >
            {refreshing ? (
              <>
                <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: '0.4rem' }} />
                Refreshing...
              </>
            ) : (
              '↻ Refresh Live Data'
            )}
          </button>

          <button
            onClick={() => setShowPdf(prev => !prev)}
            className="btn btn-secondary btn-sm"
            id="toggle-pdf-btn"
          >
            {showPdf ? 'Hide Monthly PDF' : 'Monthly PDF Schedule'}
          </button>
        </div>
      </div>

      {/* Control Bar: Hostel & Date Switchers */}
      <div className="live-menu-controls">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Hostel:
          </span>
          <div className="hostel-tabs">
            <button
              onClick={() => handleHostelChange('boys')}
              className={`hostel-tab-btn ${hostel === 'boys' ? 'active' : ''}`}
              id="hostel-boys-btn"
            >
              Boys Mess
            </button>
            <button
              onClick={() => handleHostelChange('girls')}
              className={`hostel-tab-btn ${hostel === 'girls' ? 'active' : ''}`}
              id="hostel-girls-btn"
            >
              Girls Mess
            </button>
          </div>
        </div>

        <div className="date-controls-group">
          <label htmlFor="menu-date-picker" style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Date:
          </label>
          <input
            id="menu-date-picker"
            type="date"
            className="date-input-field"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleDateChange(getTodayKolkataString())}
          >
            Today
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleDateChange(getTomorrowKolkataString())}
          >
            Tomorrow
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {errorMsg && !isLoading && (
        <div className="alert alert-error" style={{ margin: '1rem 0' }} id="menu-fetch-error">
          <div style={{ flex: 1 }}>
            <strong>Notice:</strong> {errorMsg}
          </div>
          <button
            onClick={() => fetchLiveMenu(true)}
            className="btn btn-secondary btn-sm"
            style={{ marginLeft: '1rem' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Screen with Mess Cook Sticker */}
      {isLoading ? (
        <div
          id="mess-cook-loading-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2.5rem 1.5rem',
            margin: '2rem auto',
            maxWidth: '440px',
            backgroundColor: 'var(--surface-alt)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
            textAlign: 'center'
          }}
        >
          <img
            src="/images/mess-cook.png"
            alt="Fetching fresh mess menu"
            id="mess-cook-loading-img"
            style={{
              width: '100%',
              maxWidth: '220px',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
              margin: '0 auto',
              filter: 'drop-shadow(0 6px 16px rgba(0, 0, 0, 0.3))'
            }}
          />
          <div
            id="mess-cook-loading-text"
            style={{
              marginTop: '1.25rem',
              fontSize: '1.15rem',
              fontWeight: 600,
              color: 'var(--text-main)',
              letterSpacing: '-0.01em'
            }}
          >
            Fetching fresh mess menu...
          </div>
        </div>
      ) : (
        <>

          {/* Meal Category Tabs */}
          <div>
            <div className="meal-tabs-nav" role="tablist">
              {['breakfast', 'lunch', 'dinner'].map((meal) => (
                <button
                  key={meal}
                  role="tab"
                  aria-selected={activeMealTab === meal}
                  onClick={() => setActiveMealTab(meal)}
                  className={`meal-tab-button ${activeMealTab === meal ? 'active' : ''}`}
                  id={`tab-${meal}`}
                >
                  <span>{MEAL_ICONS[meal]}</span>
                  <span style={{ textTransform: 'capitalize' }}>{meal}</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                    ({menuData?.fullMenu?.[meal]?.length || 0})
                  </span>
                </button>
              ))}
            </div>

            {/* Food Items for Selected Meal */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, textTransform: 'capitalize', color: 'var(--text-main)', margin: 0 }}>
                  {activeMealTab} Menu Items
                </h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Service Hours: <strong>{MEAL_DEFAULT_HOURS[activeMealTab]}</strong>
                </span>
              </div>

              {currentTabItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: 'var(--surface-raised)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>
                  <p>No menu items published for {activeMealTab} on this date.</p>
                </div>
              ) : (
                <div className="food-items-grid">
                  {currentTabItems.map((food, idx) => (
                    <div key={idx} className="food-item-card">
                      <div className="food-item-bullet" />
                      <span className="food-item-name">{food}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Collapsible Monthly PDF Document Viewer */}
      {showPdf && (
        <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Official Monthly Master PDF Roster</h3>
            <a
              href="/menus/boys-mess-menu-oct-2026.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
            >
              Open PDF in New Tab
            </a>
          </div>

          {pdfError ? (
            <div className="alert alert-error">
              <strong>Notice:</strong> Unable to embed document preview directly. Use the button above to view or download the file.
            </div>
          ) : (
            <div className="pdf-viewer-frame">
              <iframe
                src="/menus/boys-mess-menu-oct-2026.pdf#toolbar=0"
                title="Boys Mess Menu October 2026"
                style={{ width: '100%', height: '70svh', border: 'none', display: 'block' }}
                onError={() => setPdfError(true)}
              />
            </div>
          )}
        </div>
      )}


      <div className="disclaimer-banner">
        <strong>Dining Notice:</strong> Students and faculty dine according to the official daily mess schedule above. Please submit your daily meal attendance intentions above to help minimize food waste.
      </div>
    </div>
  );
}
