import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Pencil, Plus, Power, PowerOff, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import ClientWorkspaceShell from './ClientWorkspaceShell'
import { getClientWorkspace, workspaceStatusLabel, type ClientWorkspace, type OrganizationAccess } from './lib/clientWorkspaces'
import {
  canManageService,
  createService,
  listServices,
  serviceStatusLabel,
  updateService,
  type ClientService,
  type ClientServiceInput,
  type ServiceStatus,
} from './lib/services'
import './client-services.css'
import './client-workspaces.css'

const emptyForm: ClientServiceInput = {
  name: '',
  shortDescription: '',
  description: '',
  status: 'ACTIVE',
}

function toForm(service: ClientService): ClientServiceInput {
  return {
    name: service.name,
    shortDescription: service.short_description || '',
    description: service.description || '',
    status: service.status,
  }
}

export default function ClientServicesPage() {
  const location = useLocation()
  const clientId = location.pathname.split('/')[2] || ''
  const [client, setClient] = useState<ClientWorkspace | null>(null)
  const [access, setAccess] = useState<OrganizationAccess | null>(null)
  const [services, setServices] = useState<ClientService[]>([])
  const [editingService, setEditingService] = useState<ClientService | null>(null)
  const [form, setForm] = useState<ClientServiceInput>(emptyForm)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    Promise.all([getClientWorkspace(clientId), listServices(clientId)])
      .then(([workspaceResult, servicesResult]) => {
        if (!active) return
        setClient(workspaceResult.client)
        setAccess(workspaceResult.access)
        setServices(servicesResult.services)
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false))

    return () => { active = false }
  }, [clientId])

  const manageable = useMemo(() => canManageService(access?.role), [access])

  function beginCreate() {
    setEditingService(null)
    setForm(emptyForm)
    setOpen(true)
  }

  function beginEdit(service: ClientService) {
    setEditingService(service)
    setForm(toForm(service))
    setOpen(true)
  }

  function closeDialog() {
    if (busy) return
    setOpen(false)
    setEditingService(null)
    setForm(emptyForm)
  }

  function replaceService(next: ClientService) {
    setServices((rows) => rows
      .map((row) => row.id === next.id ? next : row)
      .sort((a, b) => a.name.localeCompare(b.name, 'fi')))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!manageable) return
    setBusy(true)
    setError('')

    try {
      if (editingService) {
        const result = await updateService(clientId, editingService.id, form)
        replaceService(result.service)
      } else {
        const result = await createService(clientId, form)
        setServices((rows) => [...rows, result.service].sort((a, b) => a.name.localeCompare(b.name, 'fi')))
      }
      closeDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Palvelun tallennus epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(service: ClientService, status: ServiceStatus) {
    if (!manageable || service.status === status) return
    setBusy(true)
    setError('')
    try {
      const result = await updateService(clientId, service.id, { status })
      replaceService(result.service)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Palvelun tilan muuttaminen epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ClientWorkspaceShell>
      <div className="cw-page">
        <Link to={`/clients/${clientId}`} className="cw-back"><ArrowLeft size={16} /> Asiakkaan yleiskuva</Link>
        {error ? <div className="cw-error">{error}</div> : null}

        {loading ? <div className="cw-state">Ladataan palveluita…</div> : client && access ? (
          <>
            <header className="cw-detail-header">
              <div>
                <div className="cw-detail-title-row"><h1>{client.company_name}</h1><span className={`cw-status cw-${client.status.toLowerCase()}`}>{workspaceStatusLabel(client.status)}</span></div>
                <p>Palvelut · {access.organizationName}</p>
                <span className="cw-access-line">{access.role}</span>
              </div>
              {manageable ? <button className="cw-primary" onClick={beginCreate}><Plus size={17} /> Lisää palvelu</button> : null}
            </header>

            <nav className="cw-workspace-nav" aria-label="Asiakastyötilan osiot">
              <Link to={`/clients/${client.id}`}>Yleiskuva</Link>
              <span className="active">Palvelut</span>
              <span className="disabled" title="Ei vielä toteutettu">Liidit</span>
              <Link to={`/clients/${client.id}/funnels`}>Suppilot</Link>
              <span className="disabled" title="Ei vielä toteutettu">Myyntiputki</span>
              <span className="disabled" title="Ei vielä toteutettu">Hinta-arviot</span>
              <span className="disabled" title="Ei vielä toteutettu">Tarjoukset</span>
              <span className="disabled" title="Ei vielä toteutettu">Automaatiot</span>
              <Link to={`/clients/${client.id}#settings`}>Asetukset</Link>
            </nav>

            {!manageable ? <div className="cw-readonly service-readonly">VIEWER: palvelut ovat vain luku -tilassa</div> : null}

            {services.length ? (
              <section className="service-list" aria-label="Palvelut">
                {services.map((service) => (
                  <article key={service.id} className="service-card">
                    <div className="service-card-main">
                      <div className="service-card-title">
                        <div>
                          <h2>{service.name}</h2>
                          <code>{service.slug}</code>
                        </div>
                        <span className={`service-status service-${service.status.toLowerCase()}`}>{serviceStatusLabel(service.status)}</span>
                      </div>
                      <p>{service.short_description || service.description || 'Kuvausta ei ole vielä lisätty.'}</p>
                    </div>
                    {manageable ? (
                      <div className="service-actions">
                        <button className="cw-secondary" onClick={() => beginEdit(service)} disabled={busy}><Pencil size={15} /> Muokkaa</button>
                        {service.status === 'ACTIVE'
                          ? <button className="cw-secondary" onClick={() => void changeStatus(service, 'INACTIVE')} disabled={busy}><PowerOff size={15} /> Poista käytöstä</button>
                          : <button className="cw-secondary" onClick={() => void changeStatus(service, 'ACTIVE')} disabled={busy}><Power size={15} /> Aktivoi</button>}
                      </div>
                    ) : null}
                  </article>
                ))}
              </section>
            ) : (
              <section className="service-empty">
                <h2>Tälle asiakkaalle ei ole vielä lisätty palveluita.</h2>
                <p>Lisää ensimmäinen palvelu, jotta sille voidaan myöhemmin rakentaa liidisuppilo.</p>
                {manageable ? <button className="cw-primary" onClick={beginCreate}><Plus size={17} /> Lisää ensimmäinen palvelu</button> : null}
              </section>
            )}

            {open && manageable ? (
              <div className="cw-dialog-backdrop" onMouseDown={closeDialog}>
                <form className="cw-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
                  <div className="cw-dialog-head">
                    <div><span className="cw-eyebrow">PALVELU</span><h2>{editingService ? 'Muokkaa palvelua' : 'Lisää palvelu'}</h2></div>
                    <button type="button" className="cw-icon-button" onClick={closeDialog} disabled={busy}><X size={20} /></button>
                  </div>
                  <div className="service-form">
                    <label>Nimi<input required minLength={2} maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                    <label>Lyhyt kuvaus<input maxLength={240} value={form.shortDescription || ''} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} /></label>
                    <label>Kuvaus<textarea rows={5} maxLength={5000} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
                  </div>
                  <p className="service-slug-note">Slug luodaan automaattisesti palvelun nimestä. Nimen myöhempi muokkaus ei vaihda olemassa olevaa slugia.</p>
                  <div className="cw-dialog-actions"><button type="button" className="cw-secondary" onClick={closeDialog} disabled={busy}>Peruuta</button><button className="cw-primary" disabled={busy}>{busy ? 'Tallennetaan…' : 'Tallenna palvelu'}</button></div>
                </form>
              </div>
            ) : null}
          </>
        ) : !error ? <div className="cw-state">Asiakasta ei löytynyt.</div> : null}
      </div>
    </ClientWorkspaceShell>
  )
}
