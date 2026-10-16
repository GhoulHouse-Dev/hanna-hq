import { supabase } from './supabase'
import type { OrganizationRole } from './clientWorkspaces'

export type FunnelStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED'
export type FunnelStepType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'EMAIL'
  | 'PHONE'
  | 'NUMBER'
  | 'SELECT'
  | 'RADIO'
  | 'MULTISELECT'
  | 'BOOLEAN'
  | 'POSTAL_CODE'
  | 'DATE'
  | 'HEADING'
  | 'INFO'

export interface FunnelOption {
  value: string
  label: string
}

export interface ClientFunnel {
  id: string
  organization_id: string
  client_workspace_id: string
  service_id: string | null
  name: string
  slug: string
  description: string | null
  status: FunnelStatus
  created_at: string
  updated_at: string
  question_count?: number
}

export interface FunnelInput {
  serviceId?: string | null
  name: string
  slug?: string
  description?: string | null
  status?: FunnelStatus
}

export interface FunnelStep {
  id: string
  organization_id: string
  client_workspace_id: string
  funnel_id: string
  field_key: string | null
  type: FunnelStepType
  label: string
  description: string | null
  placeholder: string | null
  required: boolean
  position: number
  options: FunnelOption[]
  created_at: string
  updated_at: string
}

export interface FunnelStepInput {
  fieldKey?: string | null
  type: FunnelStepType
  label: string
  description?: string | null
  placeholder?: string | null
  required: boolean
  position: number
  options: FunnelOption[]
}

export const FUNNEL_STEP_TYPES: FunnelStepType[] = [
  'TEXT',
  'TEXTAREA',
  'EMAIL',
  'PHONE',
  'NUMBER',
  'SELECT',
  'RADIO',
  'MULTISELECT',
  'BOOLEAN',
  'POSTAL_CODE',
  'DATE',
  'HEADING',
  'INFO',
]

export function isChoiceStepType(type: FunnelStepType) {
  return type === 'SELECT' || type === 'RADIO' || type === 'MULTISELECT'
}

export function isStaticStepType(type: FunnelStepType) {
  return type === 'HEADING' || type === 'INFO'
}

export function canManageFunnel(role?: OrganizationRole | null) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'OPERATOR'
}

export function funnelStatusLabel(status: FunnelStatus) {
  if (status === 'ACTIVE') return 'Aktiivinen'
  if (status === 'PAUSED') return 'Pausetettu'
  return 'Luonnos'
}

export function funnelStepTypeLabel(type: FunnelStepType) {
  const labels: Record<FunnelStepType, string> = {
    TEXT: 'Teksti',
    TEXTAREA: 'Pitkä teksti',
    EMAIL: 'Sähköposti',
    PHONE: 'Puhelin',
    NUMBER: 'Numero',
    SELECT: 'Valikko',
    RADIO: 'Yksi valinta',
    MULTISELECT: 'Monivalinta',
    BOOLEAN: 'Kyllä / ei',
    POSTAL_CODE: 'Postinumero',
    DATE: 'Päivämäärä',
    HEADING: 'Otsikko',
    INFO: 'Infoteksti',
  }
  return labels[type]
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

export async function listFunnels(clientWorkspaceId: string) {
  return api<{ funnels: ClientFunnel[] }>(`/api/funnels?clientWorkspaceId=${encodeURIComponent(clientWorkspaceId)}`)
}

export async function createFunnel(clientWorkspaceId: string, input: FunnelInput) {
  return api<{ funnel: ClientFunnel }>('/api/funnels', {
    method: 'POST',
    body: JSON.stringify({ clientWorkspaceId, ...input }),
  })
}

export async function updateFunnel(clientWorkspaceId: string, id: string, input: Partial<FunnelInput>) {
  return api<{ funnel: ClientFunnel }>('/api/funnels', {
    method: 'PATCH',
    body: JSON.stringify({ clientWorkspaceId, id, ...input }),
  })
}

export async function listFunnelSteps(clientWorkspaceId: string, funnelId: string) {
  return api<{ steps: FunnelStep[] }>(`/api/funnel-steps?clientWorkspaceId=${encodeURIComponent(clientWorkspaceId)}&funnelId=${encodeURIComponent(funnelId)}`)
}

export async function createFunnelStep(clientWorkspaceId: string, funnelId: string, input: FunnelStepInput) {
  return api<{ step: FunnelStep }>('/api/funnel-steps', {
    method: 'POST',
    body: JSON.stringify({ clientWorkspaceId, funnelId, ...input }),
  })
}

export async function updateFunnelStep(clientWorkspaceId: string, funnelId: string, id: string, input: Partial<FunnelStepInput>) {
  return api<{ step: FunnelStep }>('/api/funnel-steps', {
    method: 'PATCH',
    body: JSON.stringify({ clientWorkspaceId, funnelId, id, ...input }),
  })
}

export async function deleteFunnelStep(clientWorkspaceId: string, funnelId: string, id: string) {
  return api<{ deleted: true }>('/api/funnel-steps', {
    method: 'DELETE',
    body: JSON.stringify({ clientWorkspaceId, funnelId, id }),
  })
}
