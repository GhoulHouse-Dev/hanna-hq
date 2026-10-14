-- Hanna HQ database optimization
-- Focus: queue reads, preparation reads, data integrity and Jami/Hanna write boundaries.

begin;

-- One logical role per user and one shift row per user/day.
create unique index if not exists user_roles_user_id_uidx
  on public.user_roles (user_id);

create unique index if not exists shifts_user_id_date_uidx
  on public.shifts (user_id, date);

-- Main read paths.
create index if not exists shifts_date_desc_idx
  on public.shifts (date desc);

create index if not exists weekly_metrics_week_start_desc_idx
  on public.weekly_metrics (week_start desc);

create index if not exists activities_user_created_at_idx
  on public.activities (user_id, created_at desc);

create index if not exists projects_opportunity_id_idx
  on public.projects (opportunity_id)
  where opportunity_id is not null;

create index if not exists opportunities_owner_id_idx
  on public.opportunities (owner_id)
  where owner_id is not null;

create index if not exists projects_owner_id_idx
  on public.projects (owner_id)
  where owner_id is not null;

-- Hanna's ready queue: partial indexes keep the hot working set small.
create index if not exists opportunities_hanna_queue_idx
  on public.opportunities (priority, next_action_at, id)
  where ready_for_hanna = true
    and is_demo = false
    and stage not in ('Won', 'Lost');

create index if not exists projects_hanna_queue_idx
  on public.projects (priority, due_date, id)
  where ready_for_hanna = true
    and is_demo = false
    and status in ('Onboarding', 'Active', 'Waiting client', 'QA', 'On hold');

create index if not exists admin_tasks_hanna_queue_idx
  on public.admin_tasks (priority, target_date, sort_order, id)
  where ready_for_hanna = true
    and status in ('Tarkista', 'Kesken', 'Odottaa');

-- Jami's preparation queue.
create index if not exists opportunities_hanna_prepare_idx
  on public.opportunities (priority, created_at, id)
  where ready_for_hanna = false
    and is_demo = false
    and stage not in ('Won', 'Lost');

create index if not exists projects_hanna_prepare_idx
  on public.projects (priority, created_at, id)
  where ready_for_hanna = false
    and is_demo = false
    and status <> 'Done';

create index if not exists admin_tasks_hanna_prepare_idx
  on public.admin_tasks (priority, sort_order, created_at, id)
  where ready_for_hanna = false
    and status in ('Tarkista', 'Kesken', 'Odottaa');

-- Protect priority and numeric data quality.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_priority_check') then
    alter table public.projects
      add constraint projects_priority_check
      check (priority is null or priority in ('P0','P1','P2','P3'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'admin_tasks_priority_check') then
    alter table public.admin_tasks
      add constraint admin_tasks_priority_check
      check (priority is null or priority in ('P0','P1','P2','P3'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shifts_hours_nonnegative_check') then
    alter table public.shifts
      add constraint shifts_hours_nonnegative_check
      check (planned_hours >= 0 and break_minutes >= 0 and (actual_hours is null or actual_hours >= 0));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'weekly_metrics_nonnegative_check') then
    alter table public.weekly_metrics
      add constraint weekly_metrics_nonnegative_check
      check (
        planned_hours >= 0 and actual_hours >= 0 and
        contacts >= 0 and conversations >= 0 and offers >= 0 and
        paid_customers >= 0 and active_customers >= 0
      );
  end if;
end $$;

-- Jami is the only role allowed to create or delete operational work items.
-- Hanna can update only rows already visible in her ready queue through the existing update policies.
drop policy if exists "Team insert opportunities" on public.opportunities;
create policy "Team insert opportunities" on public.opportunities
  for insert to authenticated
  with check (public.can_prepare_hanna_work(auth.uid()));

drop policy if exists "Team delete opportunities" on public.opportunities;
create policy "Team delete opportunities" on public.opportunities
  for delete to authenticated
  using (public.can_prepare_hanna_work(auth.uid()));

drop policy if exists "Team insert projects" on public.projects;
create policy "Team insert projects" on public.projects
  for insert to authenticated
  with check (public.can_prepare_hanna_work(auth.uid()));

drop policy if exists "Team delete projects" on public.projects;
create policy "Team delete projects" on public.projects
  for delete to authenticated
  using (public.can_prepare_hanna_work(auth.uid()));

drop policy if exists "Team insert admin_tasks" on public.admin_tasks;
create policy "Team insert admin_tasks" on public.admin_tasks
  for insert to authenticated
  with check (public.can_prepare_hanna_work(auth.uid()));

drop policy if exists "Team delete admin_tasks" on public.admin_tasks;
create policy "Team delete admin_tasks" on public.admin_tasks
  for delete to authenticated
  using (public.can_prepare_hanna_work(auth.uid()));

-- One RLS-aware queue view replaces three dashboard round trips.
create or replace view public.hanna_work_queue
with (security_invoker = true)
as
select
  o.id,
  'opportunity'::text as source,
  'Myynti'::text as source_label,
  o.company_name as title,
  o.stage as state,
  o.priority,
  o.next_action_at as work_date,
  o.task_instruction as instruction,
  o.action_label,
  o.action_url,
  o.materials_url,
  o.details_url,
  o.blocked_reason,
  case o.priority when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end as priority_rank,
  case
    when o.next_action_at < current_date then 0
    when o.next_action_at = current_date then 1
    when o.next_action_at > current_date then 2
    else 3
  end as urgency_rank
from public.opportunities o
where o.ready_for_hanna = true
  and o.is_demo = false
  and o.stage not in ('Won', 'Lost')

union all

select
  p.id,
  'project'::text as source,
  'Asiakas'::text as source_label,
  p.company_name as title,
  p.status as state,
  coalesce(p.priority, 'P2') as priority,
  p.due_date as work_date,
  p.task_instruction as instruction,
  p.action_label,
  p.action_url,
  p.materials_url,
  p.details_url,
  p.blocked_reason,
  case coalesce(p.priority, 'P2') when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end as priority_rank,
  case
    when p.due_date < current_date then 0
    when p.due_date = current_date then 1
    when p.due_date > current_date then 2
    else 3
  end as urgency_rank
from public.projects p
where p.ready_for_hanna = true
  and p.is_demo = false
  and p.status in ('Onboarding', 'Active', 'Waiting client', 'QA', 'On hold')

union all

select
  a.id,
  'admin'::text as source,
  'Hallinto'::text as source_label,
  a.title,
  coalesce(nullif(a.owner_text, ''), a.status) as state,
  coalesce(a.priority, 'P3') as priority,
  a.target_date as work_date,
  a.task_instruction as instruction,
  a.action_label,
  a.action_url,
  a.materials_url,
  a.details_url,
  a.blocked_reason,
  case coalesce(a.priority, 'P3') when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end as priority_rank,
  case
    when a.target_date < current_date then 0
    when a.target_date = current_date then 1
    when a.target_date > current_date then 2
    else 3
  end as urgency_rank
from public.admin_tasks a
where a.ready_for_hanna = true
  and a.status in ('Tarkista', 'Kesken', 'Odottaa');

grant select on public.hanna_work_queue to authenticated;

analyze public.opportunities;
analyze public.projects;
analyze public.admin_tasks;
analyze public.shifts;
analyze public.weekly_metrics;
analyze public.activities;

commit;
