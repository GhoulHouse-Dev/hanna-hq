import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, CheckCircle2, Database, RefreshCw, Settings, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from './lib/supabase'
import './settings-v2.css'

type Role = 'hanna' | 'jami' | null

type SyncRun = {
  id: string
  status: 'running' | 'success' | 'error'
  started_at: string
  finished_at: string | null
  companies_seen: number
  contacts_seen: number
  opportunities_seen: number
  projects_seen: number
  error_message: string | null
}

function dateTime(value?: string | null) {
  if (!value) return 'Ei vielä synkronoitu'
  return new Intl.DateTimeFormat('fi-FI', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function SettingsPageV2() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [role, setRole] = useState<Role>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [latest, setLatest] = useState<SyncRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabaseConfigured) {
      setSession(null)
      return
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let active = true

    async function load() {
      setError('')
      const [{ data: roleRow, error: roleError }, { data: syncRow, error: syncError }] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', session!.user.id).maybeSingle(),
        supabase.from('crm_sync_runs').select('*').eq('provider', 'notion').order('started_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (!active) return
      if (roleError) setError(roleError.message)
      if (syncError) setError(syncError.message)
      const resolvedRole = (roleRow?.role === 'jami' || roleRow?.role === 'hanna') ? roleRow.role : null
      setRole(resolvedRole)
      setLatest((syncRow as SyncRun | null) ?? null)

      if (resolvedRole === 'jami') {
        const token = session!.access_token
        const response = await fetch('/api/notion-sync', { headers: { Authorization: `Bearer ${token}` } })
        const payload = await response.json().catch(() => ({}))
        if (!active) return
        if (response.ok) {
          setConfigured(Boolean(payload.configured))
          setLatest((payload.latest as SyncRun | null) ?? syncRow ?? null)
        } else {
          setError(payload.error || 'Notion-yhteyden tilan tarkistus epäonnistui')
        }
      }
    }

    void load()
    return () => { active = false }
  }, [session])

  async function syncNow() {
    if (!session || role !== 'jami' || !configured) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/notion-sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'CRM-synkronointi epäonnistui')
      setLatest(payload.result as SyncRun)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CRM-synkronointi epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  if (session === undefined) return <div className="sv2-loading">Ladataan asetuksia…</div>
  if (!session) return <Navigate to="/login" replace />

  const connected = configured === true
  const statusText = role === 'jami'
    ? connected ? 'Valmis synkronointiin' : configured === false ? 'Valtuutus puuttuu' : 'Tarkistetaan…'
    : 'Jami hallinnoi synkronointia'

  return (
    <div className="sv2-shell">
      <header className="sv2-header">
        <div>
          <Link to="/today" className="sv2-back"><ArrowLeft size={17} /> Tänään</Link>
          <div className="sv2-title"><Settings size={22} /><h1>Asetukset</h1></div>
          <p>Hanna HQ:n integraatiot ja operatiivinen data.</p>
        </div>
        <div className="sv2-nav"><Link to="/shifts">Työvuorot</Link>{role === 'jami' ? <Link to="/prepare-hanna">Valmistele Hannalle</Link> : null}</div>
      </header>

      {error ? <div className="sv2-error"><TriangleAlert size={18} /> {error}</div> : null}

      <section className="sv2-card sv2-notion-card">
        <div className="sv2-card-head">
          <div className="sv2-icon"><Database size={22} /></div>
          <div><span className="sv2-eyebrow">NOTION CRM</span><h2>GhoulHouse OS → Hanna HQ</h2></div>
          <span className={`sv2-status ${connected ? 'is-ok' : ''}`}>{connected ? <CheckCircle2 size={15} /> : null}{statusText}</span>
        </div>

        <p className="sv2-lead">Companies, Contacts, Opportunities ja Projects peilataan Notionista Hanna HQ:hon. Hannan työjonon omat “Tee tämä / Avaa tästä / Materiaalit tästä” -kentät säilyvät Supabasessa eikä CRM-tuonti ylikirjoita valmiiksi valmisteltua tehtävää.</p>

        <div className="sv2-grid">
          <div><span>Companies</span><strong>{latest?.companies_seen ?? '—'}</strong></div>
          <div><span>Contacts</span><strong>{latest?.contacts_seen ?? '—'}</strong></div>
          <div><span>Opportunities</span><strong>{latest?.opportunities_seen ?? '—'}</strong></div>
          <div><span>Projects</span><strong>{latest?.projects_seen ?? '—'}</strong></div>
        </div>

        <div className="sv2-sync-row">
          <div>
            <span>Viimeisin synkronointi</span>
            <strong>{dateTime(latest?.finished_at || latest?.started_at)}</strong>
            {latest?.status === 'error' && latest.error_message ? <small>{latest.error_message}</small> : null}
          </div>
          {role === 'jami' ? (
            <button className="sv2-sync-button" onClick={syncNow} disabled={!connected || busy}>
              <RefreshCw size={17} className={busy ? 'is-spinning' : ''} />
              {busy ? 'Synkronoidaan…' : 'Synkronoi nyt'}
            </button>
          ) : null}
        </div>

        {role === 'jami' && configured === false ? (
          <div className="sv2-setup">
            <ShieldCheck size={19} />
            <div><strong>Yksi valtuutus puuttuu.</strong><p>Hanna HQ:n tuotantoympäristöstä puuttuu Notion-integraation salainen käyttöavain. CRM-rakenne ja synkronointipolku ovat valmiit; yhteys aktivoituu, kun integraatio on jaettu GhoulHouse OS:n CRM-tietokannoille ja <code>NOTION_TOKEN</code> lisätty tuotannon salaiseksi ympäristömuuttujaksi.</p></div>
          </div>
        ) : null}
      </section>

      <section className="sv2-card">
        <div className="sv2-card-head"><div className="sv2-icon"><ShieldCheck size={22} /></div><div><span className="sv2-eyebrow">SUPABASE</span><h2>Operatiivinen työtila</h2></div><span className="sv2-status is-ok"><CheckCircle2 size={15} /> Connected</span></div>
        <p className="sv2-lead">Autentikointi, työvuorot, Hannan valmis työjono ja tehtävien toteutusmetadata pysyvät Hanna HQ:n omassa tietokannassa.</p>
      </section>
    </div>
  )
}
