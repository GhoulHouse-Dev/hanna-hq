import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FolderOpen,
  Home,
  LogOut,
  PhoneCall,
  Play,
  Settings,
  Square,
  TimerReset,
} from 'lucide-react'
import { Link, Navigate, NavLink, useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from './lib/supabase'
import { endShift, getShifts, logActivity, startShift } from './lib/queries'
import type { Shift } from './lib/types'
import { formatDate, formatDateTime, formatHours, localDateKey } from './lib/format'
import './task-first.css'
import './shift-planner.css'

type Priority = 'P0' | 'P1' | 'P2' | 'P3'

type QueueRow = {
  id: string
  source: 'opportunity' | 'project' | 'admin'
  source_label: string
  title: string
  state: string
  priority: Priority
  work_date: string | null
  instruction: string | null
  action_label: string | null
  action_url: string | null
  materials_url: string | null
  details_url: string | null
  blocked_reason: string | null
  priority_rank: number
  urgency_rank: number
}

type PlanDay = {
  date: string
  hours: number
  focus: string
}

const MIN_TWO_WEEK_HOURS = 15
const priorityCopy: Record<Priority, { title: string; description: string }> = {
  P0: { title: 'Tee ensin', description: 'Kriittinen tai muuta työtä estävä.' },
  P1: { title: 'Seuraava tärkeä', description: 'Hoida heti P0-tehtävien jälkeen.' },
  P2: { title: 'Suunniteltu', description: 'Tärkeä, mutta ei vielä kiireellinen.' },
  P3: { title: 'Myöhemmin', description: 'Pidä näkyvissä, ei vie tämän päivän fokusta.' },
}

function keyFromDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0)
}

function addDays(value: string, days: number) {
  const date = dateFromKey(value)
  date.setDate(date.getDate() + days)
  return keyFromDate(date)
}

function nextMonday() {
  const date = new Date()
  const day = date.getDay()
  const delta = day === 1 ? 7 : (8 - day) % 7
  date.setDate(date.getDate() + (delta || 7))
  return keyFromDate(date)
}

function weekday(value: string) {
  return new Intl.DateTimeFormat('fi-FI', { weekday: 'short' }).format(dateFromKey(value)).replace('.', '')
}

function buildPlanDays(start: string, shifts: Shift[]) {
  return Array.from({ length: 14 }, (_, index) => {
    const date = addDays(start, index)
    const existing = shifts.find((shift) => shift.date === date && shift.status === 'Suunniteltu')
    return {
      date,
      hours: Number(existing?.planned_hours ?? 0),
      focus: existing?.focus ?? '',
    }
  })
}

function SmartLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  if (href.startsWith('/')) return <Link to={href} className={className}>{children}</Link>
  const web = /^https?:/i.test(href)
  return <a href={href} className={className} target={web ? '_blank' : undefined} rel={web ? 'noreferrer' : undefined}>{children}</a>
}

function Shell({ session, children }: { session: Session; children: React.ReactNode }) {
  const navigate = useNavigate()
  const nav = [
    { to: '/today', label: 'Tänään', icon: Home },
    { to: '/follow-ups', label: 'Follow-upit', icon: PhoneCall },
    { to: '/clients', label: 'Asiakkaat', icon: BriefcaseBusiness },
    { to: '/admin', label: 'Hallinto', icon: ClipboardCheck },
    { to: '/shifts', label: 'Työvuorot', icon: TimerReset },
    { to: '/week', label: 'Viikko', icon: BarChart3 },
    { to: '/settings', label: 'Asetukset', icon: Settings },
  ]

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="tf-shell">
      <aside className="tf-sidebar">
        <div className="tf-brand"><span>GH</span><div><strong>Hanna HQ</strong><small>GhoulHouse Oy</small></div></div>
        <nav>{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
        <div className="tf-sidebar-foot"><small>{session.user.email}</small><button onClick={signOut}><LogOut size={16} /> Kirjaudu ulos</button></div>
      </aside>
      <div className="tf-mobile-head"><div className="tf-brand compact"><span>GH</span><strong>Hanna HQ</strong></div><NavLink to="/settings"><Settings size={19} /></NavLink></div>
      <main className="tf-main">{children}</main>
      <nav className="tf-bottom-nav">{nav.slice(0, 5).map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={19} /><span>{label}</span></NavLink>)}</nav>
    </div>
  )
}

