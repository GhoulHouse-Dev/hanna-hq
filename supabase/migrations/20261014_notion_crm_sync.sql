-- Notion CRM mirror for Hanna HQ.
-- Notion owns CRM identity/context. Hanna HQ keeps execution-only task metadata.

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text not null unique,
  notion_url text,
  company_name text not null,
  business_id text,
  city text,
  email text,
  industry text,
  lead_source text,
  notes text,
  phone text,
  status text,
  company_type text,
  website text,
  notion_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  notion_page_id text not null unique,
  notion_url text,
  notion_company_page_id text,
  contact_name text not null,
  email text,
  phone text,
  role_text text,
  linkedin_url text,
  decision_maker boolean not null default false,
  status text,
  notes text,
  notion_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.opportunities
  add column if not exists notion_page_id text,
  add column if not exists notion_url text,
  add column if not exists notion_company_page_id text,
  add column if not exists service text,
  add column if not exists offer_url text,
  add column if not exists demo_url text,
  add column if not exists research_summary text,
  add column if not exists notion_synced_at timestamptz;

alter table public.projects
  add column if not exists notion_page_id text,
  add column if not exists notion_url text,
  add column if not exists notion_company_page_id text,
  add column if not exists notion_opportunity_page_id text,
  add column if not exists start_date date,
  add column if not exists project_value_eur numeric,
  add column if not exists notion_synced_at timestamptz;

create unique index if not exists opportunities_notion_page_id_uq
  on public.opportunities (notion_page_id)
  where notion_page_id is not null;

create unique index if not exists projects_notion_page_id_uq
  on public.projects (notion_page_id)
  where notion_page_id is not null;

create index if not exists contacts_notion_company_page_id_idx
  on public.contacts (notion_company_page_id);

create index if not exists opportunities_notion_company_page_id_idx
  on public.opportunities (notion_company_page_id);

create index if not exists projects_notion_company_page_id_idx
  on public.projects (notion_company_page_id);

create table if not exists public.crm_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'notion',
  status text not null check (status in ('running', 'success', 'error')),
  triggered_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  companies_seen integer not null default 0,
  contacts_seen integer not null default 0,
  opportunities_seen integer not null default 0,
  projects_seen integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists crm_sync_runs_started_at_idx
  on public.crm_sync_runs (started_at desc);

alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.crm_sync_runs enable row level security;

drop policy if exists "CRM companies readable by Hanna and Jami" on public.companies;
create policy "CRM companies readable by Hanna and Jami"
on public.companies for select to authenticated
using (exists (
  select 1 from public.user_roles ur
  where ur.user_id = auth.uid() and ur.role::text in ('hanna', 'jami')
));

drop policy if exists "CRM companies writable by Jami" on public.companies;
create policy "CRM companies writable by Jami"
on public.companies for all to authenticated
using (exists (
  select 1 from public.user_roles ur
  where ur.user_id = auth.uid() and ur.role::text = 'jami'
))
with check (exists (
  select 1 from public.user_roles ur
  where ur.user_id = auth.uid() and ur.role::text = 'jami'
));

drop policy if exists "CRM contacts readable by Hanna and Jami" on public.contacts;
create policy "CRM contacts readable by Hanna and Jami"
on public.contacts for select to authenticated
using (exists (
  select 1 from public.user_roles ur
  where ur.user_id = auth.uid() and ur.role::text in ('hanna', 'jami')
));

drop policy if exists "CRM contacts writable by Jami" on public.contacts;
create policy "CRM contacts writable by Jami"
on public.contacts for all to authenticated
using (exists (
  select 1 from public.user_roles ur
  where ur.user_id = auth.uid() and ur.role::text = 'jami'
))
with check (exists (
  select 1 from public.user_roles ur
  where ur.user_id = auth.uid() and ur.role::text = 'jami'
));

drop policy if exists "CRM sync runs readable by Hanna and Jami" on public.crm_sync_runs;
create policy "CRM sync runs readable by Hanna and Jami"
on public.crm_sync_runs for select to authenticated
using (exists (
  select 1 from public.user_roles ur
  where ur.user_id = auth.uid() and ur.role::text in ('hanna', 'jami')
));

drop policy if exists "CRM sync runs writable by Jami" on public.crm_sync_runs;
create policy "CRM sync runs writable by Jami"
on public.crm_sync_runs for all to authenticated
using (exists (
  select 1 from public.user_roles ur
  where ur.user_id = auth.uid() and ur.role::text = 'jami'
))
with check (exists (
  select 1 from public.user_roles ur
  where ur.user_id = auth.uid() and ur.role::text = 'jami'
));

grant select, insert, update, delete on public.companies to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.crm_sync_runs to authenticated;

-- Link the two already-confirmed real opportunities to their existing Notion CRM pages.
-- Do not overwrite newer Hanna HQ execution fields during this bootstrap.
update public.opportunities
set notion_page_id = '3e7265c8-8ca3-81ab-ba8f-cdf90d2a5929',
    notion_url = 'https://app.notion.com/p/3e7265c88ca381abba8fcdf90d2a5929',
    notion_synced_at = now()
where company_name = 'Portsa Marine' and is_demo = false;

update public.opportunities
set notion_page_id = 'f3fc9f84-8677-4446-993c-d0debc7aca2a',
    notion_url = 'https://app.notion.com/p/f3fc9f8486774446993cd0debc7aca2a',
    notion_synced_at = now()
where company_name = 'Raitolehto' and is_demo = false;
