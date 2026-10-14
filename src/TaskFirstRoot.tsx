import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Home,
  Link2Off,
  LogOut,
  PhoneCall,
  Settings,
  TimerReset,
} from 'lucide-react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import App from './App'
import { supabase, supabaseConfigured } from './lib/supabase'
import { formatDate, isOverdue, isToday } from './lib/format'
import './task-first.css'

type Priority = 'P0' | 'P1' | 'P2' | 'P3'
type Source = 'opportunity' | 'project' | 'admin'

interface WorkQueueRow {
  id: string
  source: Source
  source_label: string
  title: string
  state: string
  priority: string | null
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

interface WorkItem {
  id: string
  source: Source
  title: string
  sourceLabel: string
  state: string
  priority: Priority
  date: string | null
  instruction: string
  actionLabel: string
  actionUrl: string
  directActionMissing: boolean
  materialsUrl: string | null
  detailsUrl: string
  blockedReason: string | null
}

const priorityRank: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }

function normalizePriority(value?: string | null, fallback: Priority = 'P2'): Priority {
  return value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3' ? value : fallback
}

function urgencyRank(date: string | null) {
  if (!date) return 3
  if (isOverdue(date)) return 0
  if (isToday(date)) return 1
  return 2
}

function compareItems(a: WorkItem, b: WorkItem) {
  const priority = priorityRank[a.priority] - priorityRank[b.priority]
  if (priority !== 0) return priority
  const urgency = urgencyRank(a.date) - urgencyRank(b.date)
  if (urgency !== 0) return urgency
  return (a.date ?? '9999-12-31').localeCompare(b.date ?? '9999-12-31') || a.title.localeCompare(b.title, 'fi')
}

function urgencyLabel(date: string | null) {
  if (!date) return 'Ei päivää'
  if (isOverdue(date)) return 'Myöhässä'
  if (isToday(date)) return 'Tänään'
  return formatDate(date)
}

function fallbackDetails(row: WorkQueueRow) {
  if (row.source === 'project') return `/clients/${row.id}`
  if (row.source === 'opportunity') return '/follow-ups'
  return '/admin'
}

function fallbackActionLabel(source: Source) {
  if (source === 'project') return 'Avaa projekti'
  if (source === 'opportunity') return 'Avaa follow-up'
  return 'Avaa hallintotehtävä'
}

function SmartLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  if (href.startsWith('/')) return <Link to={href} className={className}>{children}</Link>
  const isWeb = /^https?:/i.test(href)
  return <a href={href} className={className} target={isWeb ? '_blank' : undefined} rel={isWeb ? 'noreferrer' : undefined}>{children}</a>
}

function TaskCard({ item, hero = false }: { item: WorkItem; hero?: boolean }) {
  return (
    <article className={`tf-task-card ${hero ? 'tf-task-card-hero' : ''}`}>
      <div className="tf-task-head">
        <div className="tf-task-badges">
          <span className={`tf-priority tf-${item.priority.toLowerCase()}`}>{item.priority}</span>
          <span className={`tf-urgency ${isOverdue(item.date) ? 'is-overdue' : ''}`}>{urgencyLabel(item.date)}</span>
          <span className="tf-source">{item.sourceLabel}</span>
        </div>
        <span className="tf-state">{item.state}</span>
      </div>

      <h2>{item.title}</h2>
      <p className="tf-instruction">{item.instruction}</p>

      {item.blockedReason ? (
        <div className="tf-blocked"><AlertTriangle size={17} /><span><strong>Estynyt:</strong> {item.blockedReason}</span></div>
      ) : null}

      <div className="tf-task-actions">
        <SmartLink href={item.actionUrl} className="tf-primary-action">
          <span>{item.actionLabel}</span><ArrowUpRight size={18} />
        </SmartLink>
        {item.materialsUrl ? (
          <SmartLink href={item.materialsUrl} className="tf-secondary-action"><FolderOpen size={17} /> Materiaalit</SmartLink>
        ) : (
          <span className="tf-secondary-action tf-disabled"><Link2Off size={17} /> Materiaalit ei linkitetty</span>
        )}
        <SmartLink href={item.detailsUrl} className="tf-secondary-action"><FileText size={17} /> Lisätiedot</SmartLink>
      </div>

      {item.directActionMissing ? <p className="tf-missing-link">Suora työlinkki puuttuu vielä — pääpainike avaa nyt tehtävän kontekstin.</p> : null}
    </article>
  )
}

