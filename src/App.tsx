import { useEffect, useState } from 'react'
import { db, isConfigured, supabase } from './lib/supabase'
import type { Profile, Unit } from './lib/types'
import AuthView from './components/AuthView'
import BeaconView from './components/BeaconView'
import { AthleteAvatar } from './components/ActivityCard'
import HomeView from './views/HomeView'
import FeedView from './views/FeedView'
import RecordView from './views/RecordView'
import ActivitiesView from './views/ActivitiesView'
import AnalyticsView from './views/AnalyticsView'
import SegmentsView from './views/SegmentsView'
import RoutesView from './views/RoutesView'
import ChallengesView from './views/ChallengesView'
import ClubsView from './views/ClubsView'
import GearView from './views/GearView'
import GoalsView from './views/GoalsView'
import ProfileView from './views/ProfileView'

type View =
  | 'home'
  | 'feed'
  | 'record'
  | 'activities'
  | 'analytics'
  | 'segments'
  | 'routes'
  | 'challenges'
  | 'clubs'
  | 'gear'
  | 'goals'
  | 'profile'

const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'feed', label: 'Feed', icon: '📰' },
  { id: 'record', label: 'Record', icon: '●' },
  { id: 'activities', label: 'Activities', icon: '📋' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
  { id: 'segments', label: 'Segments', icon: '🏁' },
  { id: 'routes', label: 'Routes', icon: '🗺️' },
  { id: 'challenges', label: 'Challenges', icon: '🏆' },
  { id: 'clubs', label: 'Clubs', icon: '👥' },
  { id: 'gear', label: 'Gear', icon: '👟' },
  { id: 'goals', label: 'Goals', icon: '🎯' },
  { id: 'profile', label: 'Profile', icon: '👤' },
]

