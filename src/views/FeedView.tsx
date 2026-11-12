import { useCallback, useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import type { Activity, Unit } from '../lib/types'
import ActivityCard from '../components/ActivityCard'

interface Props {
  userId: string
  unit: Unit
}

export default function FeedView({ userId, unit }: Props) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'following'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    let query = db()
      .from('activities')
      .select('*, profiles(*)')
      .order('started_at', { ascending: false })
      .limit(50)
    if (filter === 'following') {
      const { data: follows } = await db().from('follows').select('following_id').eq('follower_id', userId)
      const ids = (follows ?? []).map((f) => f.following_id)
      ids.push(userId)
      query = query.in('user_id', ids.length > 0 ? ids : ['__none__'])
    }
    const { data } = await query
    setActivities((data as Activity[]) ?? [])
    setLoading(false)
  }, [filter, userId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Everyone</button>
        <button className={`chip ${filter === 'following' ? 'active' : ''}`} onClick={() => setFilter('following')}>Following</button>
        <button className="btn ghost" onClick={load}>Refresh</button>
      </div>
      {loading && <p className="muted center">Loading the feed...</p>}
      {!loading && activities.length === 0 && (
        <div className="card empty">
          <div className="big">🏃</div>
          <h3>No activities yet</h3>
          <p>When athletes you follow post public activities, they show up here. Be the first to record one.</p>
        </div>
      )}
      {activities.map((a) => (
        <ActivityCard key={a.id} activity={a} currentUserId={userId} unit={unit} onChanged={load} />
      ))}
    </div>
  )
}
