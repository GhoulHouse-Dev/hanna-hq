import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  AlertCircle,
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Home,
  LogOut,
  PhoneCall,
  Play,
  Settings,
  Square,
  TimerReset,
  X,
} from 'lucide-react'
import {
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom'
import { supabase, supabaseConfigured } from './lib/supabase'
import {
  endShift,
  getAdminTasks,
  getOpportunities,
  getProject,
  getProjects,
  getShifts,
  getWeeklyMetrics,
  logActivity,
  startShift,
  updateAdminTask,
  updateOpportunity,
  updateWeeklyMetric,
} from './lib/queries'
import type { AdminTask, Opportunity, Project, Shift, WeeklyMetric } from './lib/types'
import { formatDate, formatDateTime, formatHours, greeting, isOverdue, isToday, localDateKey } from './lib/format'

const activeProjectStatuses = ['Onboarding', 'Active', 'Waiting client', 'QA', 'On hold']
const openAdminStatuses = ['Tarkista', 'Kesken', 'Odottaa']

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function Loading() {
  return <div className="state-card">Ladataan…</div>
}

function Empty({ children }: { children: string }) {
  return <div className="state-card muted">{children}</div>
}

function ErrorBox({ error }: { error: string }) {
  return (
    <div className="state-card error-state">
      <AlertCircle size={18} />
      <span>{error}</span>
    </div>
  )
}

function Badge({ children, tone = 'neutral' }: { children: string; tone?: 'neutral' | 'warm' | 'good' | 'danger' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

function stageTone(stage?: string | null): 'neutral' | 'warm' | 'good' | 'danger' {
  if (!stage) return 'neutral'
  if (['Won', 'Active', 'Valmis', 'On track'].includes(stage)) return 'good'
  if (['Lost', 'Blocked'].includes(stage)) return 'danger'
  if (['Offer', 'Payment pending', 'QA', 'At risk', 'Waiting client'].includes(stage)) return 'warm'
  return 'neutral'
}

function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </header>
  )
}

function ProtectedLayout({ session }: { session: Session }) {
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
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">GH</div>
          <div>
            <strong>Hanna HQ</strong>
            <span>GhoulHouse Oy</span>
          </div>
        </div>
        <nav className="side-nav">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => classNames('nav-item', isActive && 'active')}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="signed-in-as">{session.user.email}</div>
          <button className="ghost-button full" onClick={signOut}><LogOut size={17} /> Kirjaudu ulos</button>
        </div>
      </aside>

      <div className="mobile-topbar">
        <div className="brand-block compact">
          <div className="brand-mark">GH</div>
          <strong>Hanna HQ</strong>
        </div>
        <div className="mobile-links">
          <NavLink to="/week">Viikko</NavLink>
          <NavLink to="/settings"><Settings size={18} /></NavLink>
        </div>
      </div>

      <main className="main-content"><Outlet /></main>

      <nav className="bottom-nav">
        {nav.slice(0, 5).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => classNames('bottom-item', isActive && 'active')}>
            <Icon size={19} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/today')
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('Tunnus luotu. Jos sähköpostivahvistus on käytössä, vahvista osoite ennen kirjautumista.')
        setMode('login')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kirjautuminen epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  if (!supabaseConfigured) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="brand-mark large">GH</div>
          <h1>Hanna HQ</h1>
          <p>Supabase-yhteys puuttuu. Lisää ympäristömuuttujat <code>VITE_SUPABASE_URL</code> ja <code>VITE_SUPABASE_ANON_KEY</code>.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark large">GH</div>
        <div>
          <h1>Hanna HQ</h1>
          <p>GhoulHouse Oy:n sisäinen työtila</p>
        </div>
        <label>Sähköposti<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label>Salasana<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {message ? <div className="inline-message">{message}</div> : null}
        <button className="primary-button" disabled={busy}>{busy ? 'Hetki…' : mode === 'login' ? 'Kirjaudu sisään' : 'Luo tunnus'}</button>
        <button type="button" className="text-button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Luo ensimmäinen käyttäjä' : 'Takaisin kirjautumiseen'}
        </button>
      </form>
    </div>
  )
}

