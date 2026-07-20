'use client';
import React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Self-service "forgot / set password" - lets anyone trigger their own
  // reset email straight from the login screen, no admin/Supabase dashboard
  // involved. Same link works for a brand-new invite that never got a
  // password and for an existing member who forgot theirs.
  const [forgotMode, setForgotMode] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = getSupabaseBrowser();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  async function handleReset(e) {
    e.preventDefault();
    setResetError('');
    if (!email) {
      setResetError('Enter your email above first.');
      return;
    }
    setResetLoading(true);
    const supabase = getSupabaseBrowser();
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/set-password`,
    });
    setResetLoading(false);
    if (resetErr) {
      setResetError(resetErr.message);
      return;
    }
    setResetSent(true);
  }

  if (forgotMode) {
    return React.createElement('div', { className: 'login-wrap' },
      React.createElement('div', { className: 'login-card' },
        React.createElement('h1', null, 'Reset your password'),
        resetSent
          ? React.createElement('div', null,
              React.createElement('p', null, `If an account exists for ${email}, a reset link is on its way - check your inbox (and spam folder).`),
              React.createElement('button', {
                className: 'btn primary', style: { width: '100%', marginTop: 10 },
                onClick: () => { setForgotMode(false); setResetSent(false); },
              }, 'Back to sign in')
            )
          : React.createElement('form', { onSubmit: handleReset },
              React.createElement('div', { className: 'field' },
                React.createElement('label', { htmlFor: 'reset-email' }, 'Email'),
                React.createElement('input', {
                  id: 'reset-email', type: 'email', value: email,
                  onChange: (e) => setEmail(e.target.value), required: true,
                })
              ),
              React.createElement('button', {
                className: 'btn primary', style: { width: '100%' }, disabled: resetLoading, type: 'submit',
              }, resetLoading ? 'Sending...' : 'Send reset link'),
              resetError ? React.createElement('div', { className: 'error-text' }, resetError) : null,
              React.createElement('button', {
                type: 'button', className: 'btn', style: { width: '100%', marginTop: 10 },
                onClick: () => setForgotMode(false),
              }, 'Back to sign in')
            )
      )
    );
  }

  return React.createElement('div', { className: 'login-wrap' },
    React.createElement('div', { className: 'login-card' },
      React.createElement('h1', null, 'MIS & Actualisation Portal'),
      React.createElement('p', null, 'Receivable + payable tracking, accounts team'),
      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { className: 'field' },
          React.createElement('label', { htmlFor: 'email' }, 'Email'),
          React.createElement('input', {
            id: 'email', type: 'email', value: email,
            onChange: (e) => setEmail(e.target.value), required: true,
          })
        ),
        React.createElement('div', { className: 'field' },
          React.createElement('label', { htmlFor: 'password' }, 'Password'),
          React.createElement('input', {
            id: 'password', type: 'password', value: password,
            onChange: (e) => setPassword(e.target.value), required: true,
          })
        ),
        React.createElement('button', {
          className: 'btn primary', style: { width: '100%' }, disabled: loading, type: 'submit',
        }, loading ? 'Signing in...' : 'Sign in'),
        error ? React.createElement('div', { className: 'error-text' }, error) : null,
        React.createElement('button', {
          type: 'button',
          onClick: () => { setForgotMode(true); setError(''); },
          style: { background: 'none', border: 'none', color: 'var(--muted)', textDecoration: 'underline', cursor: 'pointer', marginTop: 10, fontSize: 13, padding: 0 },
        }, "Forgot your password / first time signing in?")
      )
    )
  );
}
