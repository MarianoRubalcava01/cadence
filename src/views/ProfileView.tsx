import { useCallback, useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { formatDistance } from '../lib/utils'
import type { Activity, Follow, Profile, Unit } from '../lib/types'
import { AthleteAvatar } from '../components/ActivityCard'

interface Props {
  userId: string
  unit: Unit
  profile: Profile | null
  onProfileChanged: (p: Profile) => void
}

export default function ProfileView({ userId, unit, profile, onProfileChanged }: Props) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [followers, setFollowers] = useState<Profile[]>([])
  const [following, setFollowing] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
  const [editName, setEditName] = useState(profile?.full_name ?? '')
  const [editBio, setEditBio] = useState(profile?.bio ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data: acts } = await db().from('activities').select('*').eq('user_id', userId)
    setActivities((acts as Activity[]) ?? [])
    const { data: f1 } = await db().from('follows').select('follower_id, profiles!follows_follower_id_fkey(*)').eq('following_id', userId)
    const toProfile = (v: unknown): Profile | null => {
      if (!v) return null
      if (Array.isArray(v)) return (v[0] as Profile) ?? null
      return v as Profile
    }
    setFollowers(((f1 ?? []).map((r) => toProfile(r.profiles)).filter((p): p is Profile => p !== null)))
    const { data: f2 } = await db().from('follows').select('following_id, profiles!follows_following_id_fkey(*)').eq('follower_id', userId)
    const followingProfiles = ((f2 ?? []).map((r) => toProfile(r.profiles)).filter((p): p is Profile => p !== null))
    setFollowing(followingProfiles)
    setFollowingIds(new Set(followingProfiles.map((p) => p.id)))
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  async function searchAthletes(e: React.FormEvent) {
    e.preventDefault()
    const q = search.trim()
    if (!q) return
    const { data } = await db()
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .neq('id', userId)
      .limit(10)
    setResults((data as Profile[]) ?? [])
  }

  async function follow(id: string) {
    const { error } = await db().from('follows').insert({ follower_id: userId, following_id: id })
    if (!error) {
      setFollowingIds((s) => new Set(s).add(id))
      load()
    }
  }

  async function unfollow(id: string) {
    await db().from('follows').delete().eq('follower_id', userId).eq('following_id', id)
    setFollowingIds((s) => {
      const next = new Set(s)
      next.delete(id)
      return next
    })
    load()
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNotice('')
    let avatarUrl = profile?.avatar_url ?? null
    if (avatarFile) {
      const path = `${userId}/avatar-${Date.now()}.${avatarFile.name.split('.').pop() ?? 'jpg'}`
      const { error: upErr } = await db().storage.from('activity-photos').upload(path, avatarFile, { upsert: true })
      if (upErr) {
        setNotice(upErr.message)
        setBusy(false)
        return
      }
      avatarUrl = db().storage.from('activity-photos').getPublicUrl(path).data.publicUrl
    }
    const { data, error } = await db()
      .from('profiles')
      .update({ full_name: editName.trim() || null, bio: editBio.trim() || null, avatar_url: avatarUrl })
      .eq('id', userId)
      .select()
      .single()
    setBusy(false)
    if (error) {
      setNotice(error.message)
      return
    }
    if (data) onProfileChanged(data as Profile)
    setNotice('Profile saved.')
  }

  const totalKm = activities.reduce((s, a) => s + a.distance_m, 0) / 1000
  const totalHours = activities.reduce((s, a) => s + a.moving_time_s, 0) / 3600

  return (
    <div>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <AthleteAvatar profile={profile} size="lg" />
          <div>
            <h2 style={{ margin: '0 0 4px' }}>{profile?.full_name || profile?.username}</h2>
            <p className="muted" style={{ margin: '0 0 4px' }}>@{profile?.username}</p>
            {profile?.bio && <p style={{ margin: 0 }}>{profile.bio}</p>}
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              {followers.length} followers · {following.length} following
            </p>
          </div>
        </div>
        <div className="grid3" style={{ marginTop: 12 }}>
          <div className="stat"><div className="value">{activities.length}</div><div className="label">Activities</div></div>
          <div className="stat"><div className="value">{totalKm.toFixed(0)} km</div><div className="label">Distance</div></div>
          <div className="stat"><div className="value">{totalHours.toFixed(0)} h</div><div className="label">Moving time</div></div>
        </div>
      </div>

      <form className="card" onSubmit={saveProfile}>
        <h2>Edit profile</h2>
        {notice && <p className="muted">{notice}</p>}
        <div className="field">
          <label>Full name</label>
          <input value={editName} onChange={(e) => setEditName(e.target.value)} />
        </div>
        <div className="field">
          <label>Bio</label>
          <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Runner, cyclist, coffee first." />
        </div>
        <div className="field">
          <label>Avatar photo</label>
          <input type="file" accept="image/*" onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)} />
        </div>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save profile'}</button>
      </form>

      <div className="card">
        <h2>Find athletes</h2>
        <form onSubmit={searchAthletes} className="row">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or username"
            style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)' }}
          />
          <button className="btn" type="submit">Search</button>
        </form>
        {results.map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span className="row" style={{ gap: 8 }}>
              <AthleteAvatar profile={p} />
              <span>
                <strong>{p.full_name || p.username}</strong>
                <span className="muted small"> @{p.username}</span>
              </span>
            </span>
            {followingIds.has(p.id) ? (
              <button className="btn secondary" onClick={() => unfollow(p.id)}>Following</button>
            ) : (
              <button className="btn" onClick={() => follow(p.id)}>Follow</button>
            )}
          </div>
        ))}
        {results.length === 0 && <p className="muted small">Search for athletes by name. Following someone puts their public activities in your Following feed.</p>}
      </div>

      <div className="card">
        <h2>Following ({following.length})</h2>
        {following.length === 0 && <p className="muted">You are not following anyone yet.</p>}
        {following.map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0' }}>
            <span className="row" style={{ gap: 8 }}>
              <AthleteAvatar profile={p} />
              <span>{p.full_name || p.username} <span className="muted small">@{p.username}</span></span>
            </span>
            <button className="btn ghost" onClick={() => unfollow(p.id)}>Unfollow</button>
          </div>
        ))}
        <h2 style={{ marginTop: 16 }}>Followers ({followers.length})</h2>
        {followers.length === 0 && <p className="muted">No followers yet.</p>}
        {followers.map((p) => (
          <div key={p.id} className="row" style={{ gap: 8, padding: '6px 0' }}>
            <AthleteAvatar profile={p} />
            <span>{p.full_name || p.username} <span className="muted small">@{p.username}</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}