function ResultDialog({ opportunity, onClose, onSaved }: { opportunity: Opportunity; onClose: () => void; onSaved: (value: Opportunity) => void }) {
  const [outcome, setOutcome] = useState('Keskustelu')
  const [notes, setNotes] = useState('')
  const [nextAction, setNextAction] = useState(opportunity.next_action ?? '')
  const [nextDate, setNextDate] = useState(opportunity.next_action_at?.slice(0, 10) ?? '')
  const [stage, setStage] = useState(opportunity.stage)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true)
    setError('')
    try {
      const updated = await updateOpportunity(opportunity.id, {
        stage,
        notes: notes || opportunity.notes,
        last_contacted_at: new Date().toISOString(),
        next_action: nextAction || null,
        next_action_at: nextDate ? `${nextDate}T09:00:00` : null,
      })
      await logActivity({
        entityType: 'opportunity',
        entityId: opportunity.id,
        actionType: 'follow_up',
        summary: outcome,
        metadata: { notes, nextAction, nextDate, stage },
      })
      onSaved(updated)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tallennus epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head"><div><span className="eyebrow">Kirjaa tulos</span><h2>{opportunity.company_name}</h2></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div>
        <label>Mitä tapahtui?<select value={outcome} onChange={(e) => setOutcome(e.target.value)}><option>Ei vastannut</option><option>Keskustelu</option><option>Päätös myöhemmin</option><option>Kiinnostunut</option><option>Ei kiinnostunut</option></select></label>
        <label>Muistiinpano<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <label>Uusi seuraava teko<input value={nextAction} onChange={(e) => setNextAction(e.target.value)} /></label>
        <div className="form-grid two"><label>Päivä<input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></label><label>Stage<input value={stage} onChange={(e) => setStage(e.target.value)} /></label></div>
        {error ? <ErrorBox error={error} /> : null}
        <div className="dialog-actions"><button className="ghost-button" onClick={onClose}>Peruuta</button><button className="primary-button" disabled={busy} onClick={save}>{busy ? 'Tallennetaan…' : 'Tallenna'}</button></div>
      </div>
    </div>
  )
}

function MoveDialog({ opportunity, onClose, onSaved }: { opportunity: Opportunity; onClose: () => void; onSaved: (value: Opportunity) => void }) {
  const [date, setDate] = useState(opportunity.next_action_at?.slice(0, 10) ?? localDateKey())
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      const updated = await updateOpportunity(opportunity.id, { next_action_at: `${date}T09:00:00` })
      onSaved(updated)
      onClose()
    } finally { setBusy(false) }
  }
  return (
    <div className="dialog-backdrop" onMouseDown={onClose}><div className="dialog small" onMouseDown={(e) => e.stopPropagation()}><div className="dialog-head"><h2>Siirrä tehtävä</h2><button className="icon-button" onClick={onClose}><X size={20} /></button></div><label>Uusi päivä<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><div className="dialog-actions"><button className="ghost-button" onClick={onClose}>Peruuta</button><button className="primary-button" disabled={busy} onClick={save}>Siirrä</button></div></div></div>
  )
}

function OpportunityCard({ item, onChange, compact = false }: { item: Opportunity; onChange: (item: Opportunity) => void; compact?: boolean }) {
  const [dialog, setDialog] = useState<'result' | 'move' | null>(null)
  return (
    <>
      <article className={classNames('work-card', compact && 'compact-card')}>
        <div className="card-top"><div><h3>{item.company_name}</h3><div className="badges"><Badge tone={stageTone(item.stage)}>{item.stage}</Badge>{item.priority ? <Badge>{item.priority}</Badge> : null}</div></div>{item.next_action_at ? <span className={classNames('date-label', isOverdue(item.next_action_at) && 'overdue')}>{formatDate(item.next_action_at)}</span> : null}</div>
        <div className="next-action"><span>Seuraava teko</span><strong>{item.next_action || 'Ei määritelty'}</strong></div>
        {!compact ? <div className="card-meta"><span>Viimeksi kontaktoitu {formatDateTime(item.last_contacted_at)}</span></div> : null}
        <div className="card-actions"><button className="primary-button small" onClick={() => setDialog('result')}>Kirjaa tulos</button><button className="ghost-button small" onClick={() => setDialog('move')}>Siirrä</button></div>
      </article>
      {dialog === 'result' ? <ResultDialog opportunity={item} onClose={() => setDialog(null)} onSaved={onChange} /> : null}
      {dialog === 'move' ? <MoveDialog opportunity={item} onClose={() => setDialog(null)} onSaved={onChange} /> : null}
    </>
  )
}

function TodayPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const [ops, pros, shiftRows] = await Promise.all([getOpportunities(), getProjects(), getShifts()])
      setOpportunities(ops); setProjects(pros); setShifts(shiftRows)
    } catch (err) { setError(err instanceof Error ? err.message : 'Tietojen lataus epäonnistui') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const activeOps = opportunities.filter((item) => !['Won', 'Lost'].includes(item.stage))
  const today = activeOps.filter((item) => isToday(item.next_action_at))
  const overdue = activeOps.filter((item) => isOverdue(item.next_action_at))
  const waiting = projects.filter((project) => project.status === 'Waiting client')
  const next = [...overdue, ...today].sort((a, b) => (a.priority ?? 'P9').localeCompare(b.priority ?? 'P9'))[0]
  const currentShift = shifts.find((shift) => shift.date === localDateKey())

  function replaceOpportunity(updated: Opportunity) {
    setOpportunities((rows) => rows.map((row) => row.id === updated.id ? updated : row))
  }

  return (
    <div className="page">
      <PageHeader title={`${greeting()} Hanna`} description={new Intl.DateTimeFormat('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())} />
      {error ? <ErrorBox error={error} /> : null}
      {loading ? <Loading /> : <>
        <section className="summary-strip">
          <div><span>Tänään</span><strong>{today.length}</strong></div>
          <div><span>Myöhässä</span><strong>{overdue.length}</strong></div>
          <div><span>Odottaa asiakasta</span><strong>{waiting.length}</strong></div>
          <div><span>Työvuoro</span><strong>{currentShift?.status ?? 'Ei aloitettu'}</strong></div>
        </section>

        <section className="section-block">
          <div className="section-heading"><div><span className="eyebrow">Seuraavaksi</span><h2>{next ? next.company_name : 'Ei kiireellisiä tehtäviä'}</h2></div>{next ? <Badge tone={isOverdue(next.next_action_at) ? 'danger' : 'warm'}>{isOverdue(next.next_action_at) ? 'Myöhässä' : 'Tänään'}</Badge> : <CheckCircle2 size={22} />}</div>
          {next ? <OpportunityCard item={next} onChange={replaceOpportunity} compact /> : <Empty>Kun seuraava toimenpide tulee ajankohtaiseksi, se näkyy tässä.</Empty>}
        </section>

        <section className="section-block">
          <div className="section-heading"><div><span className="eyebrow">Tänään</span><h2>Päivän tehtävät</h2></div><span className="count-pill">{today.length}</span></div>
          <div className="card-list">{today.length ? today.map((item) => <OpportunityCard key={item.id} item={item} onChange={replaceOpportunity} />) : <Empty>Ei tälle päivälle ajoitettuja follow-upeja.</Empty>}</div>
        </section>
      </>}
    </div>
  )
}

function FollowUpsPage() {
  const [rows, setRows] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { getOpportunities().then(setRows).catch((err: Error) => setError(err.message)).finally(() => setLoading(false)) }, [])
  const active = rows.filter((row) => !['Won', 'Lost'].includes(row.stage))
  const groups = [
    { title: 'Myöhässä', rows: active.filter((row) => isOverdue(row.next_action_at)) },
    { title: 'Tänään', rows: active.filter((row) => isToday(row.next_action_at)) },
    { title: 'Myöhemmin', rows: active.filter((row) => row.next_action_at && !isToday(row.next_action_at) && !isOverdue(row.next_action_at)) },
  ]
  function replace(updated: Opportunity) { setRows((current) => current.map((row) => row.id === updated.id ? updated : row)) }
  return <div className="page"><PageHeader title="Follow-upit" description="Avoimet toimenpiteet oikeassa järjestyksessä." />{error ? <ErrorBox error={error} /> : null}{loading ? <Loading /> : groups.map((group) => <section className="section-block" key={group.title}><div className="section-heading"><h2>{group.title}</h2><span className="count-pill">{group.rows.length}</span></div><div className="card-list">{group.rows.length ? group.rows.map((row) => <OpportunityCard key={row.id} item={row} onChange={replace} />) : <Empty>Ei rivejä tässä ryhmässä.</Empty>}</div></section>)}</div>
}

function ClientsPage() {
  const [rows, setRows] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  useEffect(() => { getProjects().then(setRows).catch((err: Error) => setError(err.message)).finally(() => setLoading(false)) }, [])
  const active = rows.filter((row) => activeProjectStatuses.includes(row.status))
  return <div className="page"><PageHeader title="Aktiiviset asiakkaat" description="Toimitukset onboardingista raportointiin." />{error ? <ErrorBox error={error} /> : null}{loading ? <Loading /> : <div className="client-grid">{active.length ? active.map((project) => <button key={project.id} className="client-card" onClick={() => navigate(`/clients/${project.id}`)}><div className="card-top"><div><h3>{project.company_name}</h3><div className="badges"><Badge tone={stageTone(project.status)}>{project.status}</Badge>{project.health ? <Badge tone={stageTone(project.health)}>{project.health}</Badge> : null}</div></div><ChevronRight size={20} /></div><div className="client-row"><span>Deadline</span><strong>{formatDate(project.due_date)}</strong></div><div className="client-row"><span>Materiaalit</span><strong>{project.material_status ?? '—'}</strong></div><div className="next-action"><span>Seuraava teko</span><strong>{project.next_action ?? 'Ei määritelty'}</strong></div></button>) : <Empty>Ei aktiivisia asiakasprojekteja.</Empty>}</div>}</div>
}

function ClientDetailPage() {
  const { id = '' } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { getProject(id).then(setProject).catch((err: Error) => setError(err.message)).finally(() => setLoading(false)) }, [id])
  if (loading) return <div className="page"><Loading /></div>
  if (error || !project) return <div className="page"><ErrorBox error={error || 'Projektia ei löytynyt'} /></div>
  const pipeline = ['Myynti', 'Maksu', 'Onboarding', 'Materiaalit', 'Tuotanto', 'Hyväksyntä', 'Julkaisu', 'Raportti', 'Seuraava jakso']
  return <div className="page"><PageHeader title={project.company_name} description="Asiakkaan toimitustilanne" /><div className="detail-grid"><section className="section-block"><div className="badges"><Badge tone={stageTone(project.status)}>{project.status}</Badge>{project.health ? <Badge tone={stageTone(project.health)}>{project.health}</Badge> : null}</div><dl className="detail-list"><div><dt>Deadline</dt><dd>{formatDate(project.due_date)}</dd></div><div><dt>Materiaalit</dt><dd>{project.material_status ?? '—'}</dd></div><div><dt>Seuraava teko</dt><dd>{project.next_action ?? 'Ei määritelty'}</dd></div><div><dt>Huomiot</dt><dd>{project.notes ?? '—'}</dd></div></dl></section><section className="section-block"><span className="eyebrow">Toimituspolku</span><div className="pipeline">{pipeline.map((step, index) => <div className="pipeline-step" key={step}><span>{index + 1}</span><strong>{step}</strong></div>)}</div></section></div></div>
}

