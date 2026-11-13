import { useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { formatDuration } from '../lib/utils'
import type { BeaconPoint, BeaconSession } from '../lib/types'
import MapView from '../components/MapView'

/**
 * Public Beacon viewer. Anyone with the link watches a live recording:
 * points arrive through Supabase Realtime (postgres_changes on beacon_points).
 * No sign-in is required to view.
 */
export default function BeaconView({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<BeaconSession | null>(null)
  const [points, setPoints] = useState<BeaconPoint[]>([])
  const [error, setError] = useState('')
  const [started, setStarted] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await db()
        .from('beacon_sessions')
        .select('*, profiles(*)')
        .eq('id', sessionId)
        .single()
      if (cancelled) return
      if (error || !data) {
        setError('This Beacon link is not valid or has expired.')
        return
      }
      setSession(data as BeaconSession)
      setStarted(data.started_at)
      const { data: pts } = await db()
        .from('beacon_points')
        .select('*')
        .eq('session_id', sessionId)
        .order('recorded_at', { ascending: true })
      if (!cancelled && pts) setPoints(pts as BeaconPoint[])
    }
    load()

    const channel = db()
      .channel(`beacon-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'beacon_points', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as BeaconPoint
          setPoints((list) => [...list, row])
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'beacon_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const row = payload.new as BeaconSession
          setSession((s) => (s ? { ...s, ...row } : row))
        },
      )
      .subscribe()
    return () => {
      cancelled = true
      db().removeChannel(channel)
    }
  }, [sessionId])

  if (error) {
    return (
      <div className="app">
        <main className="main">
          <div className="card empty">
            <div className="big">📍</div>
            <h3>Beacon not found</h3>
            <p>{error}</p>
          </div>
        </main>
      </div>
    )
  }

  const athlete = session?.profiles
  const mapPoints = points.map((p) => ({ lat: p.lat, lng: p.lng }))
  const liveSeconds = started ? Math.max(0, (Date.now() - new Date(started).getTime()) / 1000) : 0

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          Cadence Beacon
        </div>
      </header>
      <main className="main">
        <div className="card">
          <div className="row">
            {session?.is_live ? (
              <span><span className="live-dot" /> LIVE</span>
            ) : (
              <span className="badge grey">Finished</span>
            )}
            <strong style={{ fontSize: 18 }}>
              {athlete?.full_name || athlete?.username || 'Athlete'}
            </strong>
          </div>
          <p className="muted">
            {session?.is_live
              ? `Live now — recording for ${formatDuration(liveSeconds)}. This page updates as new GPS points arrive.`
              : 'This Beacon session has ended. The final route is below.'}
          </p>
          {mapPoints.length > 0 ? (
            <MapView points={mapPoints} height={360} />
          ) : (
            <div className="empty">
              <div className="big">📍</div>
              <p>Waiting for the first GPS point...</p>
            </div>
          )}
          <p className="muted small" style={{ marginTop: 10 }}>
            {points.length} points received · Started {started ? new Date(started).toLocaleString() : '—'}
          </p>
        </div>
      </main>
    </div>
  )
}
