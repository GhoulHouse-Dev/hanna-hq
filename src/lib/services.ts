import { supabase } from './supabase'
import type { OrganizationRole } from './clientWorkspaces'

export type ServiceStatus = 'ACTIVE' | 'INACTIVE'

export interface ClientService {
  id: string
  organization_id: string
  client_workspace_id: string
  name: string
  slug: string
  description: string | null
  short_description: string | null
  status: ServiceStatus
  created_at: string
  updated_at: string
}

export interface ClientServiceInput {
  name: string
  slug?: string
  description?: string | null
  shortDescription?: string | null
  status?: ServiceStatus
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

export function canManageService(role?: OrganizationRole | null) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'OPERATOR'
}

export function serviceStatusLabel(status: ServiceStatus) {
  return status === 'ACTIVE' ? 'Aktiivinen' : 'Ei käytössä'
}

export async function listServices(clientWorkspaceId: string) {
  return api<{ services: ClientService[] }>(`/api/services?clientWorkspaceId=${encodeURIComponent(clientWorkspaceId)}`)
}

export async function createService(clientWorkspaceId: string, input: ClientServiceInput) {
  return api<{ service: ClientService }>('/api/services', {
    method: 'POST',
    body: JSON.stringify({ clientWorkspaceId, ...input }),
  })
}

export async function updateService(clientWorkspaceId: string, id: string, input: Partial<ClientServiceInput>) {
  return api<{ service: ClientService }>('/api/services', {
    method: 'PATCH',
    body: JSON.stringify({ clientWorkspaceId, id, ...input }),
  })
}