function Planner({ session }: { session: Session }) {
  const [role, setRole] = useState<string | null>(null)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [periodStart, setPeriodStart] = useState(nextMonday())
  const [plan, setPlan] = useState<PlanDay[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [todayHours, setTodayHours] = useState(3)
  const [todayFocus, setTodayFocus] = useState('')
  const [breakMinutes, setBreakMinutes] = useState(0)

  async function load() {
    setLoading(true)
    setError('')
    const [roleResult, shiftResult, queueResult] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle(),
      getShifts(),
      supabase.from('hanna_work_queue').select('*').order('priority_rank').order('urgency_rank').order('work_date', { ascending: true, nullsFirst: false }),
    ])

    if (roleResult.error) throw new Error(roleResult.error.message)
    if (queueResult.error) throw new Error(queueResult.error.message)

    const ownShifts = shiftResult.filter((row) => row.user_id === session.user.id)
    setRole(roleResult.data?.role ?? null)
    setShifts(ownShifts)
    setQueue((queueResult.data ?? []) as QueueRow[])
    const today = ownShifts.find((row) => row.date === localDateKey())
    if (today?.planned_hours) setTodayHours(Number(today.planned_hours))
    if (today?.focus) setTodayFocus(today.focus)
    setLoading(false)
  }

  useEffect(() => {
    void load().catch((err: Error) => { setError(err.message); setLoading(false) })
  }, [session.user.id])

  useEffect(() => {
    setPlan(buildPlanDays(periodStart, shifts))
  }, [periodStart, shifts])

  const periodEnd = addDays(periodStart, 13)
  const totalHours = useMemo(() => plan.reduce((sum, row) => sum + (Number.isFinite(row.hours) ? row.hours : 0), 0), [plan])
  const planReady = totalHours >= MIN_TWO_WEEK_HOURS
  const todayShift = shifts.find((row) => row.date === localDateKey())
  const pastRows = shifts.filter((row) => row.date <= localDateKey()).slice(0, 12)

  const priorityGroups = useMemo(() => (['P0', 'P1', 'P2', 'P3'] as Priority[]).map((priority) => ({
    priority,
    rows: queue.filter((row) => row.priority === priority),
  })), [queue])

  function updateDay(index: number, patch: Partial<PlanDay>) {
    setPlan((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
    setMessage('')
  }

  async function savePlan() {
    if (!planReady) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { error: rpcError } = await supabase.rpc('save_two_week_shift_plan', {
        _period_start: periodStart,
        _entries: plan.map((row) => ({ date: row.date, planned_hours: row.hours, focus: row.focus })),
      })
      if (rpcError) throw new Error(rpcError.message)
      const refreshed = (await getShifts()).filter((row) => row.user_id === session.user.id)
      setShifts(refreshed)
      setMessage(`Työvuorot tallennettu: ${totalHours.toFixed(2).replace('.00', '')} h / 2 viikkoa.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Työvuorosuunnitelman tallennus epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  async function startToday() {
    setBusy(true)
    setError('')
    try {
      const shift = await startShift(todayHours, todayFocus)
      setShifts((rows) => [shift, ...rows.filter((row) => row.id !== shift.id)])
      await logActivity({ entityType: 'shift', entityId: shift.id, actionType: 'shift_started', summary: `Työvuoro alkoi: ${todayHours} h suunniteltu` })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Työvuoron aloitus epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  async function stopToday() {
    if (!todayShift) return
    setBusy(true)
    setError('')
    try {
      const shift = await endShift(todayShift, breakMinutes)
      setShifts((rows) => rows.map((row) => row.id === shift.id ? shift : row))
      await logActivity({ entityType: 'shift', entityId: shift.id, actionType: 'shift_ended', summary: `Työvuoro päättyi: ${formatHours(shift.actual_hours)}` })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Työvuoron lopetus epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  if (role && role !== 'hanna') {
    return <div className="sp-page"><div className="sp-notice"><AlertTriangle size={20} /><div><strong>Työvuorosuunnittelu on Hanna-roolille.</strong><p>Jami valmistelee tehtävät, Hanna suunnittelee ja tekee työvuorot.</p></div></div></div>
  }

  return (
    <div className="sp-page">
      <header className="sp-header">
        <div><span className="sp-kicker">TYÖVUOROT + PRIORITEETIT</span><h1>Suunnittele seuraavat 2 viikkoa</h1><p>Vähintään 15 tuntia ennakkoon. Tehtävälista näkyy vieressä prioriteettijärjestyksessä.</p></div>
        <div className={`sp-hours-card ${planReady ? 'ready' : ''}`}><span>Suunniteltu</span><strong>{totalHours.toFixed(2).replace('.00', '')} / 15 h</strong><small>{planReady ? 'Minimi täynnä' : `${Math.max(0, MIN_TWO_WEEK_HOURS - totalHours).toFixed(2).replace('.00', '')} h puuttuu`}</small></div>
      </header>

      {error ? <div className="sp-alert error"><AlertTriangle size={18} /> {error}</div> : null}
      {message ? <div className="sp-alert success"><CheckCircle2 size={18} /> {message}</div> : null}
      {loading ? <div className="sp-loading">Ladataan työvuoroja…</div> : (
        <>
          <section className="sp-today">
            <div><span className="sp-kicker">TÄNÄÄN</span><h2>{todayShift?.status ?? 'Ei aloitettu'}</h2><p>{todayShift?.started_at ? `Aloitettu ${formatDateTime(todayShift.started_at)}` : 'Aloita vuoro tästä, kun työpäivä alkaa.'}</p></div>
            <div className="sp-today-fields"><label>Tunnit<input type="number" min="0.25" step="0.25" value={todayHours} onChange={(e) => setTodayHours(Number(e.target.value))} /></label><label>Fokus<input value={todayFocus} onChange={(e) => setTodayFocus(e.target.value)} placeholder="Esim. Portsa + P0 follow-upit" /></label>{todayShift?.status === 'Käynnissä' ? <label>Tauko min<input type="number" min="0" value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))} /></label> : null}</div>
            {todayShift?.status === 'Käynnissä' ? <button className="sp-stop" disabled={busy} onClick={stopToday}><Square size={17} /> Lopeta työvuoro</button> : <button className="sp-start" disabled={busy} onClick={startToday}><Play size={17} /> Aloita työvuoro</button>}
          </section>

          <div className="sp-layout">
            <section className="sp-plan-panel">
              <div className="sp-panel-head"><div><span className="sp-kicker">2 VIIKON SUUNNITELMA</span><h2>{formatDate(periodStart)} – {formatDate(periodEnd)}</h2></div><label>Jakso alkaa<input type="date" min={addDays(localDateKey(), 1)} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></label></div>
              <div className="sp-progress"><div style={{ width: `${Math.min(100, (totalHours / MIN_TWO_WEEK_HOURS) * 100)}%` }} /></div>
              <div className="sp-days">
                {plan.map((day, index) => (
                  <div className={`sp-day ${day.hours > 0 ? 'selected' : ''}`} key={day.date}>
                    <div className="sp-day-date"><strong>{weekday(day.date)}</strong><span>{formatDate(day.date)}</span></div>
                    <label>Tunnit<input aria-label={`${formatDate(day.date)} tunnit`} type="number" min="0" max="12" step="0.25" value={day.hours || ''} onChange={(e) => updateDay(index, { hours: e.target.value === '' ? 0 : Number(e.target.value) })} /></label>
                    <label>Fokus<input aria-label={`${formatDate(day.date)} fokus`} value={day.focus} onChange={(e) => updateDay(index, { focus: e.target.value })} placeholder={day.hours > 0 ? 'Mitä tehdään?' : '—'} /></label>
                  </div>
                ))}
              </div>
              <div className="sp-save-row"><div><strong>{totalHours.toFixed(2).replace('.00', '')} h suunniteltu</strong><span>Vähimmäisvaatimus on 15 h / 14 päivää.</span></div><button disabled={!planReady || busy} onClick={savePlan}>{busy ? 'Tallennetaan…' : 'Tallenna 2 viikon työvuorot'}</button></div>
            </section>

            <aside className="sp-task-panel">
              <div className="sp-panel-head"><div><span className="sp-kicker">TEHTÄVÄLISTA</span><h2>Prioriteetit</h2></div><Link to="/today" className="sp-text-link">Avaa Tänään →</Link></div>
              <div className="sp-priority-guide">{(['P0', 'P1', 'P2', 'P3'] as Priority[]).map((priority) => <div key={priority}><span className={`sp-priority sp-${priority.toLowerCase()}`}>{priority}</span><div><strong>{priorityCopy[priority].title}</strong><small>{priorityCopy[priority].description}</small></div></div>)}</div>
              <div className="sp-task-groups">
                {priorityGroups.map(({ priority, rows }) => (
                  <section key={priority} className="sp-task-group">
                    <div className="sp-task-group-head"><span className={`sp-priority sp-${priority.toLowerCase()}`}>{priority}</span><strong>{priorityCopy[priority].title}</strong><span>{rows.length}</span></div>
                    {rows.length ? rows.map((row) => (
                      <article className="sp-task" key={`${row.source}-${row.id}`}>
                        <div className="sp-task-meta"><span>{row.source_label}</span><span>{row.work_date ? formatDate(row.work_date) : 'Ei päivää'}</span></div>
                        <h3>{row.title}</h3>
                        <p>{row.instruction || 'Tehtävän työohje puuttuu.'}</p>
                        {row.blocked_reason ? <div className="sp-blocked"><AlertTriangle size={14} /> {row.blocked_reason}</div> : null}
                        <div className="sp-task-links">{row.action_url ? <SmartLink href={row.action_url}><ExternalLink size={14} /> {row.action_label || 'Avaa'}</SmartLink> : null}{row.materials_url ? <SmartLink href={row.materials_url}><FolderOpen size={14} /> Materiaalit</SmartLink> : null}</div>
                      </article>
                    )) : <div className="sp-empty">Ei {priority}-tehtäviä.</div>}
                  </section>
                ))}
              </div>
            </aside>
          </div>

          <section className="sp-history">
            <div className="sp-panel-head"><div><span className="sp-kicker">TOTEUMA</span><h2>Viimeisimmät työvuorot</h2></div></div>
            <div className="sp-history-grid">{pastRows.length ? pastRows.map((row) => <div key={row.id}><span>{formatDate(row.date)}</span><strong>{row.status}</strong><small>{formatHours(row.planned_hours)} suunniteltu · {formatHours(row.actual_hours)} toteutunut</small><p>{row.focus || 'Ei fokusta kirjattu'}</p></div>) : <div className="sp-empty">Ei aiempia työvuoroja.</div>}</div>
          </section>
        </>
      )}
    </div>
  )
}

export default function ShiftPlannerPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (!supabaseConfigured) { setSession(null); return }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="sp-loading-screen">Ladataan Hanna HQ:ta…</div>
  if (!session) return <Navigate to="/login" replace />
  return <Shell session={session}><Planner session={session} /></Shell>
}
