import { useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { formatDistance, formatDuration, haversineMeters, pathDistanceM } from '../lib/utils'
import type { SavedRoute, Unit } from '../lib/types'
import MapView from '../components/MapView'

interface Props {
  userId: string
  unit: Unit
}

interface Waypoint {
  lat: number
  lng: number
}

/** OSRM public demo server for snap-to-road routing. Falls back to straight lines. */
async function snapRoute(points: Waypoint[]): Promise<Waypoint[]> {
  if (points.length < 2) return points
  try {
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson`,
    )
    if (!res.ok) return points
    const json = await res.json()
    const route = json?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined
    if (!route || route.length < 2) return points
    return route.map(([lng, lat]) => ({ lat, lng }))
  } catch {
    return points
  }
}

export default function RoutesView({ userId, unit }: Props) {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([])
  const [route, setRoute] = useState<Waypoint[]>([])
  const [routeName, setRouteName] = useState('')
  const [saved, setSaved] = useState<SavedRoute[]>([])
  const [targetKm, setTargetKm] = useState('5')
  const [center, setCenter] = useState<Waypoint>({ lat: 29.7604, lng: -95.3698 })
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadSaved()
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => undefined,
        { timeout: 8000 },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadSaved() {
    const { data } = await db().from('routes').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (data) setSaved(data as SavedRoute[])
  }

  function addWaypoint(lat: number, lng: number) {
    setWaypoints((w) => [...w, { lat, lng }])
  }

  async function buildRoute() {
    if (waypoints.length < 2) {
      setNotice('Tap at least two points on the map to build a route.')
      return
    }
    setBusy(true)
    const snapped = await snapRoute(waypoints)
    setRoute(snapped)
    setBusy(false)
    setNotice(
      snapped.length > waypoints.length
        ? 'Route snapped to roads and trails via OSRM.'
        : 'Road snapping was unavailable, so the route follows straight lines between your points.',
    )
  }

  async function suggestRoute() {
    const targetM = parseFloat(targetKm || '5') * 1000
    if (targetM <= 0) return
    setBusy(true)
    // Generate a loop of waypoints around the map center, then snap to roads.
    const radiusDeg = (targetM / 4 / 111320) * 1.4
    const pts: Waypoint[] = []
    const n = 6
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2
      pts.push({
        lat: center.lat + Math.sin(angle) * radiusDeg,
        lng: center.lng + Math.cos(angle) * radiusDeg,
      })
    }
    pts.push(pts[0])
    const snapped = await snapRoute(pts)
    setWaypoints(pts)
    setRoute(snapped)
    setBusy(false)
    setNotice(`Suggested a loop of about ${formatDistance(pathDistanceM(snapped), unit)}. Adjust the points and save it.`)
  }

  async function saveRoute() {
    if (route.length < 2) {
      setNotice('Build a route first.')
      return
    }
    const dist = pathDistanceM(route)
    const { error } = await db().from('routes').insert({
      user_id: userId,
      name: routeName.trim() || `Route — ${formatDistance(dist, unit)}`,
      sport: 'Run',
      distance_m: Math.round(dist),
      elevation_gain_m: 0,
      is_public: true,
      route_geojson: { type: 'LineString', coordinates: route.map((p) => [p.lng, p.lat]) },
    })
    if (error) {
      setNotice(error.message)
      return
    }
    setNotice('Route saved.')
    setRouteName('')
    loadSaved()
  }

  const routeDist = pathDistanceM(route)
  const estSeconds = routeDist > 0 ? (routeDist / 1000 / 10) * 3600 : 0

  return (
    <div>
      <div className="card">
        <h2>Route planner</h2>
        <p className="muted">Tap the map to drop waypoints, then build the route. Roads are snapped with the public OSRM router where possible.</p>
        <MapView
          height={320}
          center={center}
          waypoints={waypoints}
          points={route}
          onMapClick={addWaypoint}
        />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={buildRoute} disabled={busy || waypoints.length < 2}>
            {busy ? 'Building...' : 'Build route'}
          </button>
          <button className="btn secondary" onClick={() => { setWaypoints([]); setRoute([]) }}>Clear</button>
          <span className="muted small">{waypoints.length} waypoints</span>
        </div>
        {route.length > 1 && (
          <div style={{ marginTop: 12 }}>
            <p>
              <strong>{formatDistance(routeDist, unit)}</strong> · about {formatDuration(estSeconds)} at 10 km/h
            </p>
            <div className="row">
              <input
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                placeholder="Route name"
                style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)' }}
              />
              <button className="btn" onClick={saveRoute}>Save route</button>
            </div>
          </div>
        )}
        {notice && <p className="muted" style={{ marginTop: 10 }}>{notice}</p>}
      </div>

      <div className="card">
        <h2>Suggested routes</h2>
        <p className="muted">Enter a target distance and get a loop from your current area.</p>
        <div className="row">
          <input
            type="number"
            step="0.5"
            min="1"
            value={targetKm}
            onChange={(e) => setTargetKm(e.target.value)}
            style={{ width: 110, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)' }}
          />
          <span>km</span>
          <button className="btn secondary" onClick={suggestRoute} disabled={busy}>
            {busy ? 'Working...' : 'Suggest a route'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Saved routes</h2>
        {saved.length === 0 && <p className="muted">No saved routes yet. Build one above and save it.</p>}
        {saved.map((r) => (
          <div key={r.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <strong>{r.name}</strong>
              <div className="muted small">{formatDistance(r.distance_m, unit)}</div>
            </div>
            <button
              className="btn ghost"
              onClick={() => {
                const pts = r.route_geojson.coordinates.map(([lng, lat]) => ({ lat, lng }))
                setRoute(pts)
                setWaypoints(pts.filter((_, i) => i % Math.ceil(pts.length / 6) === 0))
              }}
            >
              Load
            </button>
          </div>
        ))}
        <p className="muted small" style={{ marginTop: 10 }}>
          Elevation profile: routes built from recorded activities carry real elevation. Planned routes show distance and estimated time; elevation comes from the GPS track once you ride or run them.
        </p>
      </div>
    </div>
  )
}
