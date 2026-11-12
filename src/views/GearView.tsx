import { useCallback, useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { formatDistance } from '../lib/utils'
import type { GearItem, Unit } from '../lib/types'

interface Props {
  userId: string
  unit: Unit
}

export default function GearView({ userId, unit }: Props) {
  const [gear, setGear] = useState<GearItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('Shoes')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [retireKm, setRetireKm] = useState('500')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: g } = await db().from('gear').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    const items = (g as GearItem[]) ?? []
    // Recompute mileage from activities assigned to each gear item.
    const { data: acts } = await db().from('activities').select('gear_id, distance_m').eq('user_id', userId).not('gear_id', 'is', null)
    const totals = new Map<string, number>()
    ;(acts ?? []).forEach((a) => {
      if (a.gear_id) totals.set(a.gear_id, (totals.get(a.gear_id) ?? 0) + a.distance_m)
    })
    setGear(items.map((item) => ({ ...item, distance_m: totals.get(item.id) ?? 0 })))
    setLoading(false)
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await db().from('gear').insert({
      user_id: userId,
      name: name.trim(),
      type,
      brand: brand.trim() || null,
      model: model.trim() || null,
      distance_m: 0,
      retire_at_m: retireKm ? Math.round(parseFloat(retireKm) * 1000) : null,
    })
    if (!error) {
      setShowForm(false)
      setName('')
      setBrand('')
      setModel('')
      load()
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this gear? Activities keep their history, but the gear is gone.')) return
    await db().from('gear').delete().eq('id', id).eq('user_id', userId)
    load()
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close' : '+ Add gear'}
        </button>
      </div>
      {showForm && (
        <form className="card" onSubmit={add}>
          <h2>Add gear</h2>
          <div className="grid2">
            <div className="field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nike Pegasus 41" required />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option>Shoes</option>
                <option>Bike</option>
                <option>Other</option>
              </select>
            </div>
            <div className="field">
              <label>Brand</label>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Nike" />
            </div>
            <div className="field">
              <label>Model</label>
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Pegasus 41" />
            </div>
            <div className="field">
              <label>Retire after (km)</label>
              <input type="number" min="0" value={retireKm} onChange={(e) => setRetireKm(e.target.value)} placeholder="500" />
            </div>
          </div>
          <button className="btn block" type="submit">Add gear</button>
        </form>
      )}
      {loading && <p className="muted center">Loading gear...</p>}
      {!loading && gear.length === 0 && (
        <div className="card empty">
          <div className="big">👟</div>
          <h3>No gear yet</h3>
          <p>Add your shoes or bikes. Mileage adds up automatically from the activities you assign to them, and the locker warns you when it is time to retire them.</p>
        </div>
      )}
      {gear.map((g) => {
        const pct = g.retire_at_m ? Math.min(100, (g.distance_m / g.retire_at_m) * 100) : 0
        const due = g.retire_at_m ? g.distance_m >= g.retire_at_m : false
        return (
          <div key={g.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{g.name}</strong>
                <div className="muted small">
                  {g.type}
                  {g.brand ? ` · ${g.brand}` : ''}
                  {g.model ? ` ${g.model}` : ''}
                </div>
              </div>
              <button className="btn ghost" onClick={() => remove(g.id)}>Remove</button>
            </div>
            <p style={{ margin: '10px 0 4px' }}>
              <strong>{formatDistance(g.distance_m, unit)}</strong>
              {g.retire_at_m ? ` of ${formatDistance(g.retire_at_m, unit)} before retirement` : ' logged'}
            </p>
            {g.retire_at_m && (
              <>
                <div className="progress"><div style={{ width: `${pct}%`, background: due ? '#dc2626' : '#fc4c02' }} /></div>
                {due && <p style={{ color: '#dc2626', fontWeight: 700, margin: '8px 0 0' }}>Time to retire — this gear has reached its limit.</p>}
                {!due && pct > 80 && <p style={{ color: '#d97706', fontWeight: 700, margin: '8px 0 0' }}>Getting close to retirement ({Math.round(pct)}%).</p>}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
