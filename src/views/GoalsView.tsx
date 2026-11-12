import { useCallback, useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { formatDistance } from '../lib/utils'
import type { Activity, Goal, TrainingPlan, Unit } from '../lib/types'

interface Props {
  userId: string
  unit: Unit
}

export default function GoalsView({ userId, unit }: Props) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [plans, setPlans] = useState<TrainingPlan[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [metric, setMetric] = useState<'distance' | 'time' | 'activities' | 'elevation'>('distance')
  const [target, setTarget] = useState('50')
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [planName, setPlanName] = useState('')
  const [planEvent, setPlanEvent] = useState('')
  const [planWeeks, setPlanWeeks] = useState('12')
  const [planBaseKm, setPlanBaseKm] = useState('20')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: g } = await db().from('goals').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    setGoals((g as Goal[]) ?? [])
    const { data: p } = await db().from('training_plans').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    setPlans((p as TrainingPlan[]) ?? [])
    const { data: a } = await db().from('activities').select('*').eq('user_id', userId)
    setActivities((a as Activity[]) ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  function goalProgress(g: Goal): number {
    const days = g.period === 'week' ? 7 : 30
    const from = Date.now() - days * 86400000
    const inWindow = activities.filter((a) => new Date(a.started_at).getTime() > from)
    if (g.metric === 'distance') return inWindow.reduce((s, a) => s + a.distance_m, 0)
    if (g.metric === 'time') return inWindow.reduce((s, a) => s + a.moving_time_s, 0)
    if (g.metric === 'elevation') return inWindow.reduce((s, a) => s + a.elevation_gain_m, 0)
    return inWindow.length
  }

  function goalTargetM(g: Goal): number {
    if (g.metric === 'distance') return g.target * (g.unit === 'mi' ? 1609.34 : 1000)
    return g.target
  }

  function goalLabel(g: Goal, value: number): string {
    if (g.metric === 'distance') return formatDistance(value, unit)
    if (g.metric === 'time') return `${Math.round(value / 3600)} h`
    if (g.metric === 'elevation') return `${Math.round(value)} m`
    return `${Math.round(value)} activities`
  }

  async function addGoal(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await db().from('goals').insert({
      user_id: userId,
      metric,
      target: parseFloat(target),
      unit: metric === 'distance' ? unit : metric === 'time' ? 'seconds' : metric === 'elevation' ? 'm' : 'activities',
      period,
    })
    if (!error) load()
  }

  async function removeGoal(id: string) {
    await db().from('goals').delete().eq('id', id).eq('user_id', userId)
    load()
  }

  async function createPlan(e: React.FormEvent) {
    e.preventDefault()
    const weeks = parseInt(planWeeks, 10)
    const baseM = parseFloat(planBaseKm) * 1000
    if (!weeks || weeks < 1 || weeks > 26 || !baseM) return
    const start = new Date()
    const end = new Date()
    end.setDate(end.getDate() + weeks * 7)
    const weekPlan = Array.from({ length: weeks }, (_, i) => {
      const isTaper = i >= weeks - 2
      const build = 1 + (i / Math.max(1, weeks - 2)) * 0.8
      const targetM = Math.round(baseM * (isTaper ? 0.6 : build))
      return {
        week: i + 1,
        target_distance_m: targetM,
        workouts: [
          'Easy run',
          'Intervals or tempo',
          'Easy run',
          i % 2 === 0 ? 'Long run' : 'Long ride',
          'Rest or cross-train',
        ],
      }
    })
    const { error } = await db().from('training_plans').insert({
      user_id: userId,
      name: planName.trim() || `${planEvent.trim() || 'Training'} plan`,
      goal_event: planEvent.trim() || null,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      weeks: weekPlan,
    })
    if (!error) {
      setPlanName('')
      setPlanEvent('')
      load()
    }
  }

  async function removePlan(id: string) {
    await db().from('training_plans').delete().eq('id', id).eq('user_id', userId)
    load()
  }

  return (
    <div>
      <div className="card">
        <h2>Goals</h2>
        {loading && <p className="muted">Loading...</p>}
        {goals.map((g) => {
          const prog = goalProgress(g)
          const targetM = goalTargetM(g)
          const pct = Math.min(100, (prog / (targetM || 1)) * 100)
          return (
            <div key={g.id} style={{ marginBottom: 14 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>
                  {g.metric} · {g.period}ly
                </strong>
                <span className="muted small">
                  {goalLabel(g, prog)} of {goalLabel(g, targetM)}
                </span>
              </div>
              <div className="progress" style={{ margin: '6px 0' }}><div style={{ width: `${pct}%` }} /></div>
              <button className="btn ghost" onClick={() => removeGoal(g.id)}>Remove</button>
            </div>
          )
        })}
        {goals.length === 0 && !loading && <p className="muted">No goals yet. The weekly goal ring on the dashboard uses your first weekly distance goal.</p>}
        <form onSubmit={addGoal}>
          <div className="grid3">
            <div className="field">
              <label>Metric</label>
              <select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}>
                <option value="distance">Distance</option>
                <option value="time">Time</option>
                <option value="activities">Activities</option>
                <option value="elevation">Elevation</option>
              </select>
            </div>
            <div className="field">
              <label>Target ({metric === 'distance' ? unit : metric === 'time' ? 'seconds' : metric === 'elevation' ? 'm' : 'count'})</label>
              <input type="number" step="1" min="1" value={target} onChange={(e) => setTarget(e.target.value)} required />
            </div>
            <div className="field">
              <label>Period</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
              </select>
            </div>
          </div>
          <button className="btn" type="submit">Add goal</button>
        </form>
      </div>

      <div className="card">
        <h2>Training plans</h2>
        <p className="muted">Build a simple progressive plan toward a race or event. Weekly volume grows about 10 percent, with a two-week taper.</p>
        <form onSubmit={createPlan}>
          <div className="grid2">
            <div className="field">
              <label>Plan name</label>
              <input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Spring half marathon" />
            </div>
            <div className="field">
              <label>Goal event</label>
              <input value={planEvent} onChange={(e) => setPlanEvent(e.target.value)} placeholder="Half marathon" />
            </div>
            <div className="field">
              <label>Weeks (1–26)</label>
              <input type="number" min="1" max="26" value={planWeeks} onChange={(e) => setPlanWeeks(e.target.value)} required />
            </div>
            <div className="field">
              <label>Starting weekly distance (km)</label>
              <input type="number" step="1" min="1" value={planBaseKm} onChange={(e) => setPlanBaseKm(e.target.value)} required />
            </div>
          </div>
          <button className="btn" type="submit">Create plan</button>
        </form>
        {plans.map((p) => (
          <div key={p.id} style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{p.name}</strong>
              <button className="btn ghost" onClick={() => removePlan(p.id)}>Delete</button>
            </div>
            <p className="muted small">
              {p.goal_event ? `${p.goal_event} · ` : ''}{p.start_date} – {p.end_date} · {p.weeks.length} weeks
            </p>
            <table className="table">
              <thead><tr><th>Week</th><th>Target</th><th>Workouts</th></tr></thead>
              <tbody>
                {p.weeks.slice(0, 6).map((w) => (
                  <tr key={w.week}>
                    <td>{w.week}</td>
                    <td>{formatDistance(w.target_distance_m, unit)}</td>
                    <td className="small">{w.workouts.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {p.weeks.length > 6 && <p className="muted small">+ {p.weeks.length - 6} more weeks in the plan.</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
