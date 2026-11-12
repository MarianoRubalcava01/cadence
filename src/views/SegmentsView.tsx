import { useCallback, useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { formatDistance, formatDuration, haversineMeters } from '../lib/utils'
import type { Activity, Segment, SegmentEffort, Unit } from '../lib/types'
import MapView from '../components/MapView'

interface Props {
  userId: string
  unit: Unit
}

function computeLocalLegend(efforts: SegmentEffort[]): { name: string; n: number } | null {
  const counts = new Map<string, { name: string; n: number }>()
  const cutoff = Date.now() - 90 * 86400000
  for (const e of efforts) {
    if (new Date(e.created_at).getTime() < cutoff) continue
    const cur = counts.get(e.user_id) ?? { name: e.profiles?.full_name || e.profiles?.username || 'Athlete', n: 0 }
    counts.set(e.user_id, { name: cur.name, n: cur.n + 1 })
  }
  let best: { name: string; n: number } | null = null
  for (const v of counts.values()) {
    if (!best || v.n > best.n) best = v
  }
  return best
}

export default function SegmentsView({ userId, unit }: Props) {
  const [segments, setSegments] = useState<Segment[]>([])
  const [selected, setSelected] = useState<Segment | null>(null)
  const [efforts, setEfforts] = useState<SegmentEffort[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [myActivities, setMyActivities] = useState<Activity[]>([])
  const [activityId, setActivityId] = useState('')
  const [segName, setSegName] = useState('')
  const [startKm, setStartKm] = useState('0')
  const [endKm, setEndKm] = useState('1')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db().from('segments').select('*').order('created_at', { ascending: false })
    setSegments((data as Segment[]) ?? [])
    const { data: acts } = await db()
      .from('activities')
      .select('*')
      .eq('user_id', userId)
      .not('route_geojson', 'is', null)
      .order('started_at', { ascending: false })
    setMyActivities((acts as Activity[]) ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  async function selectSegment(seg: Segment) {
    setSelected(seg)
    const { data } = await db()
      .from('segment_efforts')
      .select('*, profiles(*)')
      .eq('segment_id', seg.id)
      .order('elapsed_s', { ascending: true })
    setEfforts((data as SegmentEffort[]) ?? [])
  }

  async function createSegment(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const act = myActivities.find((a) => a.id === activityId)
    if (!act || !act.route_geojson) {
      setError('Pick one of your GPS activities to build the segment from.')
      return
    }
    const coords = act.route_geojson.coordinates
    const totalM = act.distance_m
    const startM = Math.max(0, parseFloat(startKm || '0') * 1000)
    const endM = Math.min(totalM, parseFloat(endKm || '1') * 1000)
    if (endM <= startM) {
      setError('The end point must be after the start point.')
      return
    }
    // Walk the route to find the coordinates at those distances.
    let acc = 0
    let startCoord: [number, number] | null = null
    let endCoord: [number, number] | null = null
    for (let i = 1; i < coords.length; i++) {
      const d = haversineMeters(
        { lat: coords[i - 1][1], lng: coords[i - 1][0] },
        { lat: coords[i][1], lng: coords[i][0] },
      )
      acc += d
      if (!startCoord && acc >= startM) startCoord = coords[i]
      if (!endCoord && acc >= endM) {
        endCoord = coords[i]
        break
      }
    }
    if (!startCoord || !endCoord) {
      setError('Could not map those distances onto the route.')
      return
    }
    const { error } = await db().from('segments').insert({
      name: segName.trim() || `${act.title} segment`,
      sport: act.sport,
      start_lat: startCoord[1],
      start_lng: startCoord[0],
      end_lat: endCoord[1],
      end_lng: endCoord[0],
      distance_m: Math.round(endM - startM),
      created_by: userId,
    })
    if (error) {
      setError(error.message)
      return
    }
    setShowCreate(false)
    setSegName('')
    load()
  }

  const leaderboard = efforts
  const myBest = efforts.find((e) => e.user_id === userId)
  // Local Legend: most efforts in the last 90 days.
  const legend = computeLocalLegend(efforts)

  const selectedRoute =
    selected != null
      ? [
          { lat: selected.start_lat, lng: selected.start_lng },
          { lat: selected.end_lat, lng: selected.end_lng },
        ]
      : []

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Close' : '+ Create segment'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {showCreate && (
        <form className="card" onSubmit={createSegment}>
          <h2>Create a segment</h2>
          <p className="muted">Pick one of your GPS activities and the stretch of it that becomes a timed segment. Every athlete who covers that stretch gets ranked.</p>
          <div className="field">
            <label>From activity</label>
            <select value={activityId} onChange={(e) => setActivityId(e.target.value)} required>
              <option value="">Choose an activity...</option>
              {myActivities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} — {formatDistance(a.distance_m, unit)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Segment name</label>
            <input value={segName} onChange={(e) => setSegName(e.target.value)} placeholder="Hill climb" />
          </div>
          <div className="grid2">
            <div className="field">
              <label>Start at (km into the route)</label>
              <input type="number" step="0.1" min="0" value={startKm} onChange={(e) => setStartKm(e.target.value)} />
            </div>
            <div className="field">
              <label>End at (km into the route)</label>
              <input type="number" step="0.1" min="0" value={endKm} onChange={(e) => setEndKm(e.target.value)} />
            </div>
          </div>
          <button className="btn block" type="submit">Create segment</button>
        </form>
      )}

      {loading && <p className="muted center">Loading segments...</p>}
      {!loading && segments.length === 0 && (
        <div className="card empty">
          <div className="big">🏁</div>
          <h3>No segments yet</h3>
          <p>Segments are timed stretches of road or trail. Create the first one from one of your GPS activities, then race it.</p>
        </div>
      )}
      <div className="grid2">
        {segments.map((s) => (
          <button key={s.id} className="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => selectSegment(s)}>
            <strong>{s.name}</strong>
            <p className="muted small" style={{ margin: '4px 0' }}>
              {s.sport} · {formatDistance(s.distance_m, unit)}
            </p>
            {selected?.id === s.id && <span className="badge">Selected</span>}
          </button>
        ))}
      </div>

      {selected && (
        <div className="card">
          <h2>{selected.name}</h2>
          <p className="muted">
            {selected.sport} · {formatDistance(selected.distance_m, unit)}
          </p>
          <MapView points={selectedRoute} height={180} />
          {legend && (
            <p style={{ marginTop: 10 }}>
              👑 <strong>Local Legend:</strong> {legend.name} — {legend.n} efforts in the last 90 days
            </p>
          )}
          {myBest && (
            <p>
              Your best: <strong>{formatDuration(myBest.elapsed_s)}</strong>
            </p>
          )}
          <h3>Leaderboard</h3>
          {leaderboard.length === 0 && <p className="muted">No efforts yet. Record an activity through this stretch to set the first time.</p>}
          <table className="table">
            <thead>
              <tr><th>#</th><th>Athlete</th><th>Time</th><th>Date</th></tr>
            </thead>
            <tbody>
              {leaderboard.map((e, i) => (
                <tr key={e.id} style={e.user_id === userId ? { background: '#fff7ed' } : undefined}>
                  <td>{i + 1}</td>
                  <td>{e.profiles?.full_name || e.profiles?.username || 'Athlete'}{i === 0 ? ' 👑' : ''}</td>
                  <td>{formatDuration(e.elapsed_s)}</td>
                  <td>{new Date(e.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
