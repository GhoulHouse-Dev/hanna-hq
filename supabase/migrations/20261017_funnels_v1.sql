begin;

do $$
begin
  create type public.funnel_status as enum ('DRAFT', 'ACTIVE', 'PAUSED');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.funnel_step_type as enum (
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
    'INFO'
  );
exception
  when duplicate_object then null;
end $$;

create unique index if not exists services_id_workspace_organization_uidx
  on public.services (id, client_workspace_id, organization_id);

create table if not exists public.funnels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_workspace_id uuid not null,
  service_id uuid,
  name text not null,
  slug text not null,
  description text,
  status public.funnel_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_workspace_id, slug),
  constraint funnels_name_not_blank check (length(trim(name)) >= 2),
  constraint funnels_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint funnels_workspace_organization_fk
    foreign key (client_workspace_id, organization_id)
    references public.client_workspaces (id, organization_id)
    on delete restrict,
  constraint funnels_service_workspace_organization_fk
    foreign key (service_id, client_workspace_id, organization_id)
    references public.services (id, client_workspace_id, organization_id)
    on delete restrict
);

create unique index if not exists funnels_id_workspace_organization_uidx
  on public.funnels (id, client_workspace_id, organization_id);

create index if not exists funnels_workspace_status_name_idx
  on public.funnels (client_workspace_id, status, name);

create index if not exists funnels_service_idx
  on public.funnels (service_id)
  where service_id is not null;

create table if not exists public.funnel_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_workspace_id uuid not null,
  funnel_id uuid not null,
  field_key text,
  type public.funnel_step_type not null,
  label text not null,
  description text,
  placeholder text,
  required boolean not null default false,
  position integer not null,
  options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funnel_id, field_key),
  constraint funnel_steps_label_not_blank check (length(trim(label)) >= 1),
  constraint funnel_steps_position_non_negative check (position >= 0),
  constraint funnel_steps_options_array check (jsonb_typeof(options) = 'array'),
  constraint funnel_steps_choice_options_required check (
    case
      when type in ('SELECT'::public.funnel_step_type, 'RADIO'::public.funnel_step_type, 'MULTISELECT'::public.funnel_step_type)
        then jsonb_array_length(options) >= 1
      else jsonb_array_length(options) = 0
    end
  ),
  constraint funnel_steps_field_key_rules check (
    case
      when type in ('HEADING'::public.funnel_step_type, 'INFO'::public.funnel_step_type)
        then field_key is null and required = false
      else field_key ~ '^[a-z][a-z0-9_]{0,79}$'
    end
  ),
  constraint funnel_steps_funnel_workspace_organization_fk
    foreign key (funnel_id, client_workspace_id, organization_id)
    references public.funnels (id, client_workspace_id, organization_id)
    on delete cascade
);

create index if not exists funnel_steps_funnel_position_idx
  on public.funnel_steps (funnel_id, position, created_at);

create index if not exists funnel_steps_workspace_idx
  on public.funnel_steps (client_workspace_id);

drop trigger if exists funnels_touch_updated_at on public.funnels;
create trigger funnels_touch_updated_at
before update on public.funnels
for each row execute function public.touch_updated_at();

drop trigger if exists funnel_steps_touch_updated_at on public.funnel_steps;
create trigger funnel_steps_touch_updated_at
before update on public.funnel_steps
for each row execute function public.touch_updated_at();

alter table public.funnels enable row level security;
alter table public.funnel_steps enable row level security;

revoke all on table public.funnels from anon, authenticated;
revoke all on table public.funnel_steps from anon, authenticated;
grant select, insert, update on table public.funnels to authenticated;
grant select, insert, update, delete on table public.funnel_steps to authenticated;

drop policy if exists "Organization members can read funnels" on public.funnels;
create policy "Organization members can read funnels"
on public.funnels
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = funnels.organization_id
      and om.user_id = (select auth.uid())
  )
);

drop policy if exists "Operators can create funnels" on public.funnels;
create policy "Operators can create funnels"
on public.funnels
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = funnels.organization_id
      and om.user_id = (select auth.uid())
      and om.role in (
        'OWNER'::public.organization_role,
        'ADMIN'::public.organization_role,
        'OPERATOR'::public.organization_role
      )
  )
);

drop policy if exists "Operators can update funnels" on public.funnels;
create policy "Operators can update funnels"
on public.funnels
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = funnels.organization_id
      and om.user_id = (select auth.uid())
      and om.role in (
        'OWNER'::public.organization_role,
        'ADMIN'::public.organization_role,
        'OPERATOR'::public.organization_role
      )
  )
)
with check (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = funnels.organization_id
      and om.user_id = (select auth.uid())
      and om.role in (
        'OWNER'::public.organization_role,
        'ADMIN'::public.organization_role,
        'OPERATOR'::public.organization_role
      )
  )
);

drop policy if exists "Organization members can read funnel steps" on public.funnel_steps;
create policy "Organization members can read funnel steps"
on public.funnel_steps
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = funnel_steps.organization_id
      and om.user_id = (select auth.uid())
  )
);

drop policy if exists "Operators can create funnel steps" on public.funnel_steps;
create policy "Operators can create funnel steps"
on public.funnel_steps
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = funnel_steps.organization_id
      and om.user_id = (select auth.uid())
      and om.role in (
        'OWNER'::public.organization_role,
        'ADMIN'::public.organization_role,
        'OPERATOR'::public.organization_role
      )
  )
);

drop policy if exists "Operators can update funnel steps" on public.funnel_steps;
create policy "Operators can update funnel steps"
on public.funnel_steps
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = funnel_steps.organization_id
      and om.user_id = (select auth.uid())
      and om.role in (
        'OWNER'::public.organization_role,
        'ADMIN'::public.organization_role,
        'OPERATOR'::public.organization_role
      )
  )
)
with check (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = funnel_steps.organization_id
      and om.user_id = (select auth.uid())
      and om.role in (
        'OWNER'::public.organization_role,
        'ADMIN'::public.organization_role,
        'OPERATOR'::public.organization_role
      )
  )
);

drop policy if exists "Operators can delete funnel steps" on public.funnel_steps;
create policy "Operators can delete funnel steps"
on public.funnel_steps
for delete
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = funnel_steps.organization_id
      and om.user_id = (select auth.uid())
      and om.role in (
        'OWNER'::public.organization_role,
        'ADMIN'::public.organization_role,
        'OPERATOR'::public.organization_role
      )
  )
);

commit;
