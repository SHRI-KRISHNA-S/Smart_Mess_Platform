import React, { useEffect, useRef, useState } from 'react';

export default function GoogleSignInButton({
  text = 'continue_with',
  onSuccess,
  onError,
  role,
  collegeName,
  name,
  disabled = false
}) {
  const buttonContainerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState(import.meta.env.VITE_GOOGLE_CLIENT_ID || '');
  const [gisReady, setGisReady] = useState(false);

  // 1. Fetch public Google Client ID if not provided in Vite env
  useEffect(() => {
    if (!clientId) {
      fetch('/api/config')
        .then((res) => res.json())
        .then((data) => {
          if (data.googleClientId) {
            setClientId(data.googleClientId);
          }
        })
        .catch((err) => console.error('Failed to load Google Client ID config:', err));
    }
  }, [clientId]);

  // Memoized credential response handler
  const handleCredentialResponse = React.useCallback(async (response) => {
    if (!response?.credential) {
      if (onError) onError('No credential received from Google.');
      return;
    }

    setLoading(true);
    if (onError) onError(null);

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: response.credential,
          role,
          college_name: collegeName,
          name
        })
      });

      const data = await res.json();

      if (!res.ok) {
        const errorMsg = data.message || data.details || data.error || 'Google authentication failed.';
        if (onError) onError(errorMsg, data);
      } else {
        if (onSuccess) onSuccess(data.user);
      }
    } catch (_err) {
      if (onError) onError('Connection error during Google authentication. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [role, collegeName, name, onError, onSuccess]);

  // 2. Initialize Google Identity Services
  useEffect(() => {
    let checkInterval = null;

    const initGis = () => {
      if (window.google?.accounts?.id && clientId && buttonContainerRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            hosted_domain: 'bitsathy.ac.in',
            auto_select: false
          });

          // Clear any previous button renders
          buttonContainerRef.current.innerHTML = '';

          window.google.accounts.id.renderButton(buttonContainerRef.current, {
            theme: 'filled_black',
            size: 'large',
            text: text,
            shape: 'rectangular',
            width: 320,
            logo_alignment: 'left'
          });

          setGisReady(true);
          return true;
        } catch (_err) {
          // GIS initialization failed
        }
      }
      return false;
    };

    if (!initGis()) {
      checkInterval = setInterval(() => {
        if (initGis()) {
          clearInterval(checkInterval);
        }
      }, 300);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [clientId, text, handleCredentialResponse]);

  const handleFallbackClick = () => {
    if (!clientId) {
      if (onError) {
        onError('Google Sign-In is not yet configured. Please set GOOGLE_CLIENT_ID in backend/.env.');
      }
      return;
    }
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    }
  };

  return (
    <div className="google-auth-container">
      {/* Official Google Identity Services Render Target */}
      <div
        ref={buttonContainerRef}
        className="google-btn-wrapper"
        style={{ display: gisReady ? 'flex' : 'none' }}
        id="google-signin-btn-container"
      />

      {/* Styled Fallback / Loading Button */}
      {(!gisReady || loading) && (
        <button
          type="button"
          onClick={handleFallbackClick}
          disabled={disabled || loading}
          className="btn-google"
          id="google-fallback-btn"
        >
          <svg className="google-icon" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>
            {loading
              ? 'Verifying Google Account...'
              : text === 'signup_with'
              ? 'Register with Google'
              : 'Continue with Google'}
          </span>
        </button>
      )}

      {/* Domain Restriction Notice */}
      <div className="domain-restriction-notice">
        <span>Restricted to verified</span>
        <span className="domain-pill">@bitsathy.ac.in</span>
        <span>accounts</span>
      </div>
    </div>
  );
}
