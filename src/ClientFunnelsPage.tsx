import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import ClientWorkspaceShell from './ClientWorkspaceShell'
import {
  getClientWorkspace,
  workspaceStatusLabel,
  type ClientWorkspace,
  type OrganizationAccess,
} from './lib/clientWorkspaces'
import {
  canManageFunnel,
  createFunnel,
  createFunnelStep,
  deleteFunnelStep,
  FUNNEL_STEP_TYPES,
  funnelStatusLabel,
  funnelStepTypeLabel,
  isChoiceStepType,
  isStaticStepType,
  listFunnels,
  listFunnelSteps,
  updateFunnel,
  updateFunnelStep,
  type ClientFunnel,
  type FunnelInput,
  type FunnelOption,
  type FunnelStatus,
  type FunnelStep,
  type FunnelStepInput,
  type FunnelStepType,
} from './lib/funnels'
import { listServices, type ClientService } from './lib/services'
import './client-funnels.css'
import './client-workspaces.css'

const emptyFunnelForm: FunnelInput = {
  name: '',
  serviceId: null,
  description: '',
  status: 'DRAFT',
}

function stepForm(position: number): FunnelStepInput {
  return {
    fieldKey: '',
    type: 'TEXT',
    label: '',
    description: '',
    placeholder: '',
    required: false,
    position,
    options: [],
  }
}

function toFunnelForm(funnel: ClientFunnel): FunnelInput {
  return {
    name: funnel.name,
    serviceId: funnel.service_id,
    description: funnel.description || '',
    status: funnel.status,
  }
}

function toStepForm(step: FunnelStep): FunnelStepInput {
  return {
    fieldKey: step.field_key || '',
    type: step.type,
    label: step.label,
    description: step.description || '',
    placeholder: step.placeholder || '',
    required: step.required,
    position: step.position,
    options: step.options || [],
  }
}

function WorkspaceNav({ clientId }: { clientId: string }) {
  return (
    <nav className="cw-workspace-nav" aria-label="Asiakastyötilan osiot">
      <Link to={`/clients/${clientId}`}>Yleiskuva</Link>
      <Link to={`/clients/${clientId}/services`}>Palvelut</Link>
      <span className="disabled" title="Ei vielä toteutettu">Liidit</span>
      <span className="active">Suppilot</span>
      <span className="disabled" title="Ei vielä toteutettu">Myyntiputki</span>
      <span className="disabled" title="Ei vielä toteutettu">Hinta-arviot</span>
      <span className="disabled" title="Ei vielä toteutettu">Tarjoukset</span>
      <span className="disabled" title="Ei vielä toteutettu">Automaatiot</span>
      <Link to={`/clients/${clientId}#settings`}>Asetukset</Link>
    </nav>
  )
}

