import { useCallback, useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { formatDistance, formatDuration } from '../lib/utils'
import { SPORTS } from '../lib/types'
import type { Activity, Challenge, Unit } from '../lib/types'

interface Props {
  userId: string
  unit: Unit
}

function progressOf(ch: Challenge, activities: Activity[]): number {
  const from = new Date(ch.start_date).getTime()
  const to = new Date(ch.end_date).getTime()
  const inWindow = activities.filter((a) => {
    const t = new Date(a.started_at).getTime()
    return t >= from && t <= to && (ch.sport === 'Any' || a.sport === ch.sport)
  })
  if (ch.metric === 'distance') return inWindow.reduce((s, a) => s + a.distance_m, 0)
  if (ch.metric === 'elevation') return inWindow.reduce((s, a) => s + a.elevation_gain_m, 0)
  if (ch.metric === 'time') return inWindow.reduce((s, a) => s + a.moving_time_s, 0)
  return inWindow.length
}

function metricLabel(ch: Challenge, value: number, unit: Unit): string {
  if (ch.metric === 'distance') return formatDistance(value, unit)
  if (ch.metric === 'elevation') return `${Math.round(value)} m`
  if (ch.metric === 'time') return formatDuration(value)
  return `${Math.round(value)} activities`
}

export default function ChallengesView({ userId, unit }: Props) {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [joined, setJoined] = useState<Set<string>>(new Set())
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sport, setSport] = useState('Any')
  const [metric, setMetric] = useState<'distance' | 'elevation' | 'activities' | 'time'>('distance')
  const [target, setTarget] = useState('100')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db().from('challenges').select('*').order('start_date', { ascending: false })
    setChallenges((data as Challenge[]) ?? [])
    const { data: entries } = await db().from('challenge_entries').select('challenge_id').eq('user_id', userId)
    setJoined(new Set((entries ?? []).map((e) => e.challenge_id)))
    const { data: acts } = await db().from('activities').select('*').eq('user_id', userId)
    setActivities((acts as Activity[]) ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  async function join(id: string) {
    const { error } = await db().from('challenge_entries').insert({ challenge_id: id, user_id: userId, progress: 0 })
    if (!error) setJoined((s) => new Set(s).add(id))
  }

  async function leave(id: string) {
    await db().from('challenge_entries').delete().eq('challenge_id', id).eq('user_id', userId)
    setJoined((s) => {
      const next = new Set(s)
      next.delete(id)
      return next
    })
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await db().from('challenges').insert({
      title: title.trim(),
      description: description.trim() || null,
      sport,
      metric,
      target: parseFloat(target),
      unit: metric === 'distance' ? unit : metric === 'time' ? 'seconds' : metric === 'elevation' ? 'm' : 'activities',
      start_date: startDate,
      end_date: endDate,
      created_by: userId,
    })
    if (!error) {
      setShowCreate(false)
      setTitle('')
      setDescription('')
      load()
    }
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Close' : '+ Create challenge'}
        </button>
      </div>
      {showCreate && (
        <form className="card" onSubmit={create}>
          <h2>Create a challenge</h2>
          <div className="field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="November 100K" required />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid2">
            <div className="field">
              <label>Sport</label>
              <select value={sport} onChange={(e) => setSport(e.target.value)}>
                <option value="Any">Any sport</option>
                {SPORTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Metric</label>
              <select value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}>
                <option value="distance">Distance</option>
                <option value="elevation">Elevation</option>
                <option value="activities">Activities</option>
                <option value="time">Time</option>
              </select>
            </div>
            <div className="field">
              <label>Target ({metric === 'distance' ? unit : metric === 'time' ? 'seconds' : metric === 'elevation' ? 'meters' : 'activities'})</label>
              <input type="number" step="1" min="1" value={target} onChange={(e) => setTarget(e.target.value)} required />
            </div>
            <div className="field">
              <label>Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </div>
            <div className="field">
              <label>End date</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>
          <button className="btn block" type="submit">Create challenge</button>
        </form>
      )}
      {loading && <p className="muted center">Loading challenges...</p>}
      {!loading && challenges.length === 0 && (
        <div className="card empty">
          <div className="big">🏆</div>
          <h3>No challenges yet</h3>
          <p>Challenges give a month a target. Create the first one — a distance goal, an elevation month, or an activity streak.</p>
        </div>
      )}
      {challenges.map((ch) => {
        const prog = progressOf(ch, activities)
        const targetValue = ch.metric === 'distance' && ch.unit === 'mi' ? ch.target * 1609.34 : ch.metric === 'distance' ? ch.target * 1000 : ch.target
        const pct = Math.min(100, (prog / (targetValue || 1)) * 100)
        const done = prog >= targetValue
        const isJoined = joined.has(ch.id)
        return (
          <div key={ch.id} className="card">
            <div className="row">
              <h3 style={{ margin: 0 }}>{ch.title}</h3>
              {done && isJoined && <span className="badge green">Completed 🏅</span>}
            </div>
            {ch.description && <p className="muted">{ch.description}</p>}
            <p className="small muted">
              {ch.sport} · {new Date(ch.start_date).toLocaleDateString()} – {new Date(ch.end_date).toLocaleDateString()}
            </p>
            {isJoined ? (
              <>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{metricLabel(ch, prog, unit)}</strong>
                  <span className="muted small">of {metricLabel(ch, targetValue, unit)}</span>
                </div>
                <div className="progress" style={{ margin: '8px 0' }}><div style={{ width: `${pct}%` }} /></div>
                <button className="btn secondary" onClick={() => leave(ch.id)}>Leave challenge</button>
              </>
            ) : (
              <button className="btn" onClick={() => join(ch.id)}>Join challenge</button>
            )}
          </div>
        )
      })}
    </div>
  )
}
