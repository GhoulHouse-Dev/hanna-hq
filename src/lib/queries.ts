import { supabase } from './supabase'
import type { AdminTask, Opportunity, Project, Shift, WeeklyMetric } from './types'
import { localDateKey } from './format'

function unwrap<T>(data: T | null, error: { message?: string } | null): T {
  if (error) throw new Error(error.message || 'Tietojen haku epäonnistui')
  if (data == null) throw new Error('Tietoja ei saatu')
  return data
}

function toUiShift(row: Shift): Shift {
  const statusMap: Record<string, string> = {
    planned: 'Suunniteltu',
    running: 'Käynnissä',
    done: 'Valmis',
  }
  return { ...row, status: statusMap[row.status] ?? row.status }
}

export async function getOpportunities() {
  const { data, error } = await supabase.from('opportunities').select('*').order('next_action_at', { ascending: true, nullsFirst: false })
  return unwrap((data ?? []) as Opportunity[], error)
}

export async function getProjects() {
  const { data, error } = await supabase.from('projects').select('*').order('due_date', { ascending: true, nullsFirst: false })
  return unwrap((data ?? []) as Project[], error)
}

export async function getProject(id: string) {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).single()
  return unwrap(data as Project | null, error)
}

export async function getAdminTasks() {
  const { data, error } = await supabase.from('admin_tasks').select('*').order('target_date', { ascending: true, nullsFirst: false })
  return unwrap((data ?? []) as AdminTask[], error)
}

export async function getShifts() {
  const { data, error } = await supabase.from('shifts').select('*').order('date', { ascending: false }).limit(60)
  const rows = unwrap((data ?? []) as Shift[], error)
  return rows.map(toUiShift)
}

export async function getWeeklyMetrics() {
  const { data, error } = await supabase.from('weekly_metrics').select('*').order('week_start', { ascending: false }).limit(26)
  return unwrap((data ?? []) as WeeklyMetric[], error)
}

export async function updateOpportunity(id: string, patch: Partial<Opportunity>) {
  const normalizedPatch = {
    ...patch,
    ...(patch.next_action_at !== undefined
      ? { next_action_at: patch.next_action_at ? patch.next_action_at.slice(0, 10) : null }
      : {}),
  }
  const { data, error } = await supabase.from('opportunities').update(normalizedPatch).eq('id', id).select('*').single()
  return unwrap(data as Opportunity | null, error)
}

export async function updateProject(id: string, patch: Partial<Project>) {
  const { data, error } = await supabase.from('projects').update(patch).eq('id', id).select('*').single()
  return unwrap(data as Project | null, error)
}

export async function updateAdminTask(id: string, patch: Partial<AdminTask>) {
  const { data, error } = await supabase.from('admin_tasks').update(patch).eq('id', id).select('*').single()
  return unwrap(data as AdminTask | null, error)
}

export async function updateWeeklyMetric(id: string, patch: Partial<WeeklyMetric>) {
  const { data, error } = await supabase.from('weekly_metrics').update(patch).eq('id', id).select('*').single()
  return unwrap(data as WeeklyMetric | null, error)
}

export async function startShift(plannedHours = 3, focus = '') {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  const userId = authData.user?.id
  if (!userId) throw new Error('Kirjaudu sisään aloittaaksesi työvuoron')

  const today = localDateKey()
  const { data: existing, error: existingError } = await supabase.from('shifts').select('*').eq('user_id', userId).eq('date', today).maybeSingle()
  if (existingError) throw new Error(existingError.message)

  if (existing) {
    const { data, error } = await supabase.from('shifts').update({
      started_at: new Date().toISOString(),
      ended_at: null,
      actual_hours: null,
      status: 'running',
      planned_hours: plannedHours,
      focus,
    }).eq('id', existing.id).select('*').single()
    return toUiShift(unwrap(data as Shift | null, error))
  }

  const { data, error } = await supabase.from('shifts').insert({
    user_id: userId,
    date: today,
    started_at: new Date().toISOString(),
    planned_hours: plannedHours,
    focus,
    status: 'running',
    break_minutes: 0,
  }).select('*').single()
  return toUiShift(unwrap(data as Shift | null, error))
}

export async function endShift(shift: Shift, breakMinutes = shift.break_minutes ?? 0) {
  if (!shift.started_at) throw new Error('Työvuorolta puuttuu aloitusaika')
  const endedAt = new Date()
  const startedAt = new Date(shift.started_at)
  const grossHours = Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 3_600_000)
  const actualHours = Math.max(0, grossHours - breakMinutes / 60)
  const { data, error } = await supabase.from('shifts').update({
    ended_at: endedAt.toISOString(),
    break_minutes: breakMinutes,
    actual_hours: Number(actualHours.toFixed(2)),
    status: 'done',
  }).eq('id', shift.id).select('*').single()
  return toUiShift(unwrap(data as Shift | null, error))
}

export async function logActivity(input: {
  entityType: 'opportunity' | 'project' | 'admin_task' | 'shift'
  entityId: string
  actionType: string
  summary: string
  metadata?: Record<string, unknown>
}) {
  const { data: authData } = await supabase.auth.getUser()
  const userId: string | null = authData.user?.id ?? null
  const { error } = await supabase.from('activities').insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    user_id: userId,
    action_type: input.actionType,
    summary: input.summary,
    metadata: input.metadata ?? {},
  })
  if (error) throw new Error(error.message)
}
