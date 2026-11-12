import { useEffect, useRef, useState } from 'react'
import { db } from '../lib/supabase'
import {
  estimateCalories,
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  haversineMeters,
  pathDistanceM,
  pathElevationGainM,
  uid,
} from '../lib/utils'
import { SPORTS } from '../lib/types'
import type { GearItem, Segment, Unit } from '../lib/types'
import MapView from '../components/MapView'

interface RecPoint {
  lat: number
  lng: number
  ele: number | null
  t: number
  moving: boolean
}

type Status = 'idle' | 'recording' | 'paused' | 'saving' | 'done'

interface Props {
  userId: string
  unit: Unit
  onSaved: () => void
}

function speak(text: string) {
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
    }
  } catch {
    // Audio cues are best-effort.
  }
}

function dayPart(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}

export default function RecordView({ userId, unit, onSaved }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [sport, setSport] = useState('Run')
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [distance, setDistance] = useState(0)
  const [movingTime, setMovingTime] = useState(0)
  const [currentPace, setCurrentPace] = useState('--:--')
  const [elevation, setElevation] = useState(0)
  const [splits, setSplits] = useState<{ n: number; seconds: number }[]>([])
  const [gear, setGear] = useState<GearItem[]>([])
  const [gearId, setGearId] = useState('')
  const [privacy, setPrivacy] = useState<'public' | 'followers' | 'only_me'>('public')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [beaconOn, setBeaconOn] = useState(false)
  const [beaconUrl, setBeaconUrl] = useState('')
  const [segmentAlert, setSegmentAlert] = useState('')
  const [savedId, setSavedId] = useState('')

  const pointsRef = useRef<RecPoint[]>([])
  const watchIdRef = useRef<number | null>(null)
  const startTimeRef = useRef(0)
  const pausedTotalRef = useRef(0)
  const pauseStartRef = useRef<number | null>(null)
  const splitTargetRef = useRef(0)
  const splitStartElapsedRef = useRef(0)
  const lastMovingRef = useRef(0)
  const beaconSessionRef = useRef<string | null>(null)
  const lastBeaconSendRef = useRef(0)
  const segmentsRef = useRef<Segment[]>([])
  const activeSegmentRef = useRef<{ segment: Segment; startAt: number } | null>(null)
  const statusRef = useRef<Status>('idle')
  statusRef.current = status

  const splitTarget = unit === 'mi' ? 1609.34 : 1000

  useEffect(() => {
    let cancelled = false
    db()
      .from('gear')
      .select('*')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (!cancelled && data) setGear(data as GearItem[])
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
    }
  }, [])

  function recomputeStats() {
    const pts = pointsRef.current
    const moving = pts.filter((p) => p.moving)
    let dist = 0
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].moving && pts[i - 1].moving) dist += haversineMeters(pts[i - 1], pts[i])
    }
    setDistance(dist)
    setElevation(pathElevationGainM(moving))
    const movingSeconds = moving.length > 1 ? (moving[moving.length - 1].t - moving[0].t) / 1000 : 0
    setMovingTime(movingSeconds)
    // Current pace over the last 60 seconds of moving points.
    const now = Date.now()
    const recent = moving.filter((p) => now - p.t < 60000)
    if (recent.length > 1) {
      const d = pathDistanceM(recent)
      const dt = (recent[recent.length - 1].t - recent[0].t) / 1000
      setCurrentPace(d > 20 ? formatPace(d, dt, unit) : '--:--')
    }
  }

  function handlePosition(pos: GeolocationPosition) {
    const now = Date.now()
    const moving = statusRef.current === 'recording'
    const pt: RecPoint = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      ele: pos.coords.altitude,
      t: now,
      moving,
    }
    const pts = pointsRef.current
    // Drop wild GPS jumps (> 80 m in one fix while moving slowly is usually noise).
    if (pts.length > 0) {
      const jump = haversineMeters(pts[pts.length - 1], pt)
      const dt = (now - pts[pts.length - 1].t) / 1000
      if (jump > 120 && dt < 5) return
    }
    pts.push(pt)
    if (moving) {
      lastMovingRef.current = now
      // Splits
      const dist = pts.reduce((s, p, i) => {
        if (i === 0) return 0
        return s + (p.moving && pts[i - 1].moving ? haversineMeters(pts[i - 1], p) : 0)
      }, 0)
      if (dist >= splitTargetRef.current) {
        const splitSeconds = (now - startTimeRef.current) / 1000 - pausedTotalRef.current - splitStartElapsedRef.current
        const n = splits.length + 1
        setSplits((list) => [...list, { n, seconds: splitSeconds }])
        splitStartElapsedRef.current += splitSeconds
        splitTargetRef.current += splitTarget
        speak(
          `${unit === 'mi' ? 'Mile' : 'Kilometre'} ${n}, pace ${formatPace(splitTarget, splitSeconds, unit)} per ${unit}`,
        )
      }
      // Live segment alerts
      checkSegments(pt)
      // Beacon: send a point at most every 5 seconds
      if (beaconSessionRef.current && now - lastBeaconSendRef.current > 5000) {
        lastBeaconSendRef.current = now
        const sessionId = beaconSessionRef.current
        db().from('beacon_points').insert({ session_id: sessionId, lat: pt.lat, lng: pt.lng, recorded_at: new Date(now).toISOString() })
      }
    }
    recomputeStats()
  }

  function checkSegments(pt: RecPoint) {
    for (const seg of segmentsRef.current) {
      const dStart = haversineMeters(pt, { lat: seg.start_lat, lng: seg.start_lng })
      const dEnd = haversineMeters(pt, { lat: seg.end_lat, lng: seg.end_lng })
      if (!activeSegmentRef.current && dStart < 40) {
        activeSegmentRef.current = { segment: seg, startAt: Date.now() }
        setSegmentAlert(`Segment ahead: ${seg.name} — go!`)
        speak(`Segment ${seg.name} started`)
      } else if (activeSegmentRef.current && activeSegmentRef.current.segment.id === seg.id && dEnd < 40) {
        const elapsedS = (Date.now() - activeSegmentRef.current.startAt) / 1000
        setSegmentAlert(`Segment finished: ${seg.name} in ${formatDuration(elapsedS)}`)
        speak(`Segment ${seg.name} finished in ${formatDuration(elapsedS)}`)
        activeSegmentRef.current = null
      }
    }
  }

  async function startRecording() {
    if (!('geolocation' in navigator)) {
      setError('GPS is not available on this device or browser.')
      return
    }
    setError('')
    setTitle(`${dayPart()} ${sport}`)
    // Load segments near the current position for live alerts.
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { data } = await db().from('segments').select('*').eq('sport', sport)
        if (data) {
          segmentsRef.current = (data as Segment[]).filter(
            (s) =>
              haversineMeters({ lat: pos.coords.latitude, lng: pos.coords.longitude }, { lat: s.start_lat, lng: s.start_lng }) < 5000,
          )
        }
      },
      () => undefined,
      { timeout: 8000 },
    )
    if (beaconOn) {
      const token = uid()
      const { data } = await db()
        .from('beacon_sessions')
        .insert({ user_id: userId, token, is_live: true })
        .select('id')
        .single()
      if (data) {
        beaconSessionRef.current = data.id
        setBeaconUrl(`${window.location.origin}${window.location.pathname}?beacon=${data.id}`)
      }
    }
    pointsRef.current = []
    splits.length = 0
    setSplits([])
    splitTargetRef.current = splitTarget
    splitStartElapsedRef.current = 0
    startTimeRef.current = Date.now()
    pausedTotalRef.current = 0
    pauseStartRef.current = null
    lastMovingRef.current = Date.now()
    setElapsed(0)
    setDistance(0)
    setMovingTime(0)
    setElevation(0)
    setSegmentAlert('')
    setStatus('recording')
    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, (err) => {
      setError(`GPS error: ${err.message}. Check location permission and that you are on HTTPS.`)
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 })
  }

  // Elapsed timer + auto-pause watcher
  useEffect(() => {
    if (status !== 'recording' && status !== 'paused') return
    const id = window.setInterval(() => {
      const now = Date.now()
      setElapsed((now - startTimeRef.current) / 1000 - pausedTotalRef.current)
      if (statusRef.current === 'recording' && now - lastMovingRef.current > 15000) {
        // No movement for 15 seconds: auto-pause.
        pauseRecording(true)
      }
    }, 1000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  function pauseRecording(auto = false) {
    if (statusRef.current !== 'recording') return
    pauseStartRef.current = Date.now()
    setStatus('paused')
    if (auto) setSegmentAlert('Auto-paused — no movement detected.')
  }

  function resumeRecording() {
    if (pauseStartRef.current) {
      pausedTotalRef.current += (Date.now() - pauseStartRef.current) / 1000
      pauseStartRef.current = null
    }
    lastMovingRef.current = Date.now()
    setSegmentAlert('')
    setStatus('recording')
  }

  function stopRecording() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (pauseStartRef.current) {
      pausedTotalRef.current += (Date.now() - pauseStartRef.current) / 1000
      pauseStartRef.current = null
    }
    setStatus('done')
  }

  async function saveActivity() {
    setStatus('saving')
    const pts = pointsRef.current.filter((p) => p.moving)
    const dist = pathDistanceM(pts)
    const gain = pathElevationGainM(pts)
    const movingS = pts.length > 1 ? (pts[pts.length - 1].t - pts[0].t) / 1000 : 0
    const startedAt = new Date(startTimeRef.current).toISOString()
    const calories = estimateCalories(sport, movingS)
    const routeGeojson = {
      type: 'LineString' as const,
      coordinates: pts.map((p) => [p.lng, p.lat] as [number, number]),
    }
    const { data, error } = await db()
      .from('activities')
      .insert({
        user_id: userId,
        sport,
        title: title.trim() || `${dayPart()} ${sport}`,
        description: null,
        distance_m: Math.round(dist),
        moving_time_s: Math.round(movingS),
        elapsed_time_s: Math.round(elapsed),
        elevation_gain_m: Math.round(gain),
        calories,
        avg_hr: null,
        max_hr: null,
        effort: null,
        location: null,
        notes: notes.trim() || null,
        privacy,
        gear_id: gearId || null,
        started_at: startedAt,
        route_geojson: routeGeojson,
        photo_urls: [],
      })
      .select('id')
      .single()
    if (error || !data) {
      setError(error?.message ?? 'Could not save the activity.')
      setStatus('done')
      return
    }
    const activityId = data.id
    // Save GPS points in chunks.
    const rows = pts.map((p, i) => ({
      activity_id: activityId,
      lat: p.lat,
      lng: p.lng,
      elevation: p.ele,
      recorded_at: new Date(p.t).toISOString(),
      seq: i,
    }))
    for (let i = 0; i < rows.length; i += 500) {
      await db().from('activity_points').insert(rows.slice(i, i + 500))
    }
    // Segment efforts: check every segment whose start and end are near this route.
    const { data: segs } = await db().from('segments').select('*').eq('sport', sport)
    if (segs) {
      for (const seg of segs as Segment[]) {
        const startIdx = pts.findIndex((p) => haversineMeters(p, { lat: seg.start_lat, lng: seg.start_lng }) < 50)
        const endIdx = pts.findIndex((p) => haversineMeters(p, { lat: seg.end_lat, lng: seg.end_lng }) < 50)
        if (startIdx >= 0 && endIdx > startIdx) {
          const effortS = (pts[endIdx].t - pts[startIdx].t) / 1000
          await db().from('segment_efforts').insert({
            segment_id: seg.id,
            activity_id: activityId,
            user_id: userId,
            elapsed_s: Math.round(effortS),
          })
        }
      }
    }
    // Close the Beacon session.
    if (beaconSessionRef.current) {
      await db()
        .from('beacon_sessions')
        .update({ is_live: false, ended_at: new Date().toISOString(), activity_id: activityId })
        .eq('id', beaconSessionRef.current)
      beaconSessionRef.current = null
    }
    setSavedId(activityId)
    setStatus('done')
    onSaved()
  }

  const mapPoints = pointsRef.current.map((p) => ({ lat: p.lat, lng: p.lng, ele: p.ele, t: p.t }))

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {status === 'idle' && (
        <div className="card center">
          <div style={{ fontSize: 44 }}>📍</div>
          <h2>Record live with GPS</h2>
          <p className="muted">
            Your phone tracks distance, pace, elevation, and your route in real time. Works best on your phone, on HTTPS, with location permission allowed.
          </p>
          <div className="field" style={{ textAlign: 'left', maxWidth: 320, margin: '0 auto 12px' }}>
            <label>Sport</label>
            <select value={sport} onChange={(e) => setSport(e.target.value)}>
              {SPORTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <label className="row" style={{ justifyContent: 'center', marginBottom: 16 }}>
            <input type="checkbox" checked={beaconOn} onChange={(e) => setBeaconOn(e.target.checked)} />
            Share live location with Beacon while recording
          </label>
          <button className="btn big" onClick={startRecording}>● Start recording</button>
        </div>
      )}

      {(status === 'recording' || status === 'paused') && (
        <div>
          <div className="card">
            <div className="row">
              {status === 'recording' ? (
                <span><span className="live-dot" /> LIVE</span>
              ) : (
                <span className="badge grey">PAUSED</span>
              )}
              <strong style={{ fontSize: 18 }}>{sport}</strong>
              <span className="muted small" style={{ marginLeft: 'auto' }}>{formatDuration(elapsed)}</span>
            </div>
            {segmentAlert && <p style={{ color: 'var(--orange)', fontWeight: 700 }}>{segmentAlert}</p>}
            <div className="rec-stats">
              <div className="rec-stat">
                <div className="v">{formatDistance(distance, unit)}</div>
                <div className="l">Distance</div>
              </div>
              <div className="rec-stat">
                <div className="v">{formatDuration(movingTime)}</div>
                <div className="l">Moving time</div>
              </div>
              <div className="rec-stat">
                <div className="v">{formatPace(distance, movingTime, unit)}</div>
                <div className="l">Avg pace</div>
              </div>
              <div className="rec-stat">
                <div className="v">{currentPace}</div>
                <div className="l">Current pace</div>
              </div>
              <div className="rec-stat">
                <div className="v">{formatSpeed(distance, movingTime, unit)}</div>
                <div className="l">Avg speed</div>
              </div>
              <div className="rec-stat">
                <div className="v">{Math.round(elevation)} m</div>
                <div className="l">Elevation</div>
              </div>
            </div>
            <MapView points={mapPoints} height={260} />
            {splits.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <h3>Splits</h3>
                <div className="row">
                  {splits.map((s) => (
                    <span key={s.n} className="chip">
                      {unit === 'mi' ? 'Mile' : 'Km'} {s.n}: {formatPace(splitTarget, s.seconds, unit)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {beaconUrl && (
              <div className="card" style={{ background: '#fff7ed', marginTop: 12 }}>
                <strong>Beacon is live.</strong>
                <p className="muted small">Anyone with this link can watch you live:</p>
                <p className="small" style={{ wordBreak: 'break-all' }}>{beaconUrl}</p>
                <button className="btn secondary" onClick={() => navigator.clipboard?.writeText(beaconUrl)}>Copy Beacon link</button>
              </div>
            )}
            <div className="row" style={{ marginTop: 16 }}>
              {status === 'recording' ? (
                <button className="btn secondary" onClick={() => pauseRecording()}>Pause</button>
              ) : (
                <button className="btn" onClick={resumeRecording}>Resume</button>
              )}
              <button className="btn danger" onClick={stopRecording}>Finish</button>
            </div>
          </div>
        </div>
      )}

      {status === 'done' && !savedId && (
        <div className="card">
          <h2>Save your {sport}</h2>
          <div className="grid3">
            <div className="stat"><div className="value">{formatDistance(distance, unit)}</div><div className="label">Distance</div></div>
            <div className="stat"><div className="value">{formatDuration(movingTime)}</div><div className="label">Moving time</div></div>
            <div className="stat"><div className="value">{formatPace(distance, movingTime, unit)}</div><div className="label">Avg pace</div></div>
          </div>
          {mapPoints.length > 1 && <MapView points={mapPoints} height={220} />}
          <div className="field" style={{ marginTop: 12 }}>
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel?" />
          </div>
          <div className="grid2">
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
          <button className="btn block" onClick={saveActivity}>Save activity</button>
        </div>
      )}

      {status === 'saving' && (
        <div className="card center"><p>Saving your activity...</p></div>
      )}
      {savedId && (
        <div className="card center">
          <div style={{ fontSize: 40 }}>🎉</div>
          <h2>Activity saved</h2>
          <p className="muted">It is now in your log, on the feed, and counted toward your goals, challenges, and segments.</p>
          <button className="btn" onClick={() => { setStatus('idle'); setSavedId(''); setBeaconUrl(''); }}>Record another</button>
        </div>
      )}
    </div>
  )
}