function TaskFirstShell({ session, children }: { session: Session; children: React.ReactNode }) {
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

function TaskFirstDashboard({ session }: { session: Session }) {
  const [items, setItems] = useState<WorkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')

      const { data, error: queueError } = await supabase
        .from('hanna_work_queue')
        .select('*')
        .order('priority_rank', { ascending: true })
        .order('urgency_rank', { ascending: true })
        .order('work_date', { ascending: true, nullsFirst: false })
        .order('title', { ascending: true })

      if (!active) return
      if (queueError) {
        setError(queueError.message)
        setLoading(false)
        return
      }

      const rows = (data ?? []) as WorkQueueRow[]
      const nextItems = rows.map<WorkItem>((row) => {
        const details = row.details_url || fallbackDetails(row)
        const action = row.action_url || details

        return {
          id: `${row.source}-${row.id}`,
          source: row.source,
          title: row.title,
          sourceLabel: row.source_label,
          state: row.state,
          priority: normalizePriority(row.priority, row.source === 'admin' ? 'P3' : 'P2'),
          date: row.work_date,
          instruction: row.instruction || 'Määritä seuraava konkreettinen teko ennen kuin jatkat.',
          actionLabel: row.action_label || fallbackActionLabel(row.source),
          actionUrl: action,
          directActionMissing: !row.action_url,
          materialsUrl: row.materials_url,
          detailsUrl: details,
          blockedReason: row.blocked_reason,
        }
      })

      setItems(nextItems)
      setLoading(false)
    }

    void load()
    return () => { active = false }
  }, [])

  const actionable = useMemo(() => items.filter((item) => !item.blockedReason).sort(compareItems), [items])
  const blocked = useMemo(() => items.filter((item) => Boolean(item.blockedReason)).sort(compareItems), [items])
  const first = actionable[0]
  const rest = actionable.slice(1, 9)
  const overdue = items.filter((item) => isOverdue(item.date)).length
  const today = items.filter((item) => isToday(item.date)).length

  return (
    <TaskFirstShell session={session}>
      <div className="tf-page">
        {error ? <div className="tf-error"><AlertTriangle size={18} /> {error}</div> : null}
        {loading ? <div className="tf-loading">Ladataan työjonoa…</div> : (
          <>
            <section className="tf-now">
              <div className="tf-section-title"><span>TEE NYT</span><p>Ensimmäinen tehtävä, josta työ alkaa.</p></div>
              {first ? <TaskCard item={first} hero /> : <div className="tf-empty">Ei suoritettavia tehtäviä juuri nyt.</div>}
            </section>

            {blocked.length ? (
              <section className="tf-section tf-blocked-section">
                <div className="tf-section-title"><span>ESTYNEET</span><p>Näistä näet heti, mikä puuttuu ennen kuin tehtävä voidaan tehdä.</p></div>
                <div className="tf-task-list">{blocked.slice(0, 4).map((item) => <TaskCard key={item.id} item={item} />)}</div>
              </section>
            ) : null}

            <section className="tf-section">
              <div className="tf-section-title"><span>SEURAAVAKSI</span><p>Automaattinen järjestys: prioriteetti → myöhässä → tänään → myöhemmin.</p></div>
              <div className="tf-task-list">{rest.length ? rest.map((item) => <TaskCard key={item.id} item={item} />) : <div className="tf-empty">Ei muita avoimia tehtäviä.</div>}</div>
            </section>

            <section className="tf-pulse" aria-label="Päivän tilanne">
              <div><span>Myöhässä</span><strong>{overdue}</strong></div>
              <div><span>Tänään</span><strong>{today}</strong></div>
              <div><span>Estynyt</span><strong>{blocked.length}</strong></div>
              <div><span>Avoinna</span><strong>{items.length}</strong></div>
            </section>
          </>
        )}
      </div>
    </TaskFirstShell>
  )
}

export default function TaskFirstRoot() {
  const location = useLocation()
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (!supabaseConfigured) {
      setSession(null)
      return
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  if (location.pathname !== '/today') return <App />
  if (session === undefined) return <div className="tf-loading-screen">Ladataan Hanna HQ:ta…</div>
  if (!session) return <App />
  return <TaskFirstDashboard session={session} />
}
