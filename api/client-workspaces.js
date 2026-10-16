import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { canCreateClientWorkspace, canEditClientWorkspace, isOrganizationRole } from './_lib/client-access.js'

const nullableText = z.string().trim().max(500).nullable().optional()
const nullableEmail = z.union([z.string().trim().email(), z.literal(''), z.null()]).optional()
const nullableUrl = z.union([z.string().trim().url(), z.literal(''), z.null()]).optional()

const createSchema = z.object({
  organizationId: z.string().uuid(),
  companyName: z.string().trim().min(2).max(160),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).optional(),
  businessId: nullableText,
  industry: nullableText,
  website: nullableUrl,
  phone: nullableText,
  email: nullableEmail,
  city: nullableText,
  serviceArea: nullableText,
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).default('ACTIVE'),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default('EUR'),
  timezone: z.string().trim().min(1).max(100).default('Europe/Helsinki'),
})

const updateSchema = createSchema
  .omit({ organizationId: true })
  .partial()
  .extend({ id: z.string().uuid() })

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

function toDatabasePayload(input) {
  return {
    company_name: input.companyName,
    slug: input.slug || slugify(input.companyName),
    business_id: nullable(input.businessId),
    industry: nullable(input.industry),
    website: nullable(input.website),
    phone: nullable(input.phone),
    email: nullable(input.email),
    city: nullable(input.city),
    service_area: nullable(input.serviceArea),
    status: input.status,
    currency: input.currency,
    timezone: input.timezone,
  }
}

function toPatch(input) {
  const patch = {}
  if (input.companyName !== undefined) patch.company_name = input.companyName
  if (input.slug !== undefined) patch.slug = input.slug || slugify(input.companyName || '')
  if (input.businessId !== undefined) patch.business_id = nullable(input.businessId)
  if (input.industry !== undefined) patch.industry = nullable(input.industry)
  if (input.website !== undefined) patch.website = nullable(input.website)
  if (input.phone !== undefined) patch.phone = nullable(input.phone)
  if (input.email !== undefined) patch.email = nullable(input.email)
  if (input.city !== undefined) patch.city = nullable(input.city)
  if (input.serviceArea !== undefined) patch.service_area = nullable(input.serviceArea)
  if (input.status !== undefined) patch.status = input.status
  if (input.currency !== undefined) patch.currency = input.currency
  if (input.timezone !== undefined) patch.timezone = input.timezone
  return patch
}

async function requireUser(supabase) {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw Object.assign(new Error('Kirjautuminen vaaditaan'), { status: 401 })
  return data.user
}

async function membershipsForUser(supabase, userId) {
  const { data, error } = await supabase
    .from('organization_memberships')
    .select('organization_id,role')
    .eq('user_id', userId)

  if (error) throw error

  const rows = (data || []).filter((row) => isOrganizationRole(row.role))
  if (!rows.length) return []

  const organizationIds = rows.map((row) => row.organization_id)
  const { data: organizations, error: organizationError } = await supabase
    .from('organizations')
    .select('id,name,slug')
    .in('id', organizationIds)

  if (organizationError) throw organizationError
  const organizationById = new Map((organizations || []).map((organization) => [organization.id, organization]))

  return rows.map((row) => {
    const organization = organizationById.get(row.organization_id)
    return {
      organizationId: row.organization_id,
      organizationName: organization?.name || 'Organisaatio',
      organizationSlug: organization?.slug || null,
      role: row.role,
    }
  })
}

function membershipForOrganization(memberships, organizationId) {
  return memberships.find((membership) => membership.organizationId === organizationId) || null
}

function clientFields() {
  return 'id,organization_id,company_name,slug,business_id,industry,website,phone,email,city,service_area,status,currency,timezone,created_at,updated_at'
}

function handleDatabaseError(error) {
  if (error?.code === '23505') {
    throw Object.assign(new Error('Samalla organisaatiolla on jo asiakas tällä slugilla.'), { status: 409 })
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
    const memberships = await membershipsForUser(supabase, user.id)

    if (!memberships.length) {
      return res.status(403).json({ error: 'Käyttäjää ei ole liitetty organisaatioon.' })
    }

    if (req.method === 'GET') {
      const id = typeof req.query?.id === 'string' ? req.query.id : null

      if (id) {
        const parsedId = z.string().uuid().safeParse(id)
        if (!parsedId.success) return res.status(400).json({ error: 'Virheellinen asiakas-ID.' })

        const { data, error } = await supabase
          .from('client_workspaces')
          .select(clientFields())
          .eq('id', parsedId.data)
          .maybeSingle()

        if (error) handleDatabaseError(error)
        if (!data) return res.status(404).json({ error: 'Asiakasta ei löytynyt.' })

        const access = membershipForOrganization(memberships, data.organization_id)
        if (!access) return res.status(404).json({ error: 'Asiakasta ei löytynyt.' })

        return res.status(200).json({ client: data, access })
      }

      const organizationIds = memberships.map((membership) => membership.organizationId)
      const { data, error } = await supabase
        .from('client_workspaces')
        .select(clientFields())
        .in('organization_id', organizationIds)
        .order('status', { ascending: true })
        .order('company_name', { ascending: true })

      if (error) handleDatabaseError(error)
      return res.status(200).json({ clients: data || [], memberships })
    }

    if (req.method === 'POST') {
      const input = createSchema.parse(req.body || {})
      const membership = membershipForOrganization(memberships, input.organizationId)

      if (!membership || !canCreateClientWorkspace(membership.role)) {
        return res.status(403).json({ error: 'Vain OWNER tai ADMIN voi luoda asiakasyrityksen.' })
      }

      const payload = {
        organization_id: input.organizationId,
        ...toDatabasePayload(input),
      }
      if (!payload.slug) return res.status(400).json({ error: 'Yrityksen nimestä ei voitu muodostaa slugia.' })

      const { data, error } = await supabase
        .from('client_workspaces')
        .insert(payload)
        .select(clientFields())
        .single()

      if (error) handleDatabaseError(error)
      return res.status(201).json({ client: data, access: membership })
    }

    const input = updateSchema.parse(req.body || {})
    const { data: current, error: currentError } = await supabase
      .from('client_workspaces')
      .select(clientFields())
      .eq('id', input.id)
      .maybeSingle()

    if (currentError) handleDatabaseError(currentError)
    if (!current) return res.status(404).json({ error: 'Asiakasta ei löytynyt.' })

    const membership = membershipForOrganization(memberships, current.organization_id)
    if (!membership || !canEditClientWorkspace(membership.role)) {
      return res.status(403).json({ error: 'VIEWER ei voi muokata asiakasyrityksiä.' })
    }

    const patch = toPatch(input)
    if (!Object.keys(patch).length) return res.status(200).json({ client: current, access: membership })

    const { data, error } = await supabase
      .from('client_workspaces')
      .update(patch)
      .eq('id', input.id)
      .select(clientFields())
      .single()

    if (error) handleDatabaseError(error)
    return res.status(200).json({ client: data, access: membership })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Asiakkaan tiedoissa on virhe.', issues: error.issues })
    }
    const status = Number(error?.status) || 500
    return res.status(status).json({ error: error instanceof Error ? error.message : 'Tuntematon virhe' })
  }
}
