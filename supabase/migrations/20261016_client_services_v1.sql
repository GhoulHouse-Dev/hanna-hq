begin;

do $$
begin
  create type public.service_status as enum ('ACTIVE', 'INACTIVE');
exception
  when duplicate_object then null;
end $$;

create unique index if not exists client_workspaces_id_organization_uidx
  on public.client_workspaces (id, organization_id);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_workspace_id uuid not null,
  name text not null,
  slug text not null,
  description text,
  short_description text,
  status public.service_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_workspace_id, slug),
  constraint services_name_not_blank check (length(trim(name)) >= 2),
  constraint services_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint services_workspace_organization_fk
    foreign key (client_workspace_id, organization_id)
    references public.client_workspaces (id, organization_id)
    on delete restrict
);

create index if not exists services_workspace_status_name_idx
  on public.services (client_workspace_id, status, name);

create index if not exists services_organization_idx
  on public.services (organization_id);

drop trigger if exists services_touch_updated_at on public.services;
create trigger services_touch_updated_at
before update on public.services
for each row execute function public.touch_updated_at();

alter table public.services enable row level security;

revoke all on table public.services from anon, authenticated;
grant select, insert, update on table public.services to authenticated;

drop policy if exists "Organization members can read services" on public.services;
create policy "Organization members can read services"
on public.services
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = services.organization_id
      and om.user_id = (select auth.uid())
  )
);

drop policy if exists "Operators can create services" on public.services;
create policy "Operators can create services"
on public.services
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = services.organization_id
      and om.user_id = (select auth.uid())
      and om.role in (
        'OWNER'::public.organization_role,
        'ADMIN'::public.organization_role,
        'OPERATOR'::public.organization_role
      )
  )
);

drop policy if exists "Operators can update services" on public.services;
create policy "Operators can update services"
on public.services
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = services.organization_id
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
    where om.organization_id = services.organization_id
      and om.user_id = (select auth.uid())
      and om.role in (
        'OWNER'::public.organization_role,
        'ADMIN'::public.organization_role,
        'OPERATOR'::public.organization_role
      )
  )
);

commit;