function AdminPage() {
  const [rows, setRows] = useState<AdminTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { getAdminTasks().then(setRows).catch((err: Error) => setError(err.message)).finally(() => setLoading(false)) }, [])
  const open = rows.filter((row) => openAdminStatuses.includes(row.status))
  async function changeStatus(row: AdminTask, status: string) {
    try {
      const updated = await updateAdminTask(row.id, { status })
      setRows((current) => current.map((item) => item.id === row.id ? updated : item))
      await logActivity({ entityType: 'admin_task', entityId: row.id, actionType: 'status_change', summary: `${row.status} → ${status}` })
    } catch (err) { setError(err instanceof Error ? err.message : 'Tallennus epäonnistui') }
  }
  return <div className="page"><PageHeader title="Hallinnon avoimet" description="Näytä vain asiat, joihin pitää vielä palata." />{error ? <ErrorBox error={error} /> : null}{loading ? <Loading /> : <div className="card-list">{open.length ? open.map((row) => <article className="admin-card" key={row.id}><div className="card-top"><div><h3>{row.title}</h3><div className="badges"><Badge tone="warm">{row.status}</Badge>{row.owner_text ? <Badge>{row.owner_text}</Badge> : null}</div></div><span className={classNames('date-label', isOverdue(row.target_date) && 'overdue')}>{formatDate(row.target_date)}</span></div><div className="next-action"><span>Seuraava teko</span><strong>{row.next_action ?? 'Ei määritelty'}</strong></div><div className="admin-actions"><select value={row.status} onChange={(e) => void changeStatus(row, e.target.value)}><option>Tarkista</option><option>Kesken</option><option>Odottaa</option><option>Valmis</option><option>Ei tarvetta</option></select><span>Varmennettu {formatDate(row.last_verified_at)}</span></div></article>) : <Empty>Kaikki hallinnon tehtävät ovat käsitelty.</Empty>}</div>}</div>
}

