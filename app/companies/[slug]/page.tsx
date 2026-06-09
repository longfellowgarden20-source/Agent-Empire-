'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Business {
  id: string
  name: string
  slug: string
  status: string
  description: string
  war_room_score: number
  revenue_today: number
  revenue_week: number
  mrr: number
  target_mrr: number
  created_at: string
}

interface AgentRun {
  id: string
  agent: string
  status: string
  summary: string
  created_at: string
  cost_usd: number
  duration_ms: number
}

interface TaskQueueRow {
  id: string
  from_agent: string
  to_agent: string
  task_type: string
  status: string
  priority: number
  created_at: string
  payload: Record<string, unknown>
}

interface Prospect {
  id: string
  company_name: string
  score: number
  outreach_status: string
  created_at: string
}

const scoreColor = (val: number, max: number) => {
  const pct = val / max
  if (pct >= 0.7) return '#22c55e'
  if (pct >= 0.4) return '#eab308'
  return '#ef4444'
}

const statusDot = (status: string) => {
  if (status === 'success' || status === 'completed') return '#22c55e'
  if (status === 'failed' || status === 'error') return '#ef4444'
  return '#eab308'
}

const taskStatusColor = (status: string) => {
  if (status === 'done' || status === 'completed') return '#22c55e'
  if (status === 'running') return '#3b82f6'
  if (status === 'failed') return '#ef4444'
  return '#555555'
}

