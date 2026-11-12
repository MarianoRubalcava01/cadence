import { useCallback, useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { formatDistance } from '../lib/utils'
import type { Activity, Club, ClubMember, Profile, Unit } from '../lib/types'
import { AthleteAvatar } from '../components/ActivityCard'

interface Props {
  userId: string
  unit: Unit
  profile: Profile | null
}

export default function ClubsView({ userId, unit }: Props) {
  const [clubs, setClubs] = useState<Club[]>([])
  const [myClubs, setMyClubs] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Club | null>(null)
  const [members, setMembers] = useState<ClubMember[]>([])
  const [memberActivities, setMemberActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db().from('clubs').select('*').order('created_at', { ascending: false })
    setClubs((data as Club[]) ?? [])
    const { data: mine } = await db().from('club_members').select('club_id').eq('user_id', userId)
    setMyClubs(new Set((mine ?? []).map((m) => m.club_id)))
    setLoading(false)
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  async function openClub(club: Club) {
    setSelected(club)
    const { data: mem } = await db()
      .from('club_members')
      .select('*, profiles(*)')
      .eq('club_id', club.id)
      .order('created_at', { ascending: true })
    setMembers((mem as ClubMember[]) ?? [])
    const memberIds = (mem ?? []).map((m) => m.user_id)
    if (memberIds.length > 0) {
      const { data: acts } = await db()
        .from('activities')
        .select('*')
        .in('user_id', memberIds)
        .eq('privacy', 'public')
        .order('started_at', { ascending: false })
        .limit(20)
      setMemberActivities((acts as Activity[]) ?? [])
    } else {
      setMemberActivities([])
    }
  }

  async function join(clubId: string) {
    const { error } = await db().from('club_members').insert({ club_id: clubId, user_id: userId, role: 'member' })
    if (!error) {
      setMyClubs((s) => new Set(s).add(clubId))
      if (selected?.id === clubId) openClub(selected)
    }
  }

  async function leave(clubId: string) {
    await db().from('club_members').delete().eq('club_id', clubId).eq('user_id', userId)
    setMyClubs((s) => {
      const next = new Set(s)
      next.delete(clubId)
      return next
    })
    if (selected?.id === clubId) openClub(selected)
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    const { data, error } = await db()
      .from('clubs')
      .insert({ name: name.trim(), description: description.trim() || null, owner_id: userId })
      .select('id')
      .single()
    if (error || !data) return
    await db().from('club_members').insert({ club_id: data.id, user_id: userId, role: 'owner' })
    setShowCreate(false)
    setName('')
    setDescription('')
    load()
  }

  // Club leaderboard: distance in the last 4 weeks, by member.
  const leaderboard = (() => {
    const cutoff = Date.now() - 28 * 86400000
    const totals = new Map<string, number>()
    memberActivities.forEach((a) => {
      if (new Date(a.started_at).getTime() < cutoff) return
      totals.set(a.user_id, (totals.get(a.user_id) ?? 0) + a.distance_m)
    })
    return [...totals.entries()]
      .map(([uid, m]) => {
        const member = members.find((x) => x.user_id === uid)
        return { name: member?.profiles?.full_name || member?.profiles?.username || 'Athlete', meters: m }
      })
      .sort((a, b) => b.meters - a.meters)
  })()

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Close' : '+ Create club'}
        </button>
      </div>
      {showCreate && (
        <form className="card" onSubmit={create}>
          <h2>Create a club</h2>
          <div className="field">
            <label>Club name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Edinburg Runners" required />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <button className="btn block" type="submit">Create club</button>
        </form>
      )}
      {loading && <p className="muted center">Loading clubs...</p>}
      {!loading && clubs.length === 0 && (
        <div className="card empty">
          <div className="big">👥</div>
          <h3>No clubs yet</h3>
          <p>Clubs gather athletes around a city, a team, or a training group. Create the first one.</p>
        </div>
      )}
      <div className="grid2">
        {clubs.map((c) => (
          <button key={c.id} className="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => openClub(c)}>
            <strong>{c.name}</strong>
            <p className="muted small" style={{ margin: '4px 0' }}>{c.description || 'No description yet.'}</p>
            {myClubs.has(c.id) ? <span className="badge green">Member</span> : <span className="badge grey">Not a member</span>}
          </button>
        ))}
      </div>
      {selected && (
        <div className="card">
          <h2>{selected.name}</h2>
          <p className="muted">{selected.description}</p>
          <div className="row" style={{ marginBottom: 12 }}>
            {myClubs.has(selected.id) ? (
              <button className="btn secondary" onClick={() => leave(selected.id)}>Leave club</button>
            ) : (
              <button className="btn" onClick={() => join(selected.id)}>Join club</button>
            )}
          </div>
          <h3>Members ({members.length})</h3>
          <div className="row">
            {members.map((m) => (
              <span key={m.id} className="row" style={{ gap: 6 }}>
                <AthleteAvatar profile={m.profiles} />
                <span className="small">{m.profiles?.full_name || m.profiles?.username}</span>
              </span>
            ))}
          </div>
          <h3 style={{ marginTop: 16 }}>Leaderboard — last 4 weeks</h3>
          {leaderboard.length === 0 && <p className="muted">No member activities in the last 4 weeks.</p>}
          <table className="table">
            <tbody>
              {leaderboard.map((row, i) => (
                <tr key={row.name}>
                  <td>{i + 1}</td>
                  <td>{row.name}</td>
                  <td>{formatDistance(row.meters, unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ marginTop: 16 }}>Recent club activities</h3>
          {memberActivities.length === 0 && <p className="muted">No public member activities yet.</p>}
          {memberActivities.slice(0, 8).map((a) => (
            <p key={a.id} className="small" style={{ margin: '4px 0' }}>
              <strong>{a.title}</strong> · {a.sport} · {formatDistance(a.distance_m, unit)} · {new Date(a.started_at).toLocaleDateString()}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