function ShiftsPage() {
  const [rows, setRows] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [planned, setPlanned] = useState(3)
  const [focus, setFocus] = useState('')
  const [breakMinutes, setBreakMinutes] = useState(0)
  useEffect(() => { getShifts().then(setRows).catch((err: Error) => setError(err.message)).finally(() => setLoading(false)) }, [])
  const todayShift = rows.find((row) => row.date === localDateKey())
  async function start() {
    setBusy(true); setError('')
    try { const shift = await startShift(planned, focus); setRows((current) => [shift, ...current.filter((row) => row.id !== shift.id)]) }
    catch (err) { setError(err instanceof Error ? err.message : 'Työvuoron aloitus epäonnistui') }
    finally { setBusy(false) }
  }
  async function stop() {
    if (!todayShift) return
    setBusy(true); setError('')
    try { const shift = await endShift(todayShift, breakMinutes); setRows((current) => current.map((row) => row.id === shift.id ? shift : row)); await logActivity({ entityType: 'shift', entityId: shift.id, actionType: 'shift_ended', summary: `Työvuoro päättyi: ${formatHours(shift.actual_hours)}` }) }
    catch (err) { setError(err instanceof Error ? err.message : 'Työvuoron lopetus epäonnistui') }
    finally { setBusy(false) }
  }
  return <div className="page"><PageHeader title="Työvuorot" description="Aloita, lopeta ja seuraa toteutuneita tunteja." />{error ? <ErrorBox error={error} /> : null}{loading ? <Loading /> : <><section className="shift-hero"><div><span className="eyebrow">Tänään</span><h2>{todayShift?.status ?? 'Ei aloitettu'}</h2><p>{todayShift?.started_at ? `Aloitettu ${formatDateTime(todayShift.started_at)}` : 'Kun aloitat vuoron, aika alkaa tästä.'}</p></div>{todayShift?.status === 'Käynnissä' ? <button className="danger-button" disabled={busy} onClick={stop}><Square size={17} /> Lopeta työvuoro</button> : <button className="primary-button" disabled={busy} onClick={start}><Play size={17} /> Aloita työvuoro</button>}</section><section className="section-block"><div className="form-grid three"><label>Suunnitellut tunnit<input type="number" min="0" step="0.25" value={planned} onChange={(e) => setPlanned(Number(e.target.value))} /></label><label>Tauko min<input type="number" min="0" value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))} /></label><label>Päivän fokus<input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Esim. Portsa + follow-upit" /></label></div></section><section className="section-block"><div className="section-heading"><h2>Historia</h2><span className="count-pill">{rows.length}</span></div><div className="table-wrap"><table><thead><tr><th>Päivä</th><th>Tila</th><th>Suunniteltu</th><th>Toteutunut</th><th>Fokus</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{formatDate(row.date)}</td><td><Badge tone={stageTone(row.status)}>{row.status}</Badge></td><td>{formatHours(row.planned_hours)}</td><td>{formatHours(row.actual_hours)}</td><td>{row.focus ?? '—'}</td></tr>)}</tbody></table></div></section></>}</div>
}

