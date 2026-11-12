import { useState } from 'react'
import { db } from '../lib/supabase'

export default function AuthView() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await db().auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        })
        if (error) throw error
        if (data.user) {
          // Profile is also created by the database trigger; upsert here as a safety net.
          await db().from('profiles').upsert({
            id: data.user.id,
            username: email.split('@')[0],
            full_name: name || null,
          })
        }
        setNotice('Account created. Check your email to confirm, then sign in.')
      } else {
        const { error } = await db().auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <main className="main" style={{ maxWidth: 440, margin: '0 auto', width: '100%' }}>
        <div className="center" style={{ margin: '32px 0 20px' }}>
          <div className="logo" style={{ fontSize: 34 }}>
            Strava<span> Plus</span>
          </div>
          <p className="muted">Record, compete, and train together. Real athletes, real leaderboards.</p>
        </div>
        <div className="card">
          <div className="tabs">
            <button className={`chip ${mode === 'signin' ? 'active' : ''}`} onClick={() => setMode('signin')}>
              Sign in
            </button>
            <button className={`chip ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')}>
              Sign up
            </button>
          </div>
          {error && <div className="error">{error}</div>}
          {notice && <div className="card" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>{notice}</div>}
          <form onSubmit={submit}>
            {mode === 'signup' && (
              <div className="field">
                <label>Your name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mariano Rubalcava" required />
              </div>
            )}
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" required minLength={6} />
            </div>
            <button className="btn block" type="submit" disabled={busy}>
              {busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <p className="muted small center" style={{ marginTop: 12 }}>
            Your log starts empty. No sample athletes, no fake activities.
          </p>
        </div>
      </main>
    </div>
  )
}
