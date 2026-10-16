import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Archive, ArrowLeft, ExternalLink, PauseCircle, PlayCircle, Save, Settings2 } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import ClientWorkspaceShell from './ClientWorkspaceShell'
import {
  canEditClient,
  getClientWorkspace,
  type ClientWorkspace,
  type ClientWorkspaceInput,
  type OrganizationAccess,
  type ClientWorkspaceStatus,
  updateClientWorkspace,
  workspaceStatusLabel,
} from './lib/clientWorkspaces'
import './client-workspaces.css'

function toForm(client: ClientWorkspace): ClientWorkspaceInput {
  return {
    companyName: client.company_name,
    slug: client.slug,
    businessId: client.business_id || '',
    industry: client.industry || '',
    website: client.website || '',
    phone: client.phone || '',
    email: client.email || '',
    city: client.city || '',
    serviceArea: client.service_area || '',
    status: client.status,
    currency: client.currency,
    timezone: client.timezone,
  }
}

export default function ClientWorkspaceDetailPage() {
  const location = useLocation()
  const id = location.pathname.split('/')[2] || ''
  const [client, setClient] = useState<ClientWorkspace | null>(null)
  const [access, setAccess] = useState<OrganizationAccess | null>(null)
  const [form, setForm] = useState<ClientWorkspaceInput | null>(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    getClientWorkspace(id)
      .then((result) => {
        if (!active) return
        setClient(result.client)
        setAccess(result.access)
        setForm(toForm(result.client))
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [id])

  const editable = useMemo(() => canEditClient(access?.role), [access])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!client || !form || !editable) return
    setBusy(true)
    setError('')
    try {
      const result = await updateClientWorkspace(client.id, form)
      setClient(result.client)
      setAccess(result.access)
      setForm(toForm(result.client))
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tallennus epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(status: ClientWorkspaceStatus) {
    if (!client || !editable || client.status === status) return
    setBusy(true)
    setError('')
    try {
      const result = await updateClientWorkspace(client.id, { status })
      setClient(result.client)
      setAccess(result.access)
      setForm(toForm(result.client))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tilan muuttaminen epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ClientWorkspaceShell>
      <div className="cw-page">
        <Link to="/clients" className="cw-back"><ArrowLeft size={16} /> Asiakasyritykset</Link>
        {error ? <div className="cw-error">{error}</div> : null}
        {loading ? <div className="cw-state">Ladataan asiakastyötilaa…</div> : client && form && access ? (
          <>
            <header className="cw-detail-header">
              <div>
                <div className="cw-detail-title-row"><h1>{client.company_name}</h1><span className={`cw-status cw-${client.status.toLowerCase()}`}>{workspaceStatusLabel(client.status)}</span></div>
                <p>{client.industry || 'Toimiala ei määritelty'} · {client.city || 'Paikkakunta ei määritelty'}</p>
                <span className="cw-access-line">{access.organizationName} · {access.role}</span>
              </div>
              {editable ? <button className="cw-secondary" onClick={() => setEditing((value) => !value)}><Settings2 size={17} /> {editing ? 'Sulje muokkaus' : 'Muokkaa tietoja'}</button> : null}
            </header>

            <nav className="cw-workspace-nav" aria-label="Asiakastyötilan osiot">
              <a href="#overview">Yleiskuva</a>
              <Link to={`/clients/${client.id}/services`}>Palvelut</Link>
              <span className="disabled" title="Ei vielä toteutettu">Liidit</span>
              <Link to={`/clients/${client.id}/funnels`}>Suppilot</Link>
              <span className="disabled" title="Ei vielä toteutettu">Myyntiputki</span>
              <span className="disabled" title="Ei vielä toteutettu">Hinta-arviot</span>
              <span className="disabled" title="Ei vielä toteutettu">Tarjoukset</span>
              <span className="disabled" title="Ei vielä toteutettu">Automaatiot</span>
              <a href="#settings">Asetukset</a>
            </nav>

            <section id="overview" className="cw-overview-grid">
              <article className="cw-panel">
                <span className="cw-eyebrow">YRITYS</span>
                <dl className="cw-detail-list">
                  <div><dt>Y-tunnus</dt><dd>{client.business_id || '—'}</dd></div>
                  <div><dt>Toimiala</dt><dd>{client.industry || '—'}</dd></div>
                  <div><dt>Kaupunki</dt><dd>{client.city || '—'}</dd></div>
                  <div><dt>Palvelualue</dt><dd>{client.service_area || '—'}</dd></div>
                </dl>
              </article>
              <article className="cw-panel">
                <span className="cw-eyebrow">YHTEYSTIEDOT</span>
                <dl className="cw-detail-list">
                  <div><dt>Puhelin</dt><dd>{client.phone || '—'}</dd></div>
                  <div><dt>Sähköposti</dt><dd>{client.email || '—'}</dd></div>
                  <div><dt>Verkkosivu</dt><dd>{client.website ? <a href={client.website} target="_blank" rel="noreferrer">Avaa verkkosivu <ExternalLink size={13} /></a> : '—'}</dd></div>
                  <div><dt>Slug</dt><dd>{client.slug}</dd></div>
                </dl>
              </article>
              <article className="cw-panel">
                <span className="cw-eyebrow">TYÖTILA</span>
                <dl className="cw-detail-list">
                  <div><dt>Valuutta</dt><dd>{client.currency}</dd></div>
                  <div><dt>Aikavyöhyke</dt><dd>{client.timezone}</dd></div>
                  <div><dt>Luotu</dt><dd>{new Intl.DateTimeFormat('fi-FI').format(new Date(client.created_at))}</dd></div>
                  <div><dt>Päivitetty</dt><dd>{new Intl.DateTimeFormat('fi-FI').format(new Date(client.updated_at))}</dd></div>
                </dl>
              </article>
            </section>

            <section id="settings" className="cw-panel cw-settings-panel">
              <div className="cw-settings-head"><div><span className="cw-eyebrow">ASETUKSET</span><h2>Asiakastyötila</h2></div>{!editable ? <span className="cw-readonly">VIEWER: vain luku</span> : null}</div>

              {editing && editable ? (
                <form onSubmit={save}>
                  <div className="cw-form-grid">
                    <label className="cw-wide">Yrityksen nimi<input required minLength={2} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></label>
                    <label>Slug<input required value={form.slug || ''} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} /></label>
                    <label>Y-tunnus<input value={form.businessId || ''} onChange={(e) => setForm({ ...form, businessId: e.target.value })} /></label>
                    <label>Toimiala<input value={form.industry || ''} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></label>
                    <label>Verkkosivu<input type="url" value={form.website || ''} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
                    <label>Puhelin<input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                    <label>Sähköposti<input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                    <label>Kaupunki<input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
                    <label className="cw-wide">Palvelualue<input value={form.serviceArea || ''} onChange={(e) => setForm({ ...form, serviceArea: e.target.value })} /></label>
                    <label>Valuutta<input maxLength={3} value={form.currency || 'EUR'} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></label>
                    <label>Aikavyöhyke<input value={form.timezone || 'Europe/Helsinki'} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></label>
                  </div>
                  <div className="cw-dialog-actions"><button type="button" className="cw-secondary" onClick={() => { setForm(toForm(client)); setEditing(false) }}>Peruuta</button><button className="cw-primary" disabled={busy}><Save size={16} /> {busy ? 'Tallennetaan…' : 'Tallenna'}</button></div>
                </form>
              ) : null}

              {editable ? (
                <div className="cw-status-actions">
                  <div><strong>Työtilan tila</strong><p>Pausetus säilyttää datan. Arkistointi poistaa asiakkaan aktiivisesta käytöstä, mutta ei poista tietoja.</p></div>
                  <div className="cw-status-buttons">
                    <button disabled={busy || client.status === 'ACTIVE'} onClick={() => void changeStatus('ACTIVE')}><PlayCircle size={16} /> Aktivoi</button>
                    <button disabled={busy || client.status === 'PAUSED'} onClick={() => void changeStatus('PAUSED')}><PauseCircle size={16} /> Pauseta</button>
                    <button disabled={busy || client.status === 'ARCHIVED'} onClick={() => void changeStatus('ARCHIVED')}><Archive size={16} /> Arkistoi</button>
                  </div>
                </div>
              ) : null}
            </section>
          </>
        ) : !error ? <div className="cw-state">Asiakasta ei löytynyt.</div> : null}
      </div>
    </ClientWorkspaceShell>
  )
}
