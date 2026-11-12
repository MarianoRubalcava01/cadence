import { SPORT_MET } from './types'
import type { Activity, Unit } from './types'

export const KM_PER_MI = 1.60934

export function toDisplayDistance(meters: number, unit: Unit): number {
  return unit === 'mi' ? meters / 1609.34 : meters / 1000
}

export function formatDistance(meters: number, unit: Unit): string {
  const v = toDisplayDistance(meters, unit)
  return `${v.toFixed(v >= 100 ? 0 : 2)} ${unit}`
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

/** Pace as min:sec per km or per mile. */
export function formatPace(distanceM: number, seconds: number, unit: Unit): string {
  if (distanceM <= 0 || seconds <= 0) return '--:--'
  const dist = unit === 'mi' ? distanceM / 1609.34 : distanceM / 1000
  const perUnit = seconds / dist
  const m = Math.floor(perUnit / 60)
  const s = Math.round(perUnit % 60)
  return `${m}:${String(s).padStart(2, '0')} /${unit}`
}

export function formatSpeed(distanceM: number, seconds: number, unit: Unit): string {
  if (distanceM <= 0 || seconds <= 0) return '0.0'
  const kmh = (distanceM / 1000 / seconds) * 3600
  return unit === 'mi' ? `${(kmh / KM_PER_MI).toFixed(1)} mph` : `${kmh.toFixed(1)} km/h`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

export function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

// ---------------------------------------------------------------------------
// Geo math
// ---------------------------------------------------------------------------

export interface LatLng {
  lat: number
  lng: number
  ele?: number | null
  t?: number
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function pathDistanceM(points: LatLng[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += haversineMeters(points[i - 1], points[i])
  return total
}

export function pathElevationGainM(points: LatLng[]): number {
  let gain = 0
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].ele ?? 0
    const cur = points[i].ele ?? 0
    if (cur > prev) gain += cur - prev
  }
  return gain
}

/** Splits: one record per whole km (or mile) of the path. */
export interface Split {
  n: number
  seconds: number
  distanceM: number
}

export function computeSplits(points: LatLng[], unit: Unit): Split[] {
  const target = unit === 'mi' ? 1609.34 : 1000
  const splits: Split[] = []
  let accDist = 0
  let accTime = 0
  let splitStartTime = points.length > 0 ? (points[0].t ?? 0) : 0
  let nextTarget = target
  for (let i = 1; i < points.length; i++) {
    const d = haversineMeters(points[i - 1], points[i])
    const dt = ((points[i].t ?? 0) - (points[i - 1].t ?? 0)) / 1000
    accDist += d
    accTime += Math.max(0, dt)
    if (accDist >= nextTarget) {
      splits.push({ n: splits.length + 1, seconds: accTime, distanceM: nextTarget })
      nextTarget += target
      splitStartTime = points[i].t ?? splitStartTime
    }
  }
  return splits
}

// ---------------------------------------------------------------------------
// Calories and training load
// ---------------------------------------------------------------------------

export function estimateCalories(sport: string, durationS: number, weightKg = 70): number {
  const met = SPORT_MET[sport] ?? 6
  return Math.round((met * weightKg * durationS) / 3600)
}

/**
 * Relative Effort / training load for one activity.
 * load = duration (min) x intensity (0-10), from perceived effort or heart rate.
 */
export function activityLoad(a: Activity): number {
  const minutes = a.moving_time_s / 60
  let intensity = 5
  if (a.effort) intensity = a.effort
  else if (a.avg_hr) intensity = Math.min(10, Math.max(1, (a.avg_hr - 60) / 12))
  return minutes * intensity
}

export interface FitnessFreshness {
  ctl: number
  atl: number
  tsb: number
  form: 'Fresh' | 'Neutral' | 'Tired' | 'Very tired'
}

/** Chronic Training Load (42d), Acute Training Load (7d), Training Stress Balance. */
export function fitnessFreshness(activities: Activity[]): FitnessFreshness {
  const now = Date.now()
  const day = 86400000
  const loadOnDay = (daysBack: number): number => {
    const from = now - (daysBack + 1) * day
    const to = now - daysBack * day
    return activities
      .filter((a) => {
        const t = new Date(a.started_at).getTime()
        return t >= from && t < to
      })
      .reduce((sum, a) => sum + activityLoad(a), 0)
  }
  let ctl = 0
  let atl = 0
  for (let d = 41; d >= 0; d--) {
    const load = loadOnDay(d)
    ctl = ctl + (load - ctl) * (1 / 42)
    if (d < 7) atl = atl + (load - atl) * (1 / 7)
  }
  const tsb = ctl - atl
  const form: FitnessFreshness['form'] =
    tsb > 15 ? 'Fresh' : tsb > -10 ? 'Neutral' : tsb > -25 ? 'Tired' : 'Very tired'
  return { ctl: Math.round(ctl), atl: Math.round(atl), tsb: Math.round(tsb), form }
}

/** Fitness Score 0-100 from recent volume, consistency, and variety. */
export function fitnessScore(activities: Activity[]): number {
  const now = Date.now()
  const week = activities.filter((a) => new Date(a.started_at).getTime() > now - 7 * 86400000)
  const month = activities.filter((a) => new Date(a.started_at).getTime() > now - 28 * 86400000)
  const weeklyKm = week.reduce((s, a) => s + a.distance_m, 0) / 1000
  const monthlyDays = new Set(month.map((a) => a.started_at.slice(0, 10))).size
  const sports = new Set(month.map((a) => a.sport)).size
  const volume = Math.min(40, weeklyKm * 1.2)
  const consistency = Math.min(35, monthlyDays * 2.5)
  const variety = Math.min(15, sports * 5)
  const load = Math.min(10, month.reduce((s, a) => s + activityLoad(a), 0) / 100)
  return Math.round(volume + consistency + variety + load)
}

export function currentStreak(activities: Activity[]): number {
  const days = new Set(activities.map((a) => a.started_at.slice(0, 10)))
  let streak = 0
  const d = new Date()
  if (!days.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1)
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

/** Last 14 days of activity counts, oldest first. */
export function last14Days(activities: Activity[]): { date: string; count: number }[] {
  const out: { date: string; count: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = daysAgo(i)
    const key = d.toISOString().slice(0, 10)
    out.push({ date: key, count: activities.filter((a) => a.started_at.slice(0, 10) === key).length })
  }
  return out
}

export function weekTotals(activities: Activity[], weeksBack: number): number[] {
  const out: number[] = []
  for (let w = weeksBack - 1; w >= 0; w--) {
    const from = Date.now() - (w + 1) * 7 * 86400000
    const to = Date.now() - w * 7 * 86400000
    out.push(
      activities
        .filter((a) => {
          const t = new Date(a.started_at).getTime()
          return t >= from && t < to
        })
        .reduce((s, a) => s + a.distance_m, 0),
    )
  }
  return out
}

export function downloadCSV(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function activitiesToCSV(activities: Activity[]): string[][] {
  const header = ['Date', 'Sport', 'Title', 'Distance (m)', 'Moving Time (s)', 'Elevation (m)', 'Calories', 'Privacy']
  const rows = activities.map((a) => [
    a.started_at,
    a.sport,
    a.title,
    String(Math.round(a.distance_m)),
    String(a.moving_time_s),
    String(Math.round(a.elevation_gain_m)),
    String(a.calories),
    a.privacy,
  ])
  return [header, ...rows]
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
