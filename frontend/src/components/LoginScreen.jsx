import React, { useState } from 'react';
import { auth, signInWithEmailAndPassword, authPersistenceReady } from '../firebase.js';

export default function LoginScreen({ hidden, blockedMessage }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (hidden) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authPersistenceReady;
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setPassword('');
    } catch (err) {
      setError('Unable to sign in. Check the email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="login-screen" id="loginScreen">
      <form className="login-card" id="loginForm" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="login-brand-pill">
            <span className="login-brand-dot"></span>WOYZ
          </span>
          <span>Admin</span>
        </div>
        <h1 className="login-title">Sign in</h1>
        <label className="login-label" htmlFor="loginEmail">Email address</label>
        <input
          className="login-input"
          id="loginEmail"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="login-label" htmlFor="loginPassword">Password</label>
        <input
          className="login-input"
          id="loginPassword"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn login-submit" id="loginSubmit" type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
        <div className="login-error" id="loginError" role="alert">
          {error}
          {blockedMessage && (
            <div className="blocked" dangerouslySetInnerHTML={{ __html: blockedMessage }} />
          )}
        </div>
      </form>
    </section>
  );
}
