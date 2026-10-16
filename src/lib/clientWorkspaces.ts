import { supabase } from './supabase'

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER'
export type ClientWorkspaceStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED'

export interface OrganizationAccess {
  organizationId: string
  organizationName: string
  organizationSlug: string | null
  role: OrganizationRole
}

export interface ClientWorkspace {
  id: string
  organization_id: string
  company_name: string
  slug: string
  business_id: string | null
  industry: string | null
  website: string | null
  phone: string | null
  email: string | null
  city: string | null
  service_area: string | null
  status: ClientWorkspaceStatus
  currency: string
  timezone: string
  created_at: string
  updated_at: string
}

export interface ClientWorkspaceInput {
  companyName: string
  slug?: string
  businessId?: string | null
  industry?: string | null
  website?: string | null
  phone?: string | null
  email?: string | null
  city?: string | null
  serviceArea?: string | null
  status?: ClientWorkspaceStatus
  currency?: string
  timezone?: string
}

async function accessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('Kirjautuminen vaaditaan')
  return token
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken()
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Pyyntö epäonnistui')
  return payload as T
}

export function canCreateClient(role?: OrganizationRole | null) {
  return role === 'OWNER' || role === 'ADMIN'
}

export function canEditClient(role?: OrganizationRole | null) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'OPERATOR'
}

export function workspaceStatusLabel(status: ClientWorkspaceStatus) {
  if (status === 'ACTIVE') return 'Aktiivinen'
  if (status === 'PAUSED') return 'Pausetettu'
  return 'Arkistoitu'
}

export async function listClientWorkspaces() {
  return api<{ clients: ClientWorkspace[]; memberships: OrganizationAccess[] }>('/api/client-workspaces')
}

export async function getClientWorkspace(id: string) {
  return api<{ client: ClientWorkspace; access: OrganizationAccess }>(`/api/client-workspaces?id=${encodeURIComponent(id)}`)
}

export async function createClientWorkspace(organizationId: string, input: ClientWorkspaceInput) {
  return api<{ client: ClientWorkspace; access: OrganizationAccess }>('/api/client-workspaces', {
    method: 'POST',
    body: JSON.stringify({ organizationId, ...input }),
  })
}

export async function updateClientWorkspace(id: string, input: Partial<ClientWorkspaceInput>) {
  return api<{ client: ClientWorkspace; access: OrganizationAccess }>('/api/client-workspaces', {
    method: 'PATCH',
    body: JSON.stringify({ id, ...input }),
  })
}
