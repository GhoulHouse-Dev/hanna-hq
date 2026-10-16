import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Building2, Plus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import ClientWorkspaceShell from './ClientWorkspaceShell'
import {
  canCreateClient,
  createClientWorkspace,
  listClientWorkspaces,
  type ClientWorkspace,
  type ClientWorkspaceInput,
  type OrganizationAccess,
  workspaceStatusLabel,
} from './lib/clientWorkspaces'
import './client-workspaces.css'

const emptyForm: ClientWorkspaceInput = {
  companyName: '',
  businessId: '',
  industry: '',
  website: '',
  phone: '',
  email: '',
  city: '',
  serviceArea: '',
  status: 'ACTIVE',
  currency: 'EUR',
  timezone: 'Europe/Helsinki',
}

export default function ClientWorkspacesPage() {
  const [clients, setClients] = useState<ClientWorkspace[]>([])
  const [memberships, setMemberships] = useState<OrganizationAccess[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [form, setForm] = useState<ClientWorkspaceInput>(emptyForm)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const result = await listClientWorkspaces()
      setClients(result.clients)
      setMemberships(result.memberships)
      setOrganizationId((current) => current || result.memberships[0]?.organizationId || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Asiakkaiden lataus epäonnistui')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const currentAccess = useMemo(
    () => memberships.find((membership) => membership.organizationId === organizationId) || memberships[0] || null,
    [memberships, organizationId],
  )
  const visibleClients = useMemo(
    () => clients.filter((client) => !currentAccess || client.organization_id === currentAccess.organizationId),
    [clients, currentAccess],
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!currentAccess) return
    setBusy(true)
    setError('')
    try {
      const result = await createClientWorkspace(currentAccess.organizationId, form)
      setClients((rows) => [...rows, result.client].sort((a, b) => a.company_name.localeCompare(b.company_name, 'fi')))
      setForm(emptyForm)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Asiakkaan luonti epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ClientWorkspaceShell>
      <div className="cw-page">
        <header className="cw-page-header">
          <div>
            <span className="cw-eyebrow">ASIAKASYRITYKSET</span>
            <h1>Asiakastyötilat</h1>
            <p>Yksi työtila per asiakasyritys. Kaikki tulevat liidit, tarjoukset ja pipeline-data sidotaan tähän rakenteeseen.</p>
          </div>
          {currentAccess && canCreateClient(currentAccess.role) ? (
            <button className="cw-primary" onClick={() => setOpen(true)}><Plus size={17} /> Uusi asiakas</button>
          ) : null}
        </header>

        {memberships.length > 1 ? (
          <label className="cw-org-select">Organisaatio
            <select value={currentAccess?.organizationId || ''} onChange={(event) => setOrganizationId(event.target.value)}>
              {memberships.map((membership) => <option key={membership.organizationId} value={membership.organizationId}>{membership.organizationName}</option>)}
            </select>
          </label>
        ) : currentAccess ? (
          <div className="cw-access-line">{currentAccess.organizationName} · {currentAccess.role}</div>
        ) : null}

        {error ? <div className="cw-error">{error}</div> : null}
        {loading ? <div className="cw-state">Ladataan asiakasyrityksiä…</div> : (
          <section className="cw-client-grid">
            {visibleClients.map((client) => (
              <Link key={client.id} to={`/clients/${client.id}`} className="cw-client-card">
                <div className="cw-client-icon"><Building2 size={20} /></div>
                <div className="cw-client-card-main">
                  <div className="cw-client-card-head"><h2>{client.company_name}</h2><span className={`cw-status cw-${client.status.toLowerCase()}`}>{workspaceStatusLabel(client.status)}</span></div>
                  <p>{client.industry || 'Toimiala ei määritelty'}</p>
                  <div className="cw-meta"><span>{client.city || 'Paikkakunta —'}</span><span>{client.business_id || 'Y-tunnus —'}</span></div>
                </div>
              </Link>
            ))}
            {!visibleClients.length ? <div className="cw-state">Asiakasyrityksiä ei ole vielä luotu.</div> : null}
          </section>
        )}

        {open ? (
          <div className="cw-dialog-backdrop" onMouseDown={() => setOpen(false)}>
            <form className="cw-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
              <div className="cw-dialog-head"><div><span className="cw-eyebrow">UUSI ASIAKAS</span><h2>Luo asiakastyötila</h2></div><button type="button" className="cw-icon-button" onClick={() => setOpen(false)}><X size={20} /></button></div>
              <div className="cw-form-grid">
                <label className="cw-wide">Yrityksen nimi<input required minLength={2} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></label>
                <label>Y-tunnus<input value={form.businessId || ''} onChange={(e) => setForm({ ...form, businessId: e.target.value })} /></label>
                <label>Toimiala<input value={form.industry || ''} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></label>
                <label>Verkkosivu<input type="url" placeholder="https://" value={form.website || ''} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
                <label>Puhelin<input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                <label>Sähköposti<input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                <label>Kaupunki<input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
                <label className="cw-wide">Palvelualue<input value={form.serviceArea || ''} onChange={(e) => setForm({ ...form, serviceArea: e.target.value })} /></label>
              </div>
              <div className="cw-dialog-actions"><button type="button" className="cw-secondary" onClick={() => setOpen(false)}>Peruuta</button><button className="cw-primary" disabled={busy}>{busy ? 'Luodaan…' : 'Luo asiakas'}</button></div>
            </form>
          </div>
        ) : null}
      </div>
    </ClientWorkspaceShell>
  )
}
