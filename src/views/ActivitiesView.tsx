import { useCallback, useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { activitiesToCSV, downloadCSV, estimateCalories } from '../lib/utils'
import { SPORTS } from '../lib/types'
import type { Activity, GearItem, Unit } from '../lib/types'
import ActivityCard from '../components/ActivityCard'

interface Props {
  userId: string
  unit: Unit
}

export default function ActivitiesView({ userId, unit }: Props) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [gear, setGear] = useState<GearItem[]>([])

  const [sport, setSport] = useState('Run')
  const [title, setTitle] = useState('')
  const [distanceKm, setDistanceKm] = useState('')
  const [durationMin, setDurationMin] = useState('')
  const [elevationM, setElevationM] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16))
  const [notes, setNotes] = useState('')
  const [gearId, setGearId] = useState('')
  const [privacy, setPrivacy] = useState<'public' | 'followers' | 'only_me'>('public')
  const [photo, setPhoto] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db()
      .from('activities')
      .select('*, profiles(*)')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
    setActivities((data as Activity[]) ?? [])
    const { data: g } = await db().from('gear').select('*').eq('user_id', userId)
    if (g) setGear(g as GearItem[])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  async function submitManual(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const distM = Math.round(parseFloat(distanceKm || '0') * 1000)
      const durS = Math.round(parseFloat(durationMin || '0') * 60)
      if (distM <= 0 && durS <= 0) throw new Error('Enter a distance or a duration.')
      let photoUrls: string[] = []
      if (photo) {
        const path = `${userId}/${Date.now()}-${photo.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`
        const { error: upErr } = await db().storage.from('activity-photos').upload(path, photo)
        if (upErr) throw upErr
        photoUrls = [path]
      }
      const { error: insErr } = await db().from('activities').insert({
        user_id: userId,
        sport,
        title: title.trim() || `${sport} — ${new Date(date).toLocaleDateString()}`,
        description: null,
        distance_m: distM,
        moving_time_s: durS,
        elapsed_time_s: durS,
        elevation_gain_m: Math.round(parseFloat(elevationM || '0')),
        calories: estimateCalories(sport, durS),
        avg_hr: null,
        max_hr: null,
        effort: null,
        location: null,
        notes: notes.trim() || null,
        privacy,
        gear_id: gearId || null,
        started_at: new Date(date).toISOString(),
        route_geojson: null,
        photo_urls: photoUrls,
      })
      if (insErr) throw insErr
      setShowForm(false)
      setTitle('')
      setDistanceKm('')
      setDurationMin('')
      setElevationM('')
      setNotes('')
      setPhoto(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the activity.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close' : '+ Log manually'}
        </button>
        <button
          className="btn secondary"
          onClick={() => downloadCSV('cadence-activities.csv', activitiesToCSV(activities))}
          disabled={activities.length === 0}
        >
          Export CSV
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {showForm && (
        <form className="card" onSubmit={submitManual}>
          <h2>Log an activity</h2>
          <div className="grid2">
            <div className="field">
              <label>Sport</label>
              <select value={sport} onChange={(e) => setSport(e.target.value)}>
                {SPORTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Date and time</label>
              <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="field">
              <label>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Morning Run" />
            </div>
            <div className="field">
              <label>Distance (km)</label>
              <input type="number" step="0.01" min="0" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="5.0" />
            </div>
            <div className="field">
              <label>Duration (minutes)</label>
              <input type="number" step="1" min="0" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="30" />
            </div>
            <div className="field">
              <label>Elevation gain (m)</label>
              <input type="number" step="1" min="0" value={elevationM} onChange={(e) => setElevationM(e.target.value)} placeholder="0" />
            </div>
            <div className="field">
              <label>Gear</label>
              <select value={gearId} onChange={(e) => setGearId(e.target.value)}>
                <option value="">No gear</option>
                {gear.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Privacy</label>
              <select value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)}>
                <option value="public">Public</option>
                <option value="followers">Followers</option>
                <option value="only_me">Only me</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel?" />
          </div>
          <div className="field">
            <label>Photo</label>
            <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            {photo && <p className="small muted">{photo.name}</p>}
          </div>
          <button className="btn block" type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Save activity'}
          </button>
          <p className="muted small" style={{ marginTop: 8 }}>
            Photos are stored in Supabase Storage and shown on the activity card.
          </p>
        </form>
      )}
      {loading && <p className="muted center">Loading your activities...</p>}
      {!loading && activities.length === 0 && (
        <div className="card empty">
          <div className="big">📋</div>
          <h3>Your log is empty</h3>
          <p>Record your first activity live, or log one manually. Everything you save appears here, in your analytics, and on the feed.</p>
        </div>
      )}
      {activities.map((a) => (
        <ActivityCard key={a.id} activity={a} currentUserId={userId} unit={unit} onChanged={load} showAthlete={false} />
      ))}
    </div>
  )
}
