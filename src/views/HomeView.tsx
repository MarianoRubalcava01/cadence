import { useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { currentStreak, formatDistance, last14Days } from '../lib/utils'
import type { Activity, Goal, Profile, Unit } from '../lib/types'
import ActivityCard from '../components/ActivityCard'

interface Props {
  userId: string
  profile: Profile | null
  unit: Unit
  onRecord: () => void
}

function MiniRing({ pct }: { pct: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  const shown = Math.min(100, pct)
  return (
    <div className="ring">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="#fc4c02" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
      </svg>
      <div className="ring-label">
        <span className="pct">{Math.round(pct)}%</span>
        <span className="sub">of goal</span>
      </div>
    </div>
  )
}

export default function HomeView({ userId, profile, unit, onRecord }: Props) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await db()
        .from('activities')
        .select('*, profiles(*)')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(5)
      const { data: g } = await db().from('goals').select('*').eq('user_id', userId)
      if (!cancelled) {
        setActivities((data as Activity[]) ?? [])
        setGoals((g as Goal[]) ?? [])
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  const weekStart = Date.now() - 7 * 86400000
  const thisWeek = activities.filter((a) => new Date(a.started_at).getTime() > weekStart)
  const weeklyGoal = goals.find((g) => g.period === 'week' && g.metric === 'distance')
  const weeklyDistM = thisWeek.reduce((s, a) => s + a.distance_m, 0)
  const weeklyTargetM = weeklyGoal ? weeklyGoal.target * (weeklyGoal.unit === 'mi' ? 1609.34 : 1000) : 50000
  const pct = weeklyTargetM > 0 ? (weeklyDistM / weeklyTargetM) * 100 : 0
  const streak = currentStreak(activities)
  const days14 = last14Days(activities)

  return (
    <div>
      <div className="card">
        <h2 style={{ margin: '0 0 4px' }}>
          Hello, {profile?.full_name?.split(' ')[0] || profile?.username || 'athlete'}
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <div className="ring-wrap" style={{ marginTop: 14 }}>
          <MiniRing pct={pct} />
          <div>
            <p style={{ margin: '0 0 4px' }}>
              <strong>{formatDistance(weeklyDistM, unit)}</strong> of {formatDistance(weeklyTargetM, unit)} this week
            </p>
            <p style={{ margin: '0 0 4px' }}>🔥 <strong>{streak}-day streak</strong></p>
            <p className="muted small" style={{ margin: 0 }}>
              {weeklyGoal ? 'Weekly distance goal' : 'Default 50 km goal — set your own in Goals'}
            </p>
          </div>
        </div>
        <h3 style={{ marginTop: 16 }}>Last 14 days</h3>
        <div className="day-grid">
          {days14.map((d) => (
            <div
              key={d.date}
              className={`day-cell ${d.count > 0 ? 'has' : ''} ${d.date === new Date().toISOString().slice(0, 10) ? 'today' : ''}`}
              title={`${d.date}: ${d.count} activities`}
            />
          ))}
        </div>
        <button className="btn block" style={{ marginTop: 16 }} onClick={onRecord}>
          ● Record an activity
        </button>
      </div>

      <div className="card">
        <h2>Recent activities</h2>
        {loading && <p className="muted">Loading...</p>}
        {!loading && activities.length === 0 && (
          <div className="empty">
            <div className="big">🏃</div>
            <p>Nothing logged yet. Your first activity starts the streak, the goal ring, and your analytics.</p>
          </div>
        )}
        {activities.map((a) => (
          <ActivityCard key={a.id} activity={a} currentUserId={userId} unit={unit} showAthlete={false} />
        ))}
      </div>
    </div>
  )
}
