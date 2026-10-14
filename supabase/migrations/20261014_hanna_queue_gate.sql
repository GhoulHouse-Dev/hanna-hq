-- Hanna HQ task readiness gate
-- A task is invisible to Hanna until it has an explicit instruction,
-- direct action, materials link and details link. Jami can still
-- see incomplete rows and prepare them before promotion to Hanna's queue.

alter table public.opportunities add column if not exists ready_for_hanna boolean not null default false;
alter table public.projects add column if not exists ready_for_hanna boolean not null default false;
alter table public.admin_tasks add column if not exists ready_for_hanna boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'opportunities_hanna_queue_gate') then
    alter table public.opportunities add constraint opportunities_hanna_queue_gate check (
      not ready_for_hanna or (
        nullif(btrim(task_instruction), '') is not null and
        nullif(btrim(action_label), '') is not null and
        nullif(btrim(action_url), '') is not null and
        nullif(btrim(materials_url), '') is not null and
        nullif(btrim(details_url), '') is not null
      )
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'projects_hanna_queue_gate') then
    alter table public.projects add constraint projects_hanna_queue_gate check (
      not ready_for_hanna or (
        nullif(btrim(task_instruction), '') is not null and
        nullif(btrim(action_label), '') is not null and
        nullif(btrim(action_url), '') is not null and
        nullif(btrim(materials_url), '') is not null and
        nullif(btrim(details_url), '') is not null
      )
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'admin_tasks_hanna_queue_gate') then
    alter table public.admin_tasks add constraint admin_tasks_hanna_queue_gate check (
      not ready_for_hanna or (
        nullif(btrim(task_instruction), '') is not null and
        nullif(btrim(action_label), '') is not null and
        nullif(btrim(action_url), '') is not null and
        nullif(btrim(materials_url), '') is not null and
        nullif(btrim(details_url), '') is not null
      )
    );
  end if;
end $$;

create or replace function public.can_view_hanna_work_item(_user_id uuid, _ready boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = _user_id
      and (
        ur.role = 'jami'::app_role
        or (ur.role = 'hanna'::app_role and coalesce(_ready, false))
      )
  )
$$;

-- Opportunities
DROP POLICY IF EXISTS "Team all opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Team select opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Team insert opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Team update opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Team delete opportunities" ON public.opportunities;
CREATE POLICY "Team select opportunities" ON public.opportunities
  FOR SELECT TO authenticated
  USING (public.can_view_hanna_work_item(auth.uid(), ready_for_hanna));
CREATE POLICY "Team insert opportunities" ON public.opportunities
  FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "Team update opportunities" ON public.opportunities
  FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid()))
  WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "Team delete opportunities" ON public.opportunities
  FOR DELETE TO authenticated
  USING (public.is_team_member(auth.uid()));

-- Projects
DROP POLICY IF EXISTS "Team all projects" ON public.projects;
DROP POLICY IF EXISTS "Team select projects" ON public.projects;
DROP POLICY IF EXISTS "Team insert projects" ON public.projects;
DROP POLICY IF EXISTS "Team update projects" ON public.projects;
DROP POLICY IF EXISTS "Team delete projects" ON public.projects;
CREATE POLICY "Team select projects" ON public.projects
  FOR SELECT TO authenticated
  USING (public.can_view_hanna_work_item(auth.uid(), ready_for_hanna));
CREATE POLICY "Team insert projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "Team update projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid()))
  WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "Team delete projects" ON public.projects
  FOR DELETE TO authenticated
  USING (public.is_team_member(auth.uid()));

-- Admin tasks
DROP POLICY IF EXISTS "Team all admin_tasks" ON public.admin_tasks;
DROP POLICY IF EXISTS "Team select admin_tasks" ON public.admin_tasks;
DROP POLICY IF EXISTS "Team insert admin_tasks" ON public.admin_tasks;
DROP POLICY IF EXISTS "Team update admin_tasks" ON public.admin_tasks;
DROP POLICY IF EXISTS "Team delete admin_tasks" ON public.admin_tasks;
CREATE POLICY "Team select admin_tasks" ON public.admin_tasks
  FOR SELECT TO authenticated
  USING (public.can_view_hanna_work_item(auth.uid(), ready_for_hanna));
CREATE POLICY "Team insert admin_tasks" ON public.admin_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "Team update admin_tasks" ON public.admin_tasks
  FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid()))
  WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "Team delete admin_tasks" ON public.admin_tasks
  FOR DELETE TO authenticated
  USING (public.is_team_member(auth.uid()));
