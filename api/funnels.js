import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { canManageFunnel } from './_lib/client-access.js'
import {
  funnelCreateSchema,
  funnelUpdateSchema,
  nullable,
  slugifyFunnel,
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

function funnelFields() {
  return 'id,organization_id,client_workspace_id,service_id,name,slug,description,status,created_at,updated_at'
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

async function accessibleService(supabase, workspace, serviceId) {
  if (serviceId == null) return null
  const { data, error } = await supabase
    .from('services')
    .select('id,organization_id,client_workspace_id,name')
    .eq('id', serviceId)
    .eq('organization_id', workspace.organization_id)
    .eq('client_workspace_id', workspace.id)
    .maybeSingle()

  if (error) throw error
  if (!data) throw Object.assign(new Error('Valittu palvelu ei kuulu tälle asiakkaalle.'), { status: 400 })
  return data
}

function handleDatabaseError(error) {
  if (error?.code === '23505') {
    throw Object.assign(new Error('Tällä asiakkaalla on jo suppilo samalla slugilla.'), { status: 409 })
  }
  if (error?.code === '23503') {
    throw Object.assign(new Error('Suppilon asiakas- tai palveluliitos ei ole kelvollinen.'), { status: 400 })
  }
  if (error?.code === '42501') {
    throw Object.assign(new Error('Käyttöoikeus ei riitä tähän toimintoon.'), { status: 403 })
  }
  throw error
}

async function withQuestionCounts(supabase, funnels) {
  if (!funnels.length) return []
  const funnelIds = funnels.map((funnel) => funnel.id)
  const { data, error } = await supabase
    .from('funnel_steps')
    .select('funnel_id')
    .in('funnel_id', funnelIds)

  if (error) throw error
  const counts = new Map()
  for (const row of data || []) counts.set(row.funnel_id, (counts.get(row.funnel_id) || 0) + 1)
  return funnels.map((funnel) => ({ ...funnel, question_count: counts.get(funnel.id) || 0 }))
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
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
      const parsedWorkspaceId = z.string().uuid().safeParse(req.query?.clientWorkspaceId)
      if (!parsedWorkspaceId.success) return res.status(400).json({ error: 'Virheellinen asiakas-ID.' })

      const workspace = await accessibleWorkspace(supabase, parsedWorkspaceId.data)
      const { data, error } = await supabase
        .from('funnels')
        .select(funnelFields())
        .eq('client_workspace_id', workspace.id)
        .eq('organization_id', workspace.organization_id)
        .order('status', { ascending: true })
        .order('name', { ascending: true })

      if (error) handleDatabaseError(error)
      return res.status(200).json({ funnels: await withQuestionCounts(supabase, data || []) })
    }

    const input = req.method === 'POST'
      ? funnelCreateSchema.parse(req.body || {})
      : funnelUpdateSchema.parse(req.body || {})

    const workspace = await accessibleWorkspace(supabase, input.clientWorkspaceId)
    const role = await membershipRole(supabase, user.id, workspace.organization_id)
    if (!canManageFunnel(role)) {
      return res.status(403).json({ error: 'VIEWER ei voi muokata suppiloita.' })
    }

    if (req.method === 'POST') {
      await accessibleService(supabase, workspace, input.serviceId ?? null)
      const slug = input.slug || slugifyFunnel(input.name)
      if (!slug) return res.status(400).json({ error: 'Suppilon nimestä ei voitu muodostaa slugia.' })

      const { data, error } = await supabase
        .from('funnels')
        .insert({
          organization_id: workspace.organization_id,
          client_workspace_id: workspace.id,
          service_id: input.serviceId ?? null,
          name: input.name,
          slug,
          description: nullable(input.description),
          status: input.status,
        })
        .select(funnelFields())
        .single()

      if (error) handleDatabaseError(error)
      return res.status(201).json({ funnel: { ...data, question_count: 0 } })
    }

    const { data: current, error: currentError } = await supabase
      .from('funnels')
      .select(funnelFields())
      .eq('id', input.id)
      .eq('client_workspace_id', workspace.id)
      .eq('organization_id', workspace.organization_id)
      .maybeSingle()

    if (currentError) handleDatabaseError(currentError)
    if (!current) return res.status(404).json({ error: 'Suppiloa ei löytynyt.' })

    if (input.serviceId !== undefined) await accessibleService(supabase, workspace, input.serviceId)

    const patch = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.slug !== undefined) patch.slug = input.slug
    if (input.description !== undefined) patch.description = nullable(input.description)
    if (input.status !== undefined) patch.status = input.status
    if (input.serviceId !== undefined) patch.service_id = input.serviceId

    if (!Object.keys(patch).length) return res.status(200).json({ funnel: current })

    const { data, error } = await supabase
      .from('funnels')
      .update(patch)
      .eq('id', current.id)
      .eq('client_workspace_id', workspace.id)
      .eq('organization_id', workspace.organization_id)
      .select(funnelFields())
      .single()

    if (error) handleDatabaseError(error)
    return res.status(200).json({ funnel: data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Suppilon tiedoissa on virhe.', issues: error.issues })
    }
    const status = Number(error?.status) || 500
    return res.status(status).json({ error: error instanceof Error ? error.message : 'Tuntematon virhe' })
  }
}
