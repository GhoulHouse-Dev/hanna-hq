import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { canManageService } from './_lib/client-access.js'

const slugSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120)
const nullableDescription = z.union([z.string().trim().max(5000), z.literal(''), z.null()]).optional()
const nullableShortDescription = z.union([z.string().trim().max(240), z.literal(''), z.null()]).optional()

const createSchema = z.object({
  clientWorkspaceId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  slug: slugSchema.optional(),
  description: nullableDescription,
  shortDescription: nullableShortDescription,
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
})

const updateSchema = createSchema
  .omit({ clientWorkspaceId: true })
  .partial()
  .extend({
    id: z.string().uuid(),
    clientWorkspaceId: z.string().uuid(),
  })

function serverSupabase(authorization) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase-palvelinasetukset puuttuvat')

  return createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function nullable(value) {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed : null
}

function serviceFields() {
  return 'id,organization_id,client_workspace_id,name,slug,description,short_description,status,created_at,updated_at'
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

function handleDatabaseError(error) {
  if (error?.code === '23505') {
    throw Object.assign(new Error('Tällä asiakkaalla on jo palvelu samalla slugilla.'), { status: 409 })
  }
  if (error?.code === '42501') {
    throw Object.assign(new Error('Käyttöoikeus ei riitä tähän toimintoon.'), { status: 403 })
  }
  throw error
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

      await accessibleWorkspace(supabase, parsedWorkspaceId.data)

      const { data, error } = await supabase
        .from('services')
        .select(serviceFields())
        .eq('client_workspace_id', parsedWorkspaceId.data)
        .order('status', { ascending: true })
        .order('name', { ascending: true })

      if (error) handleDatabaseError(error)
      return res.status(200).json({ services: data || [] })
    }

    const input = req.method === 'POST'
      ? createSchema.parse(req.body || {})
      : updateSchema.parse(req.body || {})

    const workspace = await accessibleWorkspace(supabase, input.clientWorkspaceId)
    const role = await membershipRole(supabase, user.id, workspace.organization_id)
    if (!canManageService(role)) {
      return res.status(403).json({ error: 'VIEWER ei voi muokata palveluita.' })
    }

    if (req.method === 'POST') {
      const slug = input.slug || slugify(input.name)
      if (!slug) return res.status(400).json({ error: 'Palvelun nimestä ei voitu muodostaa slugia.' })

      const { data, error } = await supabase
        .from('services')
        .insert({
          organization_id: workspace.organization_id,
          client_workspace_id: workspace.id,
          name: input.name,
          slug,
          description: nullable(input.description),
          short_description: nullable(input.shortDescription),
          status: input.status,
        })
        .select(serviceFields())
        .single()

      if (error) handleDatabaseError(error)
      return res.status(201).json({ service: data })
    }

    const { data: current, error: currentError } = await supabase
      .from('services')
      .select(serviceFields())
      .eq('id', input.id)
      .eq('client_workspace_id', workspace.id)
      .maybeSingle()

    if (currentError) handleDatabaseError(currentError)
    if (!current) return res.status(404).json({ error: 'Palvelua ei löytynyt.' })

    const patch = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.slug !== undefined) patch.slug = input.slug
    if (input.description !== undefined) patch.description = nullable(input.description)
    if (input.shortDescription !== undefined) patch.short_description = nullable(input.shortDescription)
    if (input.status !== undefined) patch.status = input.status

    if (!Object.keys(patch).length) return res.status(200).json({ service: current })

    const { data, error } = await supabase
      .from('services')
      .update(patch)
      .eq('id', current.id)
      .eq('client_workspace_id', workspace.id)
      .select(serviceFields())
      .single()

    if (error) handleDatabaseError(error)
    return res.status(200).json({ service: data })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Palvelun tiedoissa on virhe.', issues: error.issues })
    }
    const status = Number(error?.status) || 500
    return res.status(status).json({ error: error instanceof Error ? error.message : 'Tuntematon virhe' })
  }
}