function WeekPage() {
  const [rows, setRows] = useState<WeeklyMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { getWeeklyMetrics().then(setRows).catch((err: Error) => setError(err.message)).finally(() => setLoading(false)) }, [])
  const current = rows[0]
  const numericFields: Array<{ key: keyof WeeklyMetric; label: string }> = [
    { key: 'planned_hours', label: 'Suunnitellut h' }, { key: 'actual_hours', label: 'Toteutuneet h' }, { key: 'contacts', label: 'Kontaktit' }, { key: 'conversations', label: 'Keskustelut' }, { key: 'offers', label: 'Tarjoukset' }, { key: 'paid_customers', label: 'Maksaneet' }, { key: 'active_customers', label: 'Aktiiviset asiakkaat' },
  ]
  async function change(field: keyof WeeklyMetric, raw: string) {
    if (!current) return
    const value = raw === '' ? null : Number(raw)
    try { const updated = await updateWeeklyMetric(current.id, { [field]: value } as Partial<WeeklyMetric>); setRows((all) => all.map((row) => row.id === updated.id ? updated : row)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Tallennus epäonnistui') }
  }
  return <div className="page"><PageHeader title="Viikon numerot" description="Kevyt operatiivinen yhteenveto — toteuma, ei arvauksia." />{error ? <ErrorBox error={error} /> : null}{loading ? <Loading /> : current ? <><section className="week-summary"><div><span>Viikko</span><strong>{current.week_key}</strong></div><div><span>Työtä</span><strong>{formatHours(current.actual_hours)}</strong></div><div><span>Kontaktit</span><strong>{current.contacts ?? 0}</strong></div><div><span>Tarjoukset</span><strong>{current.offers ?? 0}</strong></div><div><span>Maksaneet</span><strong>{current.paid_customers ?? 0}</strong></div></section><section className="section-block"><div className="form-grid metrics">{numericFields.map((field) => <label key={String(field.key)}>{field.label}<input type="number" min="0" step={field.key.includes('hours') ? '0.25' : '1'} value={(current[field.key] as number | null) ?? ''} onChange={(e) => void change(field.key, e.target.value)} /></label>)}</div><div className="detail-list text-fields"><div><dt>Top 3 ensi viikolle</dt><dd>{current.top3_next_week || 'Ei kirjattu'}</dd></div><div><dt>Huomiot</dt><dd>{current.notes || 'Ei kirjattu'}</dd></div></div></section></> : <Empty>Viikkoriviä ei löytynyt.</Empty>}</div>
}

function SettingsPage() {
  return <div className="page"><PageHeader title="Asetukset" description="Sisäisen työtilan integraatiot ja käyttö." /><section className="section-block"><span className="eyebrow">Integrations</span><div className="integration-row"><div><strong>Notion</strong><p>CRM-synkronointi voidaan kytkeä myöhemmin.</p></div><Badge>Not connected</Badge></div><div className="integration-row"><div><strong>Supabase</strong><p>Autentikointi ja Hanna HQ:n operatiivinen data.</p></div><Badge tone={supabaseConfigured ? 'good' : 'danger'}>{supabaseConfigured ? 'Connected' : 'Missing config'}</Badge></div></section></div>
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (!supabaseConfigured) { setSession(null); return }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  const protectedElement = useMemo(() => session ? <ProtectedLayout session={session} /> : <Navigate to="/login" replace />, [session])

  if (session === undefined) return <div className="login-shell"><Loading /></div>

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/today" replace /> : <Login />} />
      <Route element={protectedElement}>
        <Route path="/today" element={<TodayPage />} />
        <Route path="/follow-ups" element={<FollowUpsPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/:id" element={<ClientDetailPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/shifts" element={<ShiftsPage />} />
        <Route path="/week" element={<WeekPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to={session ? '/today' : '/login'} replace />} />
    </Routes>
  )
}