export default function ClientFunnelsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const pathParts = location.pathname.split('/').filter(Boolean)
  const clientId = pathParts[1] || ''
  const funnelId = pathParts[3] || null

  const [client, setClient] = useState<ClientWorkspace | null>(null)
  const [access, setAccess] = useState<OrganizationAccess | null>(null)
  const [services, setServices] = useState<ClientService[]>([])
  const [funnels, setFunnels] = useState<ClientFunnel[]>([])
  const [steps, setSteps] = useState<FunnelStep[]>([])
  const [funnelForm, setFunnelForm] = useState<FunnelInput>(emptyFunnelForm)
  const [createOpen, setCreateOpen] = useState(false)
  const [stepOpen, setStepOpen] = useState(false)
  const [editingStep, setEditingStep] = useState<FunnelStep | null>(null)
  const [currentStepForm, setCurrentStepForm] = useState<FunnelStepInput>(stepForm(10))
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    Promise.all([
      getClientWorkspace(clientId),
      listServices(clientId),
      listFunnels(clientId),
    ])
      .then(async ([workspaceResult, serviceResult, funnelResult]) => {
        if (!active) return
        setClient(workspaceResult.client)
        setAccess(workspaceResult.access)
        setServices(serviceResult.services)
        setFunnels(funnelResult.funnels)

        if (funnelId) {
          const selected = funnelResult.funnels.find((row) => row.id === funnelId)
          if (selected) {
            setFunnelForm(toFunnelForm(selected))
            const stepResult = await listFunnelSteps(clientId, funnelId)
            if (active) setSteps(stepResult.steps)
          } else if (active) {
            setSteps([])
          }
        } else {
          setSteps([])
          setFunnelForm(emptyFunnelForm)
        }
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false))

    return () => { active = false }
  }, [clientId, funnelId])

  const manageable = useMemo(() => canManageFunnel(access?.role), [access])
  const selectedFunnel = funnelId ? funnels.find((row) => row.id === funnelId) || null : null
  const serviceById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services])

  async function refreshSteps() {
    if (!funnelId) return
    const result = await listFunnelSteps(clientId, funnelId)
    setSteps(result.steps)
    setFunnels((rows) => rows.map((row) => row.id === funnelId ? { ...row, question_count: result.steps.length } : row))
  }

  async function submitNewFunnel(event: FormEvent) {
    event.preventDefault()
    if (!manageable) return
    setBusy(true)
    setError('')
    try {
      const result = await createFunnel(clientId, funnelForm)
      setFunnels((rows) => [...rows, result.funnel])
      setCreateOpen(false)
      setFunnelForm(toFunnelForm(result.funnel))
      navigate(`/clients/${clientId}/funnels/${result.funnel.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppilon luonti epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  async function saveFunnel(event: FormEvent) {
    event.preventDefault()
    if (!manageable || !selectedFunnel) return
    setBusy(true)
    setError('')
    try {
      const result = await updateFunnel(clientId, selectedFunnel.id, funnelForm)
      setFunnels((rows) => rows.map((row) => row.id === result.funnel.id ? { ...result.funnel, question_count: row.question_count } : row))
      setFunnelForm(toFunnelForm(result.funnel))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppilon tallennus epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  function beginCreateFunnel() {
    setFunnelForm(emptyFunnelForm)
    setCreateOpen(true)
  }

  function beginCreateStep() {
    const nextPosition = steps.length ? Math.max(...steps.map((step) => step.position)) + 10 : 10
    setEditingStep(null)
    setCurrentStepForm(stepForm(nextPosition))
    setStepOpen(true)
  }

  function beginEditStep(step: FunnelStep) {
    setEditingStep(step)
    setCurrentStepForm(toStepForm(step))
    setStepOpen(true)
  }

  function changeStepType(type: FunnelStepType) {
    setCurrentStepForm((form) => ({
      ...form,
      type,
      fieldKey: isStaticStepType(type) ? null : form.fieldKey,
      placeholder: isStaticStepType(type) ? '' : form.placeholder,
      required: isStaticStepType(type) ? false : form.required,
      options: isChoiceStepType(type)
        ? (form.options.length ? form.options : [{ value: '', label: '' }])
        : [],
    }))
  }

  function updateOption(index: number, key: keyof FunnelOption, value: string) {
    setCurrentStepForm((form) => ({
      ...form,
      options: form.options.map((option, optionIndex) => optionIndex === index ? { ...option, [key]: value } : option),
    }))
  }

  function removeOption(index: number) {
    setCurrentStepForm((form) => ({ ...form, options: form.options.filter((_, optionIndex) => optionIndex !== index) }))
  }

  async function submitStep(event: FormEvent) {
    event.preventDefault()
    if (!manageable || !funnelId) return
    setBusy(true)
    setError('')
    try {
      if (editingStep) {
        await updateFunnelStep(clientId, funnelId, editingStep.id, currentStepForm)
      } else {
        await createFunnelStep(clientId, funnelId, currentStepForm)
      }
      await refreshSteps()
      setStepOpen(false)
      setEditingStep(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kysymyksen tallennus epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  async function removeStep(step: FunnelStep) {
    if (!manageable || !funnelId || !window.confirm(`Poistetaanko kysymys “${step.label}”?`)) return
    setBusy(true)
    setError('')
    try {
      await deleteFunnelStep(clientId, funnelId, step.id)
      await refreshSteps()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kysymyksen poistaminen epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  async function moveStep(index: number, direction: -1 | 1) {
    if (!manageable || !funnelId) return
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= steps.length) return
    const current = steps[index]
    const target = steps[targetIndex]
    setBusy(true)
    setError('')
    try {
      await Promise.all([
        updateFunnelStep(clientId, funnelId, current.id, { position: target.position }),
        updateFunnelStep(clientId, funnelId, target.id, { position: current.position }),
      ])
      await refreshSteps()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Järjestyksen muuttaminen epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <ClientWorkspaceShell><div className="cw-page"><div className="cw-state">Ladataan suppiloita…</div></div></ClientWorkspaceShell>
  }

  if (!client || !access) {
    return <ClientWorkspaceShell><div className="cw-page">{error ? <div className="cw-error">{error}</div> : <div className="cw-state">Asiakasta ei löytynyt.</div>}</div></ClientWorkspaceShell>
  }

  return (
    <ClientWorkspaceShell>
      <div className="cw-page funnel-page">
        <Link to={funnelId ? `/clients/${clientId}/funnels` : `/clients/${clientId}`} className="cw-back"><ArrowLeft size={16} /> {funnelId ? 'Kaikki suppilot' : 'Asiakkaan yleiskuva'}</Link>
        {error ? <div className="cw-error">{error}</div> : null}

        <header className="cw-detail-header">
          <div>
            <div className="cw-detail-title-row"><h1>{funnelId && selectedFunnel ? selectedFunnel.name : client.company_name}</h1>{!funnelId ? <span className={`cw-status cw-${client.status.toLowerCase()}`}>{workspaceStatusLabel(client.status)}</span> : null}</div>
            <p>{funnelId ? `Suppilo · ${client.company_name}` : `Suppilot · ${access.organizationName}`}</p>
            <span className="cw-access-line">{access.role}</span>
          </div>
          {!funnelId && manageable ? <button className="cw-primary" onClick={beginCreateFunnel}><Plus size={17} /> Luo suppilo</button> : null}
          {funnelId && selectedFunnel && manageable ? <button className="cw-primary" onClick={beginCreateStep}><Plus size={17} /> Lisää kysymys</button> : null}
        </header>

        <WorkspaceNav clientId={clientId} />
        {!manageable ? <div className="cw-readonly funnel-readonly">VIEWER: suppilot ovat vain luku -tilassa</div> : null}

        {!funnelId ? (
          funnels.length ? (
            <section className="funnel-list" aria-label="Suppilot">
              {funnels.map((funnel) => (
                <Link key={funnel.id} to={`/clients/${clientId}/funnels/${funnel.id}`} className="funnel-card">
                  <div>
                    <div className="funnel-card-title"><h2>{funnel.name}</h2><span className={`funnel-status funnel-${funnel.status.toLowerCase()}`}>{funnelStatusLabel(funnel.status)}</span></div>
                    <p>{funnel.description || 'Kuvausta ei ole vielä lisätty.'}</p>
                  </div>
                  <dl>
                    <div><dt>Palvelu</dt><dd>{funnel.service_id ? serviceById.get(funnel.service_id)?.name || 'Tuntematon palvelu' : 'Yleinen suppilo'}</dd></div>
                    <div><dt>Kysymyksiä</dt><dd>{funnel.question_count || 0}</dd></div>
                    <div><dt>Slug</dt><dd><code>{funnel.slug}</code></dd></div>
                  </dl>
                </Link>
              ))}
            </section>
          ) : (
            <section className="service-empty funnel-empty">
              <h2>Tälle asiakkaalle ei ole vielä rakennettu liidisuppiloita.</h2>
              <p>Luo ensimmäinen suppilo ja määritä sen kysymykset. Julkista lomaketta ei vielä julkaista tässä vaiheessa.</p>
              {manageable ? <button className="cw-primary" onClick={beginCreateFunnel}><Plus size={17} /> Luo ensimmäinen suppilo</button> : null}
            </section>
          )
        ) : selectedFunnel ? (
          <div className="funnel-editor-layout">
            <section className="cw-panel funnel-settings-panel">
              <div className="cw-settings-head"><div><span className="cw-eyebrow">SUPPILO</span><h2>Perustiedot</h2></div><span className={`funnel-status funnel-${selectedFunnel.status.toLowerCase()}`}>{funnelStatusLabel(selectedFunnel.status)}</span></div>
              {manageable ? (
                <form onSubmit={saveFunnel} className="funnel-form">
                  <label>Nimi<input required minLength={2} maxLength={160} value={funnelForm.name} onChange={(event) => setFunnelForm({ ...funnelForm, name: event.target.value })} /></label>
                  <label>Palvelu<select value={funnelForm.serviceId || ''} onChange={(event) => setFunnelForm({ ...funnelForm, serviceId: event.target.value || null })}><option value="">Yleinen suppilo — ei palvelua</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
                  <label className="funnel-wide">Kuvaus<textarea rows={3} maxLength={5000} value={funnelForm.description || ''} onChange={(event) => setFunnelForm({ ...funnelForm, description: event.target.value })} /></label>
                  <label>Status<select value={funnelForm.status || 'DRAFT'} onChange={(event) => setFunnelForm({ ...funnelForm, status: event.target.value as FunnelStatus })}><option value="DRAFT">DRAFT · Rakenteilla</option><option value="ACTIVE">ACTIVE · Valmis myöhempään käyttöön</option><option value="PAUSED">PAUSED · Pois käytöstä</option></select></label>
                  <div className="funnel-slug-readonly"><span>Slug</span><code>{selectedFunnel.slug}</code><small>Nimen muokkaus ei muuta pysyvää slugia automaattisesti.</small></div>
                  <div className="cw-dialog-actions funnel-wide"><button className="cw-primary" disabled={busy}><Save size={16} /> {busy ? 'Tallennetaan…' : 'Tallenna suppilo'}</button></div>
                </form>
              ) : (
                <dl className="cw-detail-list">
                  <div><dt>Palvelu</dt><dd>{selectedFunnel.service_id ? serviceById.get(selectedFunnel.service_id)?.name || 'Tuntematon palvelu' : 'Yleinen suppilo'}</dd></div>
                  <div><dt>Status</dt><dd>{funnelStatusLabel(selectedFunnel.status)}</dd></div>
                  <div><dt>Slug</dt><dd>{selectedFunnel.slug}</dd></div>
                  <div><dt>Kuvaus</dt><dd>{selectedFunnel.description || '—'}</dd></div>
                </dl>
              )}
            </section>

            <section className="funnel-steps-section">
              <div className="funnel-section-head"><div><span className="cw-eyebrow">KYSYMYKSET</span><h2>{steps.length} vaihetta</h2></div>{manageable ? <button className="cw-secondary" onClick={beginCreateStep}><Plus size={16} /> Lisää kysymys</button> : null}</div>
              {steps.length ? (
                <div className="funnel-step-list">
                  {steps.map((step, index) => (
                    <article key={step.id} className="funnel-step-card">
                      <div className="funnel-step-position">{index + 1}</div>
                      <div className="funnel-step-main">
                        <div className="funnel-step-title"><div><strong>{step.label}</strong><span>{funnelStepTypeLabel(step.type)}</span></div>{step.required ? <span className="funnel-required">Pakollinen</span> : null}</div>
                        {step.field_key ? <code>{step.field_key}</code> : null}
                        {step.description ? <p>{step.description}</p> : null}
                        {step.options.length ? <div className="funnel-option-chips">{step.options.map((option) => <span key={option.value}>{option.label} <code>{option.value}</code></span>)}</div> : null}
                      </div>
                      {manageable ? (
                        <div className="funnel-step-actions">
                          <button className="cw-icon-button" title="Siirrä ylös" disabled={busy || index === 0} onClick={() => void moveStep(index, -1)}><ArrowUp size={16} /></button>
                          <button className="cw-icon-button" title="Siirrä alas" disabled={busy || index === steps.length - 1} onClick={() => void moveStep(index, 1)}><ArrowDown size={16} /></button>
                          <button className="cw-icon-button" title="Muokkaa" disabled={busy} onClick={() => beginEditStep(step)}><Pencil size={16} /></button>
                          <button className="cw-icon-button danger" title="Poista kysymys" disabled={busy} onClick={() => void removeStep(step)}><Trash2 size={16} /></button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="funnel-step-empty"><h3>Ei kysymyksiä vielä.</h3><p>Lisää esimerkiksi postinumero, kohteen tyyppi ja yhteystiedot.</p>{manageable ? <button className="cw-primary" onClick={beginCreateStep}><Plus size={16} /> Lisää ensimmäinen kysymys</button> : null}</div>
              )}
            </section>
          </div>
        ) : (
          <div className="cw-state">Suppiloa ei löytynyt tai se ei kuulu tälle asiakkaalle.</div>
        )}

        {createOpen && manageable ? (
          <div className="cw-dialog-backdrop" onMouseDown={() => !busy && setCreateOpen(false)}>
            <form className="cw-dialog" onSubmit={submitNewFunnel} onMouseDown={(event) => event.stopPropagation()}>
              <div className="cw-dialog-head"><div><span className="cw-eyebrow">SUPPILO</span><h2>Luo suppilo</h2></div><button type="button" className="cw-icon-button" onClick={() => setCreateOpen(false)} disabled={busy}><X size={20} /></button></div>
              <div className="funnel-form">
                <label>Nimi<input required minLength={2} maxLength={160} value={funnelForm.name} onChange={(event) => setFunnelForm({ ...funnelForm, name: event.target.value })} /></label>
                <label>Palvelu<select value={funnelForm.serviceId || ''} onChange={(event) => setFunnelForm({ ...funnelForm, serviceId: event.target.value || null })}><option value="">Yleinen suppilo — ei palvelua</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
                <label className="funnel-wide">Kuvaus<textarea rows={4} maxLength={5000} value={funnelForm.description || ''} onChange={(event) => setFunnelForm({ ...funnelForm, description: event.target.value })} /></label>
              </div>
              <p className="service-slug-note">Slug luodaan automaattisesti nimestä ja pysyy vakaana myöhemmissä nimimuutoksissa.</p>
              <div className="cw-dialog-actions"><button type="button" className="cw-secondary" onClick={() => setCreateOpen(false)} disabled={busy}>Peruuta</button><button className="cw-primary" disabled={busy}>{busy ? 'Luodaan…' : 'Luo suppilo'}</button></div>
            </form>
          </div>
        ) : null}

        {stepOpen && manageable && funnelId ? (
          <div className="cw-dialog-backdrop" onMouseDown={() => !busy && setStepOpen(false)}>
            <form className="cw-dialog funnel-step-dialog" onSubmit={submitStep} onMouseDown={(event) => event.stopPropagation()}>
              <div className="cw-dialog-head"><div><span className="cw-eyebrow">KYSYMYS</span><h2>{editingStep ? 'Muokkaa kysymystä' : 'Lisää kysymys'}</h2></div><button type="button" className="cw-icon-button" onClick={() => setStepOpen(false)} disabled={busy}><X size={20} /></button></div>
              <div className="funnel-form">
                <label>Tyyppi<select value={currentStepForm.type} onChange={(event) => changeStepType(event.target.value as FunnelStepType)}>{FUNNEL_STEP_TYPES.map((type) => <option key={type} value={type}>{funnelStepTypeLabel(type)}</option>)}</select></label>
                <label>Label<input required maxLength={240} value={currentStepForm.label} onChange={(event) => setCurrentStepForm({ ...currentStepForm, label: event.target.value })} /></label>
                {!isStaticStepType(currentStepForm.type) ? <label>field_key<input required pattern="[a-z][a-z0-9_]*" maxLength={80} placeholder="property_type" value={currentStepForm.fieldKey || ''} onChange={(event) => setCurrentStepForm({ ...currentStepForm, fieldKey: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} /><small>Pysyvä koneellinen tunniste. Labelin muutos ei muuta tätä.</small></label> : null}
                {!isStaticStepType(currentStepForm.type) ? <label>Placeholder<input maxLength={240} value={currentStepForm.placeholder || ''} onChange={(event) => setCurrentStepForm({ ...currentStepForm, placeholder: event.target.value })} /></label> : null}
                <label className="funnel-wide">Kuvaus<textarea rows={3} maxLength={1000} value={currentStepForm.description || ''} onChange={(event) => setCurrentStepForm({ ...currentStepForm, description: event.target.value })} /></label>
                {!isStaticStepType(currentStepForm.type) ? <label className="funnel-required-toggle"><input type="checkbox" checked={currentStepForm.required} onChange={(event) => setCurrentStepForm({ ...currentStepForm, required: event.target.checked })} /> Pakollinen kysymys</label> : null}
              </div>

              {isChoiceStepType(currentStepForm.type) ? (
                <section className="funnel-options-editor">
                  <div className="funnel-section-head"><div><span className="cw-eyebrow">VAIHTOEHDOT</span><h3>Value + label</h3></div><button type="button" className="cw-secondary" onClick={() => setCurrentStepForm({ ...currentStepForm, options: [...currentStepForm.options, { value: '', label: '' }] })}><Plus size={15} /> Lisää vaihtoehto</button></div>
                  {currentStepForm.options.map((option, index) => (
                    <div key={`${index}-${option.value}`} className="funnel-option-row">
                      <label>Value<input required pattern="[a-z0-9]+([_-][a-z0-9]+)*" maxLength={120} placeholder="detached_house" value={option.value} onChange={(event) => updateOption(index, 'value', event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_'))} /></label>
                      <label>Label<input required maxLength={160} placeholder="Omakotitalo" value={option.label} onChange={(event) => updateOption(index, 'label', event.target.value)} /></label>
                      <button type="button" className="cw-icon-button danger" title="Poista vaihtoehto" onClick={() => removeOption(index)}><Trash2 size={16} /></button>
                    </div>
                  ))}
                  {!currentStepForm.options.length ? <p className="funnel-options-warning">Lisää vähintään yksi vaihtoehto.</p> : null}
                </section>
              ) : null}

              <div className="cw-dialog-actions"><button type="button" className="cw-secondary" onClick={() => setStepOpen(false)} disabled={busy}>Peruuta</button><button className="cw-primary" disabled={busy}>{busy ? 'Tallennetaan…' : 'Tallenna kysymys'}</button></div>
            </form>
          </div>
        ) : null}
      </div>
    </ClientWorkspaceShell>
  )
}