const fmtCurrency = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${(n ?? 0).toFixed(0)}`

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + fmtTime(iso)
}

export default function BusinessPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [business, setBusiness] = useState<Business | null>(null)
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([])
  const [tasks, setTasks] = useState<TaskQueueRow[]>([])
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [orderText, setOrderText] = useState('')
  const [orders, setOrders] = useState<TaskQueueRow[]>([])
  const [sending, setSending] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const loadData = async () => {
    const { data: biz } = await supabase
      .from('businesses')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!biz) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setBusiness(biz)

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [{ data: runs }, { data: taskRows }, { data: prospectRows }, { data: orderRows }] = await Promise.all([
      supabase
        .from('agent_runs')
        .select('*')
        .ilike('agent', `%${slug}%`)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('task_queue')
        .select('*')
        .or(`from_agent.ilike.%${slug}%,to_agent.ilike.%${slug}%,payload->business.eq.${slug}`)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('prospects')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('task_queue')
        .select('*')
        .eq('task_type', 'chairman_order')
        .eq('from_agent', 'chairman')
        .contains('payload', { business: slug })
        .order('created_at', { ascending: false })
        .limit(3),
    ])

    setAgentRuns(runs ?? [])
    setTasks(taskRows ?? [])
    setProspects(prospectRows ?? [])
    setOrders(orderRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (!slug) return
    loadData()

    const channel = supabase
      .channel(`business-${slug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_runs' }, () => {
        supabase
          .from('agent_runs')
          .select('*')
          .ilike('agent', `%${slug}%`)
          .order('created_at', { ascending: false })
          .limit(50)
          .then(({ data }) => setAgentRuns(data ?? []))
      })
      .subscribe()

    realtimeRef.current = channel

    return () => {
      channel.unsubscribe()
    }
  }, [slug])

  const sendOrder = async () => {
    if (!orderText.trim()) return
    setSending(true)
    const { data, error } = await supabase
      .from('task_queue')
      .upsert({
        from_agent: 'chairman',
        to_agent: 'war_room',
        task_type: 'chairman_order',
        payload: { order: orderText.trim(), business: slug },
        priority: 10,
        status: 'pending',
      })
      .select()
      .single()

    if (!error && data) {
      setOrders((prev) => [data, ...prev].slice(0, 3))
      setOrderText('')
    }
    setSending(false)
  }

  const updateStatus = async (newStatus: string) => {
    const label = newStatus === 'paused' ? 'PAUSE' : 'ACTIVATE'
    if (!window.confirm(`Confirm: ${label} business "${business?.name}"?`)) return
    const { error } = await supabase
      .from('businesses')
      .update({ status: newStatus })
      .eq('slug', slug)
    if (!error) {
      setBusiness((prev) => prev ? { ...prev, status: newStatus } : prev)
      setActionMsg(`Business ${newStatus === 'paused' ? 'paused' : 'activated'}.`)
      setTimeout(() => setActionMsg(''), 3000)
    }
  }

  const agentRunsToday = agentRuns.filter((r) => {
    const d = new Date(r.created_at)
    const now = new Date()
    return d.toDateString() === now.toDateString()
  }).length

  const scoreBreakdown = business
    ? [
        { label: 'Revenue', max: 40, value: Math.min(40, Math.round(((business.revenue_week ?? 0) / Math.max(business.target_mrr ?? 1, 1)) * 40)) },
        { label: 'Growth', max: 25, value: Math.min(25, Math.round((business.war_room_score ?? 0) * 0.25)) },
        { label: 'Agent Health', max: 20, value: Math.min(20, Math.round((agentRuns.filter((r) => r.status === 'success' || r.status === 'completed').length / Math.max(agentRuns.length, 1)) * 20)) },
        { label: 'Market', max: 15, value: Math.min(15, Math.round((business.war_room_score ?? 0) * 0.15)) },
      ]
    : []

  const root: React.CSSProperties = {
    background: '#0a0a0a',
    minHeight: '100vh',
    color: '#e5e5e5',
    fontFamily: "'Courier New', Courier, monospace",
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  }

  if (loading) {
    return (
      <div style={root}>
        <div style={{ color: '#555', fontSize: '14px', paddingTop: '80px', textAlign: 'center' }}>
          LOADING BUSINESS DATA...
        </div>
      </div>
    )
  }

  if (notFound || !business) {
    return (
      <div style={root}>
        <Link href="/companies" style={{ color: '#555', fontSize: '13px', textDecoration: 'none' }}>
          ← Empire
        </Link>
        <div style={{ color: '#ef4444', fontSize: '20px', marginTop: '48px', textAlign: 'center' }}>
          Business not found
        </div>
      </div>
    )
  }

  return (
    <div style={root}>
      <div style={{ marginBottom: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <Link href="/companies" style={{ color: '#555', fontSize: '13px', textDecoration: 'none', display: 'block', marginBottom: '8px' }}>
            ← Empire
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: '#ffffff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {business.name}
            </h1>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: '3px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              background: business.status === 'active' ? 'rgba(34,197,94,0.15)' : business.status === 'paused' ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)',
              color: business.status === 'active' ? '#22c55e' : business.status === 'paused' ? '#eab308' : '#ef4444',
              border: `1px solid ${business.status === 'active' ? '#22c55e' : business.status === 'paused' ? '#eab308' : '#ef4444'}`,
            }}>
              {business.status}
            </span>
          </div>
          {business.description && (
            <div style={{ color: '#666', fontSize: '13px', marginTop: '6px' }}>{business.description}</div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: 'Today Revenue', value: fmtCurrency(business.revenue_today ?? 0) },
          { label: 'Week Revenue', value: fmtCurrency(business.revenue_week ?? 0) },
          { label: 'MRR', value: fmtCurrency(business.mrr ?? 0) },
          { label: 'War Room Score', value: `${business.war_room_score ?? 0}/100` },
          { label: 'Agent Runs Today', value: String(agentRunsToday) },
        ].map((stat) => (
          <div key={stat.label} style={{
            background: '#111',
            border: '1px solid #1f1f1f',
            borderRadius: '6px',
            padding: '16px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>{stat.value}</div>
            <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: '6px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', color: '#666', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '16px' }}>
          War Room Score Breakdown
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {scoreBreakdown.map((dim) => {
            const pct = (dim.value / dim.max) * 100
            const color = scoreColor(dim.value, dim.max)
            return (
              <div key={dim.label} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 70px', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontSize: '12px', color: '#aaa' }}>{dim.label}</div>
                <div style={{ background: '#1a1a1a', borderRadius: '3px', height: '10px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s ease', borderRadius: '3px' }} />
                </div>
                <div style={{ fontSize: '12px', color, textAlign: 'right' }}>{dim.value}/{dim.max}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: '6px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', color: '#666', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '14px' }}>
          Direct Order
        </div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <input
            value={orderText}
            onChange={(e) => setOrderText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendOrder()}
            placeholder="e.g. focus on enterprise clients this week"
            style={{
              flex: 1,
              background: '#0a0a0a',
              border: '1px solid #2a2a2a',
              borderRadius: '4px',
              color: '#e5e5e5',
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: '13px',
              padding: '10px 14px',
              outline: 'none',
            }}
          />
          <button
            onClick={sendOrder}
            disabled={sending || !orderText.trim()}
            style={{
              background: sending ? '#1a1a1a' : '#22c55e',
              color: sending ? '#555' : '#000',
              border: 'none',
              borderRadius: '4px',
              padding: '10px 20px',
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              cursor: sending ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase',
            }}
          >
            {sending ? 'SENDING...' : 'SEND'}
          </button>
        </div>
        {orders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {orders.map((o) => (
              <div key={o.id} style={{ fontSize: '12px', color: '#555', padding: '8px 10px', background: '#0d0d0d', borderRadius: '3px', borderLeft: '2px solid #22c55e' }}>
                <span style={{ color: '#777' }}>{fmtDate(o.created_at)}</span>
                {' '}
                <span style={{ color: '#aaa' }}>{(o.payload as { order?: string })?.order ?? JSON.stringify(o.payload)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: '6px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', color: '#666', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Live Activity Feed
          </div>
          <div style={{ fontSize: '10px', color: '#333', letterSpacing: '0.08em' }}>REALTIME</div>
        </div>
        {agentRuns.length === 0 ? (
          <div style={{ color: '#333', fontSize: '12px' }}>No agent runs found.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {agentRuns.slice(0, 20).map((run) => (
              <div key={run.id} style={{
                display: 'grid',
                gridTemplateColumns: '90px 160px 14px 1fr',
                alignItems: 'center',
                gap: '10px',
                padding: '7px 10px',
                background: '#0d0d0d',
                borderRadius: '3px',
                fontSize: '12px',
              }}>
                <div style={{ color: '#444' }}>{fmtTime(run.created_at)}</div>
                <div style={{ color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.agent}</div>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: statusDot(run.status), flexShrink: 0 }} />
                <div style={{ color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.summary ?? '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: '6px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', color: '#666', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '14px' }}>
          Task Queue
        </div>
        {tasks.length === 0 ? (
          <div style={{ color: '#333', fontSize: '12px' }}>No tasks found.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {tasks.slice(0, 10).map((t) => (
              <div key={t.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 140px 90px 50px',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                background: '#0d0d0d',
                borderRadius: '3px',
                fontSize: '12px',
              }}>
                <div style={{ color: '#888' }}>
                  <span style={{ color: '#555' }}>{t.from_agent}</span>
                  <span style={{ color: '#333', margin: '0 6px' }}>→</span>
                  <span style={{ color: '#888' }}>{t.to_agent}</span>
                </div>
                <div style={{ color: '#666' }}>{t.task_type}</div>
                <div style={{ color: taskStatusColor(t.status), textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.06em' }}>
                  {t.status}
                </div>
                <div style={{ color: '#444', textAlign: 'right' }}>P{t.priority}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button
          onClick={() => updateStatus('paused')}
          style={{
            background: 'rgba(234,179,8,0.1)',
            border: '1px solid #eab308',
            color: '#eab308',
            borderRadius: '4px',
            padding: '12px 24px',
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          ⏸ PAUSE BUSINESS
        </button>
        <button
          onClick={() => updateStatus('active')}
          style={{
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid #22c55e',
            color: '#22c55e',
            borderRadius: '4px',
            padding: '12px 24px',
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            cursor: 'pointer',
            textTransform: 'uppercase',
          }}
        >
          ▶ ACTIVATE
        </button>
        {actionMsg && (
          <div style={{ color: '#22c55e', fontSize: '12px', marginLeft: '8px' }}>{actionMsg}</div>
        )}
      </div>
    </div>
  )
}
