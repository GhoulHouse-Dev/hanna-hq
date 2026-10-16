import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { canManageFunnel } from './_lib/client-access.js'
import {
  STATIC_STEP_TYPES,
  funnelStepCreateSchema,
  funnelStepDeleteSchema,
  funnelStepUpdateSchema,
  nullable,
  validateUpdatedStep,
} from './_lib/funnel-validation.js'

function serverSupabase(authorization) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase-palvelinasetukset puuttuvat')

  return createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function stepFields() {
  return 'id,organization_id,client_workspace_id,funnel_id,field_key,type,label,description,placeholder,required,position,options,created_at,updated_at'
}

async function requireUser(supabase) {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw Object.assign(new Error('Kirjautuminen vaaditaan'), { status: 401 })
  return data.user
}

async function accessibleWorkspace(supabase, clientWorkspaceId) {
  const { data, error } = await supabase
    .from('client_workspaces')
    .select('id,organization_id,company_name')
    .eq('id', clientWorkspaceId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw Object.assign(new Error('Asiakasta ei löytynyt.'), { status: 404 })
  return data
}

async function accessibleFunnel(supabase, workspace, funnelId) {
  const { data, error } = await supabase
    .from('funnels')
    .select('id,organization_id,client_workspace_id,name,status')
    .eq('id', funnelId)
    .eq('organization_id', workspace.organization_id)
    .eq('client_workspace_id', workspace.id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw Object.assign(new Error('Suppiloa ei löytynyt.'), { status: 404 })
  return data
}

async function membershipRole(supabase, userId, organizationId) {
  const { data, error } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) throw error
  return data?.role || null
}

function handleDatabaseError(error) {
  if (error?.code === '23505') {
    throw Object.assign(new Error('Tässä suppilossa on jo sama field_key.'), { status: 409 })
  }
  if (error?.code === '23503') {
    throw Object.assign(new Error('Kysymyksen suppilo- tai asiakasliitos ei ole kelvollinen.'), { status: 400 })
  }
  if (error?.code === '23514') {
    throw Object.assign(new Error('Kysymyksen rakenne ei täytä tietokannan validointia.'), { status: 400 })
  }
  if (error?.code === '42501') {
    throw Object.assign(new Error('Käyttöoikeus ei riitä tähän toimintoon.'), { status: 403 })
  }
  throw error
}

function stepPayload(input, workspace, funnel) {
  const isStatic = STATIC_STEP_TYPES.has(input.type)
  return {
    organization_id: workspace.organization_id,
    client_workspace_id: workspace.id,
    funnel_id: funnel.id,
    field_key: isStatic ? null : input.fieldKey,
    type: input.type,
    label: input.label,
    description: nullable(input.description),
    placeholder: nullable(input.placeholder),
    required: isStatic ? false : input.required,
    position: input.position,
    options: input.options || [],
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authorization = req.headers.authorization || ''
  if (!authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Kirjautuminen vaaditaan' })
  }

  try {
    const supabase = serverSupabase(authorization)
    const user = await requireUser(supabase)

    if (req.method === 'GET') {
      const workspaceId = z.string().uuid().safeParse(req.query?.clientWorkspaceId)
      const funnelId = z.string().uuid().safeParse(req.query?.funnelId)
      if (!workspaceId.success || !funnelId.success) {
        return res.status(400).json({ error: 'Virheellinen asiakas- tai suppilo-ID.' })
      }

      const workspace = await accessibleWorkspace(supabase, workspaceId.data)
      const funnel = await accessibleFunnel(supabase, workspace, funnelId.data)
      const { data, error } = await supabase
        .from('funnel_steps')
        .select(stepFields())
        .eq('funnel_id', funnel.id)
        .eq('client_workspace_id', workspace.id)
        .eq('organization_id', workspace.organization_id)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) handleDatabaseError(error)
      return res.status(200).json({ steps: data || [] })
    }

    const input = req.method === 'POST'
      ? funnelStepCreateSchema.parse(req.body || {})
      : req.method === 'PATCH'
        ? funnelStepUpdateSchema.parse(req.body || {})
        : funnelStepDeleteSchema.parse(req.body || {})

    const workspace = await accessibleWorkspace(supabase, input.clientWorkspaceId)
    const funnel = await accessibleFunnel(supabase, workspace, input.funnelId)
    const role = await membershipRole(supabase, user.id, workspace.organization_id)
    if (!canManageFunnel(role)) {
      return res.status(403).json({ error: 'VIEWER ei voi muokata suppilon kysymyksiä.' })
    }

    if (req.method === 'POST') {
      const { data, error } = await supabase
        .from('funnel_steps')
        .insert(stepPayload(input, workspace, funnel))
        .select(stepFields())
        .single()

      if (error) handleDatabaseError(error)
      return res.status(201).json({ step: data })
    }

    const { data: current, error: currentError } = await supabase
      .from('funnel_steps')
      .select(stepFields())
      .eq('id', input.id)
      .eq('funnel_id', funnel.id)
      .eq('client_workspace_id', workspace.id)
      .eq('organization_id', workspace.organization_id)
      .maybeSingle()

    if (currentError) handleDatabaseError(currentError)
    if (!current) return res.status(404).json({ error: 'Kysymystä ei löytynyt.' })

    if (req.method === 'DELETE') {
      const { error } = await supabase
        .from('funnel_steps')
        .delete()
        .eq('id', current.id)
        .eq('funnel_id', funnel.id)
        .eq('client_workspace_id', workspace.id)
        .eq('organization_id', workspace.organization_id)

      if (error) handleDatabaseError(error)
      return res.status(200).json({ deleted: true })
    }

    const validated = validateUpdatedStep(current, input)
    const patch = {}
    if (input.fieldKey !== undefined || input.type !== undefined) {
      patch.field_key = STATIC_STEP_TYPES.has(validated.type) ? null : validated.fieldKey
    }
    if (input.type !== undefined) patch.type = validated.type
    if (input.label !== undefined) patch.label = validated.label
    if (input.description !== undefined) patch.description = nullable(validated.description)
    if (input.placeholder !== undefined) patch.placeholder = nullable(validated.placeholder)
    if (input.required !== undefined || input.type !== undefined) patch.required = STATIC_STEP_TYPES.has(validated.type) ? false : validated.required
    if (input.position !== undefined) patch.position = validated.position
    if (input.options !== undefined || input.type !== undefined) patch.options = validated.options

    if (!Object.keys(patch).length) return res.status(200).json({ step: current })

    const { data, error } = await supabase
      .from('funnel_steps')
      .update(patch)
      .eq('id', current.id)
      .eq('funnel_id', funnel.id)
      .eq('client_workspace_id', workspace.id)
      .eq('organization_id', workspace.organization_id)
      .select(stepFields())
      .single()

    if (error) handleDatabaseError(error)
    return res.status(200).json({ step: data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Kysymyksen tiedoissa on virhe.', issues: error.issues })
    }
    const status = Number(error?.status) || 500
    return res.status(status).json({ error: error instanceof Error ? error.message : 'Tuntematon virhe' })
  }
}
