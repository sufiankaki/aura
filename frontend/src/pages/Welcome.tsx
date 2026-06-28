import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Welcome() {
  const { isAuthenticated, error, initiateSignIn, confirmOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || '/dashboard';

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate(from, { replace: true });
    return null;
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || email.length > 254 || !email.includes('@')) return;
    setLoading(true);
    try {
      await initiateSignIn(email.trim());
      setStep('otp');
    } catch {
      // error is set in AuthContext
    } finally {
      setLoading(false);
    }
  }

  async function handleOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim()) return;
    setLoading(true);
    try {
      await confirmOtp(otp.trim());
      navigate(from, { replace: true });
    } catch {
      // error is set in AuthContext
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="welcome-page">
      <div className="welcome-hero">
        <h1>Aura</h1>
        <p>Your AI Agent Platform — Powered by AWS Bedrock AgentCore</p>
        <p className="welcome-desc">
          Access AI agents configured by your administrator. Sign in with your email
          to get started — no password required.
        </p>
      </div>

      <div className="auth-card">
        {step === 'email' ? (
          <form onSubmit={handleEmail}>
            <h2>Sign In</h2>
            <p>Enter your email to receive a one-time code.</p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              maxLength={254}
              disabled={loading}
              autoFocus
            />
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Sending...' : 'Send Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtp}>
            <h2>Enter Code</h2>
            <p>We sent a code to <strong>{email}</strong></p>
            <input
              type="text"
              value={otp}
              onChange={e => setOtp(e.target.value)}
              placeholder="Enter code"
              required
              disabled={loading}
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button type="button" onClick={() => setStep('email')} className="btn-link">
              Use a different email
            </button>
          </form>
        )}
        {error && <p className="error-msg">{error}</p>}
      </div>
    </div>
  );
}
