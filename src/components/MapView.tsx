import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { LatLng } from '../lib/utils'

interface MapViewProps {
  points?: LatLng[]
  routes?: LatLng[][]
  height?: number
  zoom?: number
  center?: LatLng
  onMapClick?: (lat: number, lng: number) => void
  waypoints?: LatLng[]
  interactive?: boolean
}

/**
 * Leaflet map wrapper. Draws a route polyline, optional extra routes
 * (heatmap mode), and optional click-to-add waypoints for the route planner.
 */
export default function MapView({
  points = [],
  routes = [],
  height = 240,
  zoom = 14,
  center,
  onMapClick,
  waypoints = [],
  interactive = true,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      zoomControl: interactive,
      scrollWheelZoom: interactive,
      dragging: interactive,
      attributionControl: true,
    })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    mapRef.current = map
    layerRef.current = L.layerGroup().addTo(map)
    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !onMapClick) return
    const handler = (e: L.LeafletMouseEvent) => onMapClick(e.latlng.lat, e.latlng.lng)
    map.on('click', handler)
    return () => {
      map.off('click', handler)
    }
  }, [onMapClick])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()

    const bounds: L.LatLng[] = []
    const pushBounds = (p: LatLng) => bounds.push(L.latLng(p.lat, p.lng))

    if (points.length > 0) {
      const latlngs = points.map((p) => L.latLng(p.lat, p.lng))
      L.polyline(latlngs, { color: '#0089ff', weight: 4 }).addTo(layer)
      L.circleMarker(latlngs[0], { radius: 6, color: '#16a34a', fillColor: '#16a34a', fillOpacity: 1 }).addTo(layer)
      L.circleMarker(latlngs[latlngs.length - 1], { radius: 6, color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1 }).addTo(layer)
      points.forEach(pushBounds)
    }
    routes.forEach((route) => {
      if (route.length < 2) return
      L.polyline(
        route.map((p) => L.latLng(p.lat, p.lng)),
        { color: '#0089ff', weight: 3, opacity: 0.45 },
      ).addTo(layer)
      route.forEach(pushBounds)
    })
    waypoints.forEach((w, i) => {
      L.circleMarker(L.latLng(w.lat, w.lng), {
        radius: 7,
        color: '#0089ff',
        fillColor: '#0089ff',
        fillOpacity: 1,
      })
        .bindTooltip(String(i + 1), { permanent: true, direction: 'top', offset: [0, -8] })
        .addTo(layer)
      pushBounds(w)
    })

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.25))
    } else if (center) {
      map.setView([center.lat, center.lng], zoom)
    } else {
      map.setView([29.7604, -95.3698], 11)
    }
    setTimeout(() => map.invalidateSize(), 100)
  }, [points, routes, waypoints, center, zoom])

  return <div ref={containerRef} className="map-box" style={{ height }} />
}

/** Lightweight SVG route preview for feed cards (no Leaflet instance). */
export function RouteSparkline({ points }: { points: { lat: number; lng: number }[] }) {
  if (!points || points.length < 2) return null
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const w = 320
  const h = 120
  const spanLat = maxLat - minLat || 0.0001
  const spanLng = maxLng - minLng || 0.0001
  const scale = Math.min(w / spanLng, h / spanLat) * 0.9
  const path = points
    .map((p, i) => {
      const x = ((p.lng - minLng) * scale + (w - spanLng * scale) / 2).toFixed(1)
      const y = (h - (p.lat - minLat) * scale - (h - spanLat * scale) / 2).toFixed(1)
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="110" style={{ display: 'block', background: '#eef1f4' }}>
      <path d={path} fill="none" stroke="#0089ff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
