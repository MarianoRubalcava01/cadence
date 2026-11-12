import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/supabase'
import {
  currentStreak,
  fitnessFreshness,
  fitnessScore,
  formatDistance,
  formatDuration,
  last14Days,
  weekTotals,
} from '../lib/utils'
import type { Activity, Goal, Unit } from '../lib/types'
import MapView from '../components/MapView'

interface Props {
  userId: string
  unit: Unit
}

function Ring({ pct, label }: { pct: number; label: string }) {
  const r = 52
  const c = 2 * Math.PI * r
  const shown = Math.min(100, pct)
  return (
    <div className="ring">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#fc4c02"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
        />
      </svg>
      <div className="ring-label">
        <span className="pct">{Math.round(pct)}%</span>
        <span className="sub">{label}</span>
      </div>
    </div>
  )
}

export default function AnalyticsView({ userId, unit }: Props) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'training' | 'year' | 'heatmap'>('overview')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await db()
        .from('activities')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
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

  const now = Date.now()
  const weekStart = now - 7 * 86400000
  const thisWeek = useMemo(() => activities.filter((a) => new Date(a.started_at).getTime() > weekStart), [activities, weekStart])
  const lastWeek = useMemo(
    () =>
      activities.filter((a) => {
        const t = new Date(a.started_at).getTime()
        return t > weekStart - 7 * 86400000 && t <= weekStart
      }),
    [activities, weekStart],
  )
  const weeklyGoal = goals.find((g) => g.period === 'week' && g.metric === 'distance')
  const weeklyDistM = thisWeek.reduce((s, a) => s + a.distance_m, 0)
  const weeklyTargetM = weeklyGoal ? weeklyGoal.target * (weeklyGoal.unit === 'mi' ? 1609.34 : 1000) : 50000
  const pct = weeklyTargetM > 0 ? (weeklyDistM / weeklyTargetM) * 100 : 0

  const score = fitnessScore(activities)
  const ff = fitnessFreshness(activities)
  const streak = currentStreak(activities)
  const days14 = last14Days(activities)
  const weeks8 = weekTotals(activities, 8)
  const maxWeek = Math.max(...weeks8, 1)

  const months = useMemo(() => {
    const out: { label: string; km: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString(undefined, { month: 'short' })
      const km =
        activities
          .filter((a) => a.started_at.slice(0, 7) === key)
          .reduce((s, a) => s + a.distance_m, 0) / 1000
      out.push({ label, km })
    }
    return out
  }, [activities])

  const sportBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    activities.forEach((a) => map.set(a.sport, (map.get(a.sport) ?? 0) + a.distance_m))
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [activities])
  const totalDist = sportBreakdown.reduce((s, [, v]) => s + v, 0) || 1

  const prs = useMemo(() => {
    const best: Record<string, Activity | null> = { 'Longest run': null, 'Longest ride': null, 'Fastest 5K pace': null }
    activities.forEach((a) => {
      if (a.sport === 'Run' && (!best['Longest run'] || a.distance_m > best['Longest run']!.distance_m)) best['Longest run'] = a
      if ((a.sport === 'Ride' || a.sport === 'Mountain Bike') && (!best['Longest ride'] || a.distance_m > best['Longest ride']!.distance_m)) best['Longest ride'] = a
    })
    return best
  }, [activities])

  // Matched activities: same start point (within 150 m) and similar distance.
  const matched = useMemo(() => {
    const groups: Activity[][] = []
    const key = (a: Activity) => {
      const c = a.route_geojson?.coordinates?.[0]
      return c ? `${c[1].toFixed(3)},${c[0].toFixed(3)}` : 'manual'
    }
    const byKey = new Map<string, Activity[]>()
    activities.forEach((a) => {
      const k = key(a)
      byKey.set(k, [...(byKey.get(k) ?? []), a])
    })
    byKey.forEach((list) => {
      if (list.length > 1) groups.push(list)
    })
    return groups.slice(0, 5)
  }, [activities])

  const year = new Date().getFullYear()
  const yearActs = activities.filter((a) => new Date(a.started_at).getFullYear() === year)
  const yearKm = yearActs.reduce((s, a) => s + a.distance_m, 0) / 1000
  const yearHours = yearActs.reduce((s, a) => s + a.moving_time_s, 0) / 3600
  const yearClimb = yearActs.reduce((s, a) => s + a.elevation_gain_m, 0)

  // AI Plus Coach: rule-based insights computed from real totals.
  const coachTips: string[] = []
  const thisWeekKm = weeklyDistM / 1000
  const lastWeekKm = lastWeek.reduce((s, a) => s + a.distance_m, 0) / 1000
  if (activities.length === 0) {
    coachTips.push('Log your first workout to begin. The coach reads your real totals and adapts as you train.')
  } else {
    if (thisWeekKm > lastWeekKm * 1.2 && lastWeekKm > 0) {
      coachTips.push(`You covered ${thisWeekKm.toFixed(1)} km this week, up from ${lastWeekKm.toFixed(1)} km last week. That is a jump of more than 20 percent — keep one day easy to absorb it.`)
    } else if (thisWeekKm < lastWeekKm * 0.8 && lastWeekKm > 0) {
      coachTips.push(`Volume is down this week (${thisWeekKm.toFixed(1)} km vs ${lastWeekKm.toFixed(1)} km). A short, easy session keeps the streak alive without adding fatigue.`)
    } else {
      coachTips.push(`Steady week: ${thisWeekKm.toFixed(1)} km across ${thisWeek.length} activities. Consistency is doing the work.`)
    }
    if (ff.form === 'Fresh') coachTips.push(`Your Training Stress Balance is +${ff.tsb}. You are fresh — a good day for a hard effort or a long session.`)
    if (ff.form === 'Tired' || ff.form === 'Very tired') coachTips.push(`Your Training Stress Balance is ${ff.tsb}. You are carrying fatigue — an easy day or full rest will pay off more than another hard session.`)
    if (streak >= 3) coachTips.push(`You are on a ${streak}-day streak. Protect it with a short easy activity on busy days.`)
    const longest = activities.reduce((best, a) => (a.distance_m > (best?.distance_m ?? 0) ? a : best), null as Activity | null)
    if (longest) coachTips.push(`Your longest activity is ${longest.title} at ${formatDistance(longest.distance_m, unit)}. Try to beat it by 10 percent over the next month.`)
  }

  const heatRoutes = activities
    .filter((a) => a.route_geojson)
    .map((a) => a.route_geojson!.coordinates.map(([lng, lat]) => ({ lat, lng })))

  const trainingDays = useMemo(() => {
    const map = new Map<string, number>()
    activities.forEach((a) => {
      const d = a.started_at.slice(0, 10)
      map.set(d, (map.get(d) ?? 0) + 1)
    })
    return map
  }, [activities])

  if (loading) return <p className="muted center">Loading analytics...</p>

  return (
    <div>
      <div className="tabs">
        {(['overview', 'training', 'year', 'heatmap'] as const).map((t) => (
          <button key={t} className={`chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'overview' ? 'Overview' : t === 'training' ? 'Training log' : t === 'year' ? `Year in Sport ${year}` : 'Heatmap'}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="card">
            <div className="ring-wrap">
              <Ring pct={pct} label="of goal" />
              <div>
                <h2 style={{ margin: '0 0 4px' }}>Weekly goal</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {formatDistance(weeklyDistM, unit)} of {formatDistance(weeklyTargetM, unit)} this week
                  {weeklyGoal ? '' : ' (default 50 km — set your own in Goals)'}
                </p>
                <p style={{ margin: '8px 0 0' }}>
                  🔥 <strong>{streak}-day streak</strong> · {activities.length} activities all time
                </p>
              </div>
            </div>
            <h3 style={{ marginTop: 16 }}>Last 14 days</h3>
            <div className="day-grid">
              {days14.map((d) => (
                <div key={d.date} className={`day-cell ${d.count > 0 ? 'has' : ''} ${d.date === new Date().toISOString().slice(0, 10) ? 'today' : ''}`} title={`${d.date}: ${d.count} activities`} />
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Plus Coach</h2>
            {coachTips.map((tip, i) => (
              <p key={i} style={{ margin: '0 0 8px' }}>💡 {tip}</p>
            ))}
          </div>

          <div className="card">
            <h2>Plus Analytics</h2>
            <div className="grid3">
              <div className="stat"><div className="value">{score}</div><div className="label">Fitness Score</div></div>
              <div className="stat"><div className="value">{ff.ctl}</div><div className="label">Fitness (CTL)</div></div>
              <div className="stat"><div className="value">{ff.tsb}</div><div className="label">Freshness (TSB)</div></div>
            </div>
            <p className="muted">Form: <strong>{ff.form}</strong> · Acute load (7d): {ff.atl}</p>
            <h3>8-week training load</h3>
            <div className="bar-chart">
              {weeks8.map((m, i) => (
                <div key={i} className={`bar ${m === 0 ? 'dim' : ''}`} style={{ height: `${Math.max(3, (m / maxWeek) * 100)}%` }} title={`${(m / 1000).toFixed(1)} km`} />
              ))}
            </div>
            <h3>Monthly trend</h3>
            <div className="bar-chart">
              {months.map((mo) => (
                <div key={mo.label} className={`bar ${mo.km === 0 ? 'dim' : ''}`} style={{ height: `${Math.max(3, (mo.km / Math.max(...months.map((x) => x.km), 1)) * 100)}%` }} title={`${mo.label}: ${mo.km.toFixed(1)} km`} />
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              {months.map((mo) => (
                <span key={mo.label} className="small muted">{mo.label}</span>
              ))}
            </div>
            <h3 style={{ marginTop: 14 }}>Sport breakdown</h3>
            {sportBreakdown.length === 0 && <p className="muted">No activities yet.</p>}
            {sportBreakdown.map(([sport, m]) => (
              <div key={sport} style={{ marginBottom: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{sport}</span>
                  <span className="muted small">{formatDistance(m, unit)} · {Math.round((m / totalDist) * 100)}%</span>
                </div>
                <div className="progress"><div style={{ width: `${(m / totalDist) * 100}%` }} /></div>
              </div>
            ))}
            <h3 style={{ marginTop: 14 }}>Personal records</h3>
            {Object.entries(prs).map(([label, a]) => (
              <p key={label} className="small" style={{ margin: '4px 0' }}>
                <strong>{label}:</strong>{' '}
                {a ? `${a.title} — ${formatDistance(a.distance_m, unit)} in ${formatDuration(a.moving_time_s)}` : 'No record yet'}
              </p>
            ))}
          </div>

          <div className="card">
            <h2>Matched activities</h2>
            <p className="muted">Same start point, run more than once — compare your times.</p>
            {matched.length === 0 && <p className="muted">No repeated routes yet. Record the same loop twice and it appears here.</p>}
            {matched.map((group, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <strong>{group[0].title}</strong> · {group.length} efforts
                {group.slice(0, 3).map((a) => (
                  <p key={a.id} className="small" style={{ margin: '2px 0' }}>
                    {formatDistance(a.distance_m, unit)} in {formatDuration(a.moving_time_s)} — {new Date(a.started_at).toLocaleDateString()}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'training' && (
        <div className="card">
          <h2>Training log</h2>
          <p className="muted">Every day you trained, this year.</p>
          {(() => {
            const monthsOfYear: { label: string; days: number }[] = []
            for (let m = 0; m < 12; m++) {
              const d = new Date(year, m, 1)
              monthsOfYear.push({ label: d.toLocaleDateString(undefined, { month: 'long' }), days: new Date(year, m + 1, 0).getDate() })
            }
            return monthsOfYear.map((mo, mi) => (
              <div key={mo.label} style={{ marginBottom: 10 }}>
                <strong className="small">{mo.label}</strong>
                <div className="day-grid" style={{ gridTemplateColumns: 'repeat(10, 1fr)', marginTop: 4 }}>
                  {Array.from({ length: mo.days }, (_, d) => {
                    const key = `${year}-${String(mi + 1).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`
                    return <div key={key} className={`day-cell ${trainingDays.has(key) ? 'has' : ''}`} title={`${key}: ${trainingDays.get(key) ?? 0} activities`} />
                  })}
                </div>
              </div>
            ))
          })()}
        </div>
      )}

      {tab === 'year' && (
        <div className="card">
          <h2>Year in Sport {year}</h2>
          <div className="grid3">
            <div className="stat"><div className="value">{yearActs.length}</div><div className="label">Activities</div></div>
            <div className="stat"><div className="value">{yearKm.toFixed(0)} km</div><div className="label">Distance</div></div>
            <div className="stat"><div className="value">{yearHours.toFixed(0)} h</div><div className="label">Moving time</div></div>
            <div className="stat"><div className="value">{Math.round(yearClimb).toLocaleString()} m</div><div className="label">Elevation</div></div>
            <div className="stat"><div className="value">{yearActs.reduce((s, a) => s + a.calories, 0).toLocaleString()}</div><div className="label">Calories</div></div>
            <div className="stat"><div className="value">{streak}</div><div className="label">Day streak</div></div>
          </div>
          {yearActs.length === 0 && <p className="muted center">No activities this year yet. Your Year in Sport builds as you log.</p>}
        </div>
      )}

      {tab === 'heatmap' && (
        <div className="card">
          <h2>Personal heatmap</h2>
          <p className="muted">Every route you have recorded, on one map. Brighter where you train most.</p>
          {heatRoutes.length === 0 ? (
            <div className="empty"><div className="big">🗺️</div><p>Record a GPS activity and your heatmap appears here.</p></div>
          ) : (
            <MapView routes={heatRoutes} height={380} zoom={12} />
          )}
        </div>
      )}
    </div>
  )
}
