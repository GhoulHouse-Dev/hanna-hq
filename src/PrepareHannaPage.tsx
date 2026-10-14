import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  Home,
  LogOut,
  PhoneCall,
  Save,
  Send,
  Settings,
  TimerReset,
} from 'lucide-react'
import { Link, Navigate, NavLink, useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from './lib/supabase'
import './task-first.css'
import './prepare-hanna.css'

type Role = 'hanna' | 'jami'
type PrepSource = 'opportunity' | 'project' | 'admin_task'

type RawOpportunity = {
  id: string
  company_name: string
  stage: string
  priority: string | null
  next_action: string | null
  notes: string | null
  is_demo: boolean
  task_instruction: string | null
  action_label: string | null
  action_url: string | null
  materials_url: string | null
  details_url: string | null
  ready_for_hanna: boolean
}

type RawProject = {
  id: string
  company_name: string
  status: string
  priority: string | null
  next_action: string | null
  notes: string | null
  is_demo: boolean
  task_instruction: string | null
  action_label: string | null
  action_url: string | null
  materials_url: string | null
  details_url: string | null
  ready_for_hanna: boolean
}

type RawAdminTask = {
  id: string
  title: string
  status: string
  priority: string | null
  next_action: string | null
  notes: string | null
  task_instruction: string | null
  action_label: string | null
  action_url: string | null
  materials_url: string | null
  details_url: string | null
  ready_for_hanna: boolean
}

type PreparationItem = {
  id: string
  source: PrepSource
  sourceLabel: string
  title: string
  state: string
  priority: string
  context: string | null
  taskInstruction: string
  actionLabel: string
  actionUrl: string
  materialsUrl: string
  detailsUrl: string
}

const sourceTable: Record<PrepSource, 'opportunities' | 'projects' | 'admin_tasks'> = {
  opportunity: 'opportunities',
  project: 'projects',
  admin_task: 'admin_tasks',
}

function trim(value: string) {
  return value.trim()
}

function isTarget(value: string, allowContact = false) {
  const candidate = trim(value)
  if (!candidate) return false
  if (candidate.startsWith('/')) return true
  if (allowContact && /^(mailto:|tel:)/i.test(candidate)) return true
  return /^https?:\/\//i.test(candidate)
}

function missingFields(item: PreparationItem) {
  const missing: string[] = []
  if (!trim(item.taskInstruction)) missing.push('Tee tämä')
  if (!trim(item.actionLabel) || !isTarget(item.actionUrl, true)) missing.push('Avaa tästä')
  if (!isTarget(item.materialsUrl)) missing.push('Materiaalit tästä')
  if (!isTarget(item.detailsUrl)) missing.push('Lisätiedot')
  return missing
}

function PrepareShell({ session, children }: { session: Session; children: React.ReactNode }) {
  const navigate = useNavigate()
  const nav = [
    { to: '/today', label: 'Tänään', icon: Home },
    { to: '/prepare-hanna', label: 'Valmistele', icon: ClipboardCheck },
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

function PreparationCard({ item, onPrepared, onDraftSaved }: {
  item: PreparationItem
  onPrepared: (id: string) => void
  onDraftSaved: (item: PreparationItem) => void
}) {
  const [draft, setDraft] = useState(item)
  const [busy, setBusy] = useState<'draft' | 'send' | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const missing = useMemo(() => missingFields(draft), [draft])
  const ready = missing.length === 0
  const dirty = JSON.stringify(draft) !== JSON.stringify(item)

  function set<K extends keyof PreparationItem>(key: K, value: PreparationItem[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setMessage('')
    setError('')
  }

  async function save(promote: boolean) {
    if (promote && !ready) return
    setBusy(promote ? 'send' : 'draft')
    setMessage('')
    setError('')

    const patch = {
      task_instruction: trim(draft.taskInstruction) || null,
      action_label: trim(draft.actionLabel) || null,
      action_url: trim(draft.actionUrl) || null,
      materials_url: trim(draft.materialsUrl) || null,
      details_url: trim(draft.detailsUrl) || null,
      ready_for_hanna: promote,
    }

    const { error: updateError } = await supabase.from(sourceTable[draft.source]).update(patch).eq('id', draft.id)
    if (updateError) {
      setError(updateError.message)
      setBusy(null)
      return
    }

    const { data: authData } = await supabase.auth.getUser()
    const entityType = draft.source === 'admin_task' ? 'admin_task' : draft.source
    const { error: activityError } = await supabase.from('activities').insert({
      entity_type: entityType,
      entity_id: draft.id,
      user_id: authData.user?.id ?? null,
      action_type: promote ? 'ready_for_hanna' : 'prepare_hanna_draft',
      summary: promote ? 'Siirretty Hannan työjonoon' : 'Hanna-tehtävän valmistelua päivitetty',
      metadata: { source: draft.source, title: draft.title },
    })

    if (activityError) {
      setError(`Tehtävä tallennettiin, mutta aktiviteettiloki epäonnistui: ${activityError.message}`)
      setBusy(null)
      return
    }

    if (promote) {
      onPrepared(draft.id)
    } else {
      onDraftSaved(draft)
      setMessage('Luonnos tallennettu. Hanna ei näe tehtävää vielä.')
    }
    setBusy(null)
  }

  return (
    <article className="ph-card">
      <div className="ph-card-head">
        <div>
          <div className="ph-badges">
            <span className="ph-priority">{draft.priority}</span>
            <span>{draft.sourceLabel}</span>
            <span>{draft.state}</span>
          </div>
          <h2>{draft.title}</h2>
          {draft.context ? <p className="ph-context"><strong>Nykyinen konteksti:</strong> {draft.context}</p> : null}
        </div>
        <div className={`ph-ready-state ${ready ? 'is-ready' : ''}`}>
          {ready ? <><CheckCircle2 size={16} /> Valmis siirrettäväksi</> : <><AlertTriangle size={16} /> Puuttuu {missing.length}</>}
        </div>
      </div>

      {!ready ? <div className="ph-missing">{missing.map((field) => <span key={field}>{field}</span>)}</div> : null}

      <div className="ph-form">
        <label className="ph-field ph-wide">
          <span><strong>1. Tee tämä</strong><small>Kirjoita tehtävä niin, ettei Hannalle jää tulkinnanvaraa.</small></span>
          <textarea rows={3} value={draft.taskInstruction} onChange={(e) => set('taskInstruction', e.target.value)} placeholder="Esim. Soita asiakkaalle, selvitä päätöksen este ja sovi päätöspäivä." />
        </label>

        <fieldset className="ph-field ph-wide">
          <legend><strong>2. Avaa tästä</strong><small>Pääpainike vie suoraan paikkaan, jossa työ tehdään.</small></legend>
          <div className="ph-action-grid">
            <label><span>Painikkeen teksti</span><input value={draft.actionLabel} onChange={(e) => set('actionLabel', e.target.value)} placeholder="Esim. Soita Iirolle" /></label>
            <label><span>Toimintolinkki</span><input value={draft.actionUrl} onChange={(e) => set('actionUrl', e.target.value)} placeholder="https://… / mailto:… / tel:…" /></label>
          </div>
        </fieldset>

        <label className="ph-field">
          <span><strong>3. Materiaalit tästä</strong><small>Drive, Canva, Gmail-ketju, tarjous tai muu suora aineistolinkki.</small></span>
          <input value={draft.materialsUrl} onChange={(e) => set('materialsUrl', e.target.value)} placeholder="https://…" />
        </label>

        <label className="ph-field">
          <span><strong>4. Lisätiedot</strong><small>Asiakkaan/projectin konteksti, CRM tai ohjeistus.</small></span>
          <input value={draft.detailsUrl} onChange={(e) => set('detailsUrl', e.target.value)} placeholder="https://…" />
        </label>
      </div>

      {ready ? (
        <div className="ph-preview">
          <span>HANNA NÄKEE</span>
          <strong>{draft.title}</strong>
          <p>{draft.taskInstruction}</p>
          <div>{draft.actionLabel} · Materiaalit · Lisätiedot</div>
        </div>
      ) : null}

      {message ? <div className="ph-message success">{message}</div> : null}
      {error ? <div className="ph-message error"><AlertTriangle size={16} /> {error}</div> : null}

      <div className="ph-actions">
        <button className="ph-secondary" disabled={busy !== null || !dirty} onClick={() => void save(false)}><Save size={17} /> {busy === 'draft' ? 'Tallennetaan…' : 'Tallenna luonnos'}</button>
        <button className="ph-primary" disabled={busy !== null || !ready} onClick={() => void save(true)}><Send size={17} /> {busy === 'send' ? 'Siirretään…' : 'Siirrä Hannan työjonoon'}</button>
      </div>
    </article>
  )
}

export default function PrepareHannaPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [role, setRole] = useState<Role | null | undefined>(undefined)
  const [items, setItems] = useState<PreparationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabaseConfigured) {
      setSession(null)
      return
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setRole(session === null ? null : undefined)
      return
    }
    let active = true
    supabase.from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle().then(({ data, error: roleError }) => {
      if (!active) return
      if (roleError) {
        setError(roleError.message)
        setRole(null)
        return
      }
      setRole((data?.role as Role | undefined) ?? null)
    })
    return () => { active = false }
  }, [session])

  const canPrepare = role === 'jami'

  useEffect(() => {
    if (!canPrepare) return
    let active = true

    async function load() {
      setLoading(true)
      setError('')
      const [opportunitiesResult, projectsResult, adminResult] = await Promise.all([
        supabase.from('opportunities').select('*').eq('ready_for_hanna', false),
        supabase.from('projects').select('*').eq('ready_for_hanna', false),
        supabase.from('admin_tasks').select('*').eq('ready_for_hanna', false),
      ])
      const firstError = opportunitiesResult.error || projectsResult.error || adminResult.error
      if (firstError) {
        if (active) {
          setError(firstError.message)
          setLoading(false)
        }
        return
      }

      const opportunities = ((opportunitiesResult.data ?? []) as RawOpportunity[])
        .filter((row) => !row.is_demo && !['Won', 'Lost'].includes(row.stage))
        .map<PreparationItem>((row) => ({
          id: row.id,
          source: 'opportunity',
          sourceLabel: 'Myynti',
          title: row.company_name,
          state: row.stage,
          priority: row.priority || 'P2',
          context: row.next_action || row.notes,
          taskInstruction: row.task_instruction || '',
          actionLabel: row.action_label || '',
          actionUrl: row.action_url || '',
          materialsUrl: row.materials_url || '',
          detailsUrl: row.details_url || '',
        }))

      const projects = ((projectsResult.data ?? []) as RawProject[])
        .filter((row) => !row.is_demo && row.status !== 'Complete')
        .map<PreparationItem>((row) => ({
          id: row.id,
          source: 'project',
          sourceLabel: 'Asiakas',
          title: row.company_name,
          state: row.status,
          priority: row.priority || 'P2',
          context: row.next_action || row.notes,
          taskInstruction: row.task_instruction || '',
          actionLabel: row.action_label || '',
          actionUrl: row.action_url || '',
          materialsUrl: row.materials_url || '',
          detailsUrl: row.details_url || '',
        }))

      const admin = ((adminResult.data ?? []) as RawAdminTask[])
        .filter((row) => !['Valmis', 'Ei tarvetta'].includes(row.status))
        .map<PreparationItem>((row) => ({
          id: row.id,
          source: 'admin_task',
          sourceLabel: 'Hallinto',
          title: row.title,
          state: row.status,
          priority: row.priority || 'P3',
          context: row.next_action || row.notes,
          taskInstruction: row.task_instruction || '',
          actionLabel: row.action_label || '',
          actionUrl: row.action_url || '',
          materialsUrl: row.materials_url || '',
          detailsUrl: row.details_url || '',
        }))

      const next = [...opportunities, ...projects, ...admin].sort((a, b) => {
        const priority = a.priority.localeCompare(b.priority)
        return priority || a.title.localeCompare(b.title, 'fi')
      })

      if (active) {
        setItems(next)
        setLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [canPrepare])

  if (session === undefined || role === undefined) return <div className="tf-loading-screen">Ladataan valmistelunäkymää…</div>
  if (!session) return <Navigate to="/login" replace />

  if (!canPrepare) {
    return (
      <div className="ph-access-shell">
        <div className="ph-access-card">
          <ClipboardCheck size={34} />
          <span className="ph-eyebrow">Valmistele Hannalle</span>
          <h1>Tämä näkymä on Jamille.</h1>
          <p>Hannan käyttäjä näkee vain valmiiksi aktivoidut tehtävät. Keskeneräinen valmistelu ei kuulu Hannan työjonoon.</p>
          {error ? <div className="ph-message error"><AlertTriangle size={16} /> {error}</div> : null}
          <Link to="/today" className="ph-primary"><ArrowLeft size={17} /> Takaisin Tänään-näkymään</Link>
        </div>
      </div>
    )
  }

  return (
    <PrepareShell session={session}>
      <div className="ph-page">
        <header className="ph-header">
          <div>
            <span className="ph-eyebrow">JAMI</span>
            <h1>Valmistele Hannalle</h1>
            <p>Täytä neljä asiaa. Tehtävä pysyy piilossa Hannalta, kunnes painat <strong>Siirrä Hannan työjonoon</strong>.</p>
          </div>
          <div className="ph-count"><span>Valmisteltavana</span><strong>{items.length}</strong></div>
        </header>

        <section className="ph-rule">
          <div><strong>1</strong><span>Tee tämä</span></div>
          <div><strong>2</strong><span>Avaa tästä</span></div>
          <div><strong>3</strong><span>Materiaalit tästä</span></div>
          <div><strong>4</strong><span>Lisätiedot</span></div>
          <div className="ph-rule-result"><CheckCircle2 size={18} /><span>Vasta sitten Hannalle</span></div>
        </section>

        {error ? <div className="ph-message error"><AlertTriangle size={17} /> {error}</div> : null}
        {loading ? <div className="tf-loading">Ladataan keskeneräisiä tehtäviä…</div> : null}

        {!loading && !items.length ? (
          <div className="ph-empty">
            <CheckCircle2 size={30} />
            <h2>Ei keskeneräisiä Hanna-tehtäviä.</h2>
            <p>Kun uusi opportunity, projekti tai hallintotehtävä luodaan, se alkaa luonnoksena ja ilmestyy tänne ennen Hannan työjonoa.</p>
            <Link to="/today">Palaa Tänään-näkymään</Link>
          </div>
        ) : null}

        <div className="ph-list">
          {items.map((item) => (
            <PreparationCard
              key={`${item.source}-${item.id}`}
              item={item}
              onPrepared={(id) => setItems((current) => current.filter((row) => row.id !== id))}
              onDraftSaved={(updated) => setItems((current) => current.map((row) => row.id === updated.id && row.source === updated.source ? updated : row))}
            />
          ))}
        </div>
      </div>
    </PrepareShell>
  )
}
