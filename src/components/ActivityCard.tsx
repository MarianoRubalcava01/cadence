import { useEffect, useState } from 'react'
import { db, photoPublicUrl } from '../lib/supabase'
import { formatDateTime, formatDistance, formatDuration, formatPace } from '../lib/utils'
import { isRideSport } from '../lib/types'
import type { Activity, ActivityComment, Profile, Unit } from '../lib/types'
import { RouteSparkline } from './MapView'

interface Props {
  activity: Activity
  currentUserId: string
  unit: Unit
  onChanged?: () => void
  showAthlete?: boolean
}

export function AthleteAvatar({ profile, size = 'sm' }: { profile: Profile | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const initial = (profile?.full_name || profile?.username || '?').slice(0, 1).toUpperCase()
  if (profile?.avatar_url) {
    return <img className={`avatar ${size}`} src={profile.avatar_url} alt={profile.username} />
  }
  return <span className={`avatar ${size}`}>{initial}</span>
}

export default function ActivityCard({ activity, currentUserId, unit, onChanged, showAthlete = true }: Props) {
  const [kudos, setKudos] = useState<number>(activity.kudos_count ?? 0)
  const [gaveKudos, setGaveKudos] = useState(false)
  const [comments, setComments] = useState<ActivityComment[]>([])
  const [showComments, setShowComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(activity.title)
  const [editNotes, setEditNotes] = useState(activity.notes ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: k } = await db()
        .from('kudos')
        .select('user_id')
        .eq('activity_id', activity.id)
      if (cancelled) return
      if (k) {
        setKudos(k.length)
        setGaveKudos(k.some((row) => row.user_id === currentUserId))
      }
      const { data: c } = await db()
        .from('comments')
        .select('*, profiles(*)')
        .eq('activity_id', activity.id)
        .order('created_at', { ascending: true })
      if (!cancelled && c) setComments(c as ActivityComment[])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [activity.id, currentUserId])

  async function toggleKudos() {
    if (gaveKudos) {
      await db().from('kudos').delete().eq('activity_id', activity.id).eq('user_id', currentUserId)
      setGaveKudos(false)
      setKudos((n) => Math.max(0, n - 1))
    } else {
      const { error } = await db().from('kudos').insert({ activity_id: activity.id, user_id: currentUserId })
      if (!error) {
        setGaveKudos(true)
        setKudos((n) => n + 1)
      }
    }
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault()
    const body = commentText.trim()
    if (!body) return
    setBusy(true)
    const { data, error } = await db()
      .from('comments')
      .insert({ activity_id: activity.id, user_id: currentUserId, body })
      .select('*, profiles(*)')
      .single()
    setBusy(false)
    if (!error && data) {
      setComments((list) => [...list, data as ActivityComment])
      setCommentText('')
    }
  }

  async function saveEdit() {
    setBusy(true)
    const { error } = await db()
      .from('activities')
      .update({ title: editTitle, notes: editNotes })
      .eq('id', activity.id)
      .eq('user_id', currentUserId)
    setBusy(false)
    if (!error) {
      setEditing(false)
      onChanged?.()
    }
  }

  async function remove() {
    if (!window.confirm('Delete this activity? This cannot be undone.')) return
    await db().from('activities').delete().eq('id', activity.id).eq('user_id', currentUserId)
    onChanged?.()
  }

  const routePoints =
    activity.route_geojson?.coordinates.map(([lng, lat]) => ({ lat, lng })) ?? []
  const athlete = activity.profiles
  const isOwner = activity.user_id === currentUserId

  return (
    <article className="card">
      {showAthlete && athlete && (
        <div className="row" style={{ marginBottom: 10 }}>
          <AthleteAvatar profile={athlete} />
          <div>
            <strong>{athlete.full_name || athlete.username}</strong>
            <div className="muted small">{formatDateTime(activity.started_at)}</div>
          </div>
          <span className="badge grey" style={{ marginLeft: 'auto' }}>
            {activity.privacy === 'public' ? 'Public' : activity.privacy === 'followers' ? 'Followers' : 'Only me'}
          </span>
        </div>
      )}
      {!showAthlete && <div className="muted small">{formatDateTime(activity.started_at)}</div>}
      {editing ? (
        <div>
          <div className="field">
            <label>Title</label>
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn" onClick={saveEdit} disabled={busy}>Save</button>
            <button className="btn secondary" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <h3 style={{ margin: '0 0 4px' }}>
            {activity.title} <span className="muted small">· {activity.sport}</span>
          </h3>
          {activity.description && <p className="muted" style={{ margin: '0 0 8px' }}>{activity.description}</p>}
          {activity.notes && <p style={{ margin: '0 0 8px' }}>{activity.notes}</p>}
        </>
      )}
      {routePoints.length > 1 && (
        <div style={{ margin: '8px 0', borderRadius: 10, overflow: 'hidden' }}>
          <RouteSparkline points={routePoints} />
        </div>
      )}
      {activity.photo_urls && activity.photo_urls.length > 0 && (
        <div className="row" style={{ margin: '8px 0' }}>
          {activity.photo_urls.map((p) => (
            <img key={p} src={photoPublicUrl(p)} alt="Activity" style={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 10 }} />
          ))}
        </div>
      )}
      <div className="grid3">
        <div className="stat">
          <div className="value">{formatDistance(activity.distance_m, unit)}</div>
          <div className="label">Distance</div>
        </div>
        <div className="stat">
          <div className="value">
            {isRideSport(activity.sport)
              ? (() => {
                  const kmh = activity.moving_time_s > 0 ? activity.distance_m / 1000 / (activity.moving_time_s / 3600) : 0
                  return unit === 'mi' ? `${(kmh / 1.60934).toFixed(1)} mph` : `${kmh.toFixed(1)} km/h`
                })()
              : formatPace(activity.distance_m, activity.moving_time_s, unit)}
          </div>
          <div className="label">{isRideSport(activity.sport) ? 'Avg speed' : 'Avg pace'}</div>
        </div>
        <div className="stat">
          <div className="value">{formatDuration(activity.moving_time_s)}</div>
          <div className="label">Time</div>
        </div>
      </div>
      <div className="muted small">
        Elevation {Math.round(activity.elevation_gain_m)} m · {activity.calories} kcal
        {activity.location ? ` · ${activity.location}` : ''}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className={`icon-btn ${gaveKudos ? 'active' : ''}`} onClick={toggleKudos} style={gaveKudos ? { background: '#fc4c02', color: '#fff', borderColor: '#fc4c02' } : undefined}>
          👍 Kudos · {kudos}
        </button>
        <button className="icon-btn" onClick={() => setShowComments((v) => !v)}>
          💬 Comments · {comments.length}
        </button>
        {isOwner && (
          <>
            <button className="icon-btn" onClick={() => setEditing((v) => !v)}>Edit</button>
            <button className="icon-btn" onClick={remove} style={{ color: '#dc2626' }}>Delete</button>
          </>
        )}
      </div>
      {showComments && (
        <div style={{ marginTop: 12 }}>
          {comments.length === 0 && <p className="muted small">No comments yet. Be the first.</p>}
          {comments.map((c) => (
            <div key={c.id} className="row" style={{ alignItems: 'flex-start', marginBottom: 8 }}>
              <AthleteAvatar profile={c.profiles} />
              <div>
                <strong className="small">{c.profiles?.full_name || c.profiles?.username || 'Athlete'}</strong>{' '}
                <span className="small">{c.body}</span>
              </div>
            </div>
          ))}
          <form onSubmit={addComment} className="row">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment..."
              style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 999, background: 'var(--bg)', color: 'var(--text)' }}
            />
            <button className="btn" type="submit" disabled={busy}>Post</button>
          </form>
        </div>
      )}
    </article>
  )
}
