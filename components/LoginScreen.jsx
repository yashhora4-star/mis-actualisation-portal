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
                                                                                       error ? React.createElement('div', { className: 'error-text' }, error) : null
                                                                                     )
                                                         )
                               );
}
