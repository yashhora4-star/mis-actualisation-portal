'use client';
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

  return (
        <div className="login-wrap">
              <div className="login-card">
                      <h1>MIS &amp; Actualisation Portal</h1>h1>
                      <p>Receivable + payable tracking, accounts team</p>p>
                      <form onSubmit={handleSubmit}>
                                <div className="field">
                                            <label htmlFor="email">Email</label>label>
                                            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                                </div>div>
                                <div className="field">
                                            <label htmlFor="password">Password</label>label>
                                            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                                </div>div>
                                <button className="btn primary" style={{ width: '100%' }} disabled={loading} type="submit">
                                  {loading ? 'Signing in...' : 'Sign in'}
                                </button>button>
                        {error && <div className="error-text">{error}</div>div>}
                      </form>form>
              </div>div>
        </div>div>
      );
}
</div>
