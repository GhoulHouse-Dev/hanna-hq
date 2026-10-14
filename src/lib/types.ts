export type Role = 'hanna' | 'jami'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3'

export interface Opportunity {
  id: string
  company_name: string
  stage: string
  priority: Priority | string | null
  last_contacted_at: string | null
  next_action: string | null
  next_action_at: string | null
  owner_id: string | null
  value_eur: number | null
  notes: string | null
  created_at?: string
}

export interface Project {
  id: string
  company_name: string
  status: string
  health: string | null
  due_date: string | null
  material_status: string | null
  next_action: string | null
  owner_id: string | null
  opportunity_id: string | null
  notes: string | null
  created_at?: string
}

export interface AdminTask {
  id: string
  title: string
  status: string
  owner_text: string | null
  target_date: string | null
  next_action: string | null
  last_verified_at: string | null
  evidence: string | null
  notes: string | null
}

export interface Shift {
  id: string
  user_id: string
  date: string
  started_at: string | null
  ended_at: string | null
  break_minutes: number | null
  planned_hours: number | null
  actual_hours: number | null
  focus: string | null
  notes: string | null
  status: string
}

export interface WeeklyMetric {
  id: string
  week_key: string
  week_start: string
  planned_hours: number | null
  actual_hours: number | null
  contacts: number | null
  conversations: number | null
  offers: number | null
  paid_customers: number | null
  active_customers: number | null
  top3_next_week: string | null
  notes: string | null
}

export interface Profile {
  id: string
  full_name: string | null
  role?: Role | string | null
}
