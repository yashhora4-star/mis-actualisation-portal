'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';

// Landing page for invite / magic-link emails. Supabase's implicit flow puts
// the session tokens in the URL hash - the browser client (detectSessionInUrl
// is on by default) picks those up automatically on load. Invited members have
// no password yet, so this is also where they set their first one via
// supabase.auth.updateUser({ password }), which only works while that
// hash-derived session is active.
export default function SetPasswordScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    const supabase = getSupabaseBrowser();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  if (checking) {
    return React.createElement('div', { className: 'login-wrap' },
      React.createElement('div', { className: 'login-card' }, 'Loading...')
    );
  }

  if (!hasSession) {
    return React.createElement('div', { className: 'login-wrap' },
      React.createElement('div', { className: 'login-card' },
        React.createElement('h1', null, 'Link expired'),
        React.createElement('p', null, 'This invite or sign-in link is no longer valid. Ask your admin to resend it from Team, then open the new email link.'),
        React.createElement('a', { className: 'btn primary', href: '/login', style: { display: 'inline-block', marginTop: 10 } }, 'Back to sign in')
      )
    );
  }

  return React.createElement('div', { className: 'login-wrap' },
    React.createElement('div', { className: 'login-card' },
      React.createElement('h1', null, 'Set your password'),
      React.createElement('p', null, "You're verified - choose a password to sign in with from now on."),
      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { className: 'field' },
          React.createElement('label', { htmlFor: 'password' }, 'New password'),
          React.createElement('input', {
            id: 'password', type: 'password', value: password,
            onChange: (e) => setPassword(e.target.value), required: true, minLength: 8,
          })
        ),
        React.createElement('div', { className: 'field' },
          React.createElement('label', { htmlFor: 'confirm' }, 'Confirm password'),
          React.createElement('input', {
            id: 'confirm', type: 'password', value: confirm,
            onChange: (e) => setConfirm(e.target.value), required: true, minLength: 8,
          })
        ),
        React.createElement('button', {
          className: 'btn primary', style: { width: '100%' }, disabled: saving, type: 'submit',
        }, saving ? 'Saving...' : 'Set password & continue'),
        error ? React.createElement('div', { className: 'error-text' }, error) : null
      )
    )
  );
}