function SetupScreen() {
  return (
    <div className="setup">
      <h1>
        Cadence needs setup
      </h1>
      <p>
        This app talks to a Supabase project for accounts, activities, and live tracking. No keys are
        bundled with the code — add your own:
      </p>
      <ol>
        <li>Create a project at supabase.com.</li>
        <li>
          Open the SQL Editor and run <code>supabase/migrations/001_strava_plus.sql</code> from this repo.
        </li>
        <li>
          Copy <code>.env.example</code> to <code>.env</code> and fill in your project URL and anon key
          (Project Settings → API).
        </li>
        <li>
          In Supabase Auth settings, set the Site URL to your deployed app URL (Vercel) so email
          confirmation links return to the app.
        </li>
        <li>Run <code>npm run dev</code> locally, or deploy to Vercel (see README.md).</li>
      </ol>
      <pre>{`VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-public-key`}</pre>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<View>('home')
  const [showMore, setShowMore] = useState(false)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(
    (localStorage.getItem('sp-theme') as 'light' | 'dark') || 'light',
  )
  const [unit, setUnit] = useState<Unit>((localStorage.getItem('sp-unit') as Unit) || 'km')

  const beaconId = new URLSearchParams(window.location.search).get('beacon')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('sp-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('sp-unit', unit)
  }, [unit])

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSessionUserId(data.session?.user.id ?? null)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUserId(session?.user.id ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sessionUserId || !supabase) {
      setProfile(null)
      return
    }
    let cancelled = false
    async function loadProfile() {
      const { data } = await supabase!.from('profiles').select('*').eq('id', sessionUserId).single()
      if (cancelled) return
      if (data) {
        setProfile(data as Profile)
      } else {
        const { data: user } = await supabase!.auth.getUser()
        const email = user.user?.email ?? ''
        const { data: created } = await supabase!
          .from('profiles')
          .upsert({
            id: sessionUserId,
            username: email.split('@')[0] || 'athlete',
            full_name: (user.user?.user_metadata?.full_name as string) || null,
          })
          .select()
          .single()
        if (!cancelled && created) setProfile(created as Profile)
      }
    }
    loadProfile()
    return () => {
      cancelled = true
    }
  }, [sessionUserId])

  if (beaconId) return <BeaconView sessionId={beaconId} />
  if (!isConfigured) return <SetupScreen />
  if (!authReady) return <p className="muted center" style={{ marginTop: 60 }}>Loading Cadence...</p>
  if (!sessionUserId) return <AuthView />

  async function signOut() {
    await db().auth.signOut()
    setSessionUserId(null)
    setView('home')
  }

  const moreViews = NAV.filter((n) => !['home', 'feed', 'record', 'activities', 'analytics'].includes(n.id))

  return (
    <div className="app">
      <header className="header">
        <button className="logo" style={{ background: 'none', border: 'none', padding: 0 }} onClick={() => setView('home')}>
          Cadence
        </button>
        <div className="spacer" />
        <button className="icon-btn" onClick={() => setUnit(unit === 'km' ? 'mi' : 'km')} title="Toggle km / mi">
          {unit === 'km' ? 'km' : 'mi'}
        </button>
        <button className="icon-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Toggle theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <button style={{ background: 'none', border: 'none', padding: 0 }} onClick={() => setView('profile')} title="Profile">
          <AthleteAvatar profile={profile} />
        </button>
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </header>

      <nav className="desktop-nav">
        {NAV.map((n) => (
          <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => setView(n.id)}>
            {n.icon} {n.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {view === 'home' && <HomeView userId={sessionUserId} profile={profile} unit={unit} onRecord={() => setView('record')} />}
        {view === 'feed' && <FeedView userId={sessionUserId} unit={unit} />}
        {view === 'record' && <RecordView userId={sessionUserId} unit={unit} onSaved={() => setView('activities')} />}
        {view === 'activities' && <ActivitiesView userId={sessionUserId} unit={unit} />}
        {view === 'analytics' && <AnalyticsView userId={sessionUserId} unit={unit} />}
        {view === 'segments' && <SegmentsView userId={sessionUserId} unit={unit} />}
        {view === 'routes' && <RoutesView userId={sessionUserId} unit={unit} />}
        {view === 'challenges' && <ChallengesView userId={sessionUserId} unit={unit} />}
        {view === 'clubs' && <ClubsView userId={sessionUserId} unit={unit} profile={profile} />}
        {view === 'gear' && <GearView userId={sessionUserId} unit={unit} />}
        {view === 'goals' && <GoalsView userId={sessionUserId} unit={unit} />}
        {view === 'profile' && <ProfileView userId={sessionUserId} unit={unit} profile={profile} onProfileChanged={setProfile} />}
      </main>

      {showMore && (
        <div className="card" style={{ position: 'fixed', bottom: 76, left: 12, right: 12, zIndex: 50, boxShadow: '0 8px 30px rgba(0,0,0,0.25)' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>More</strong>
            <button className="btn ghost" onClick={() => setShowMore(false)}>Close</button>
          </div>
          <div className="grid2" style={{ marginTop: 8 }}>
            {moreViews.map((n) => (
              <button
                key={n.id}
                className="btn secondary"
                onClick={() => {
                  setView(n.id)
                  setShowMore(false)
                }}
              >
                {n.icon} {n.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="bottom-nav">
        <button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}>
          <span className="nav-icon">🏠</span>Home
        </button>
        <button className={view === 'feed' ? 'active' : ''} onClick={() => setView('feed')}>
          <span className="nav-icon">📰</span>Feed
        </button>
        <button className="record-fab" onClick={() => setView('record')} aria-label="Record">
          <span className="nav-icon">●</span>
        </button>
        <button className={view === 'activities' ? 'active' : ''} onClick={() => setView('activities')}>
          <span className="nav-icon">📋</span>Activities
        </button>
        <button className={view === 'analytics' ? 'active' : ''} onClick={() => setShowMore((v) => !v)}>
          <span className="nav-icon">⋯</span>More
        </button>
      </nav>
    </div>
  )
}
