create or replace function public.save_two_week_shift_plan(_period_start date, _entries jsonb)
returns table(date date, planned_hours numeric, focus text, status text)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_period_end date := _period_start + 13;
  v_total numeric := 0;
begin
  if v_user is null then
    raise exception 'Kirjautuminen vaaditaan';
  end if;

  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = v_user and ur.role::text = 'hanna'
  ) then
    raise exception 'Vain Hanna voi tallentaa työvuorosuunnitelman';
  end if;

  if _period_start <= current_date then
    raise exception 'Kahden viikon suunnitelman pitää alkaa tulevaisuudesta';
  end if;

  if jsonb_typeof(_entries) <> 'array' then
    raise exception 'Työvuorot pitää antaa listana';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(_entries) e
    where (e->>'date')::date < _period_start
       or (e->>'date')::date > v_period_end
       or coalesce((e->>'planned_hours')::numeric, 0) < 0
       or coalesce((e->>'planned_hours')::numeric, 0) > 12
  ) then
    raise exception 'Työvuoron päivä tai tuntimäärä ei ole sallittu';
  end if;

  select coalesce(sum(coalesce((e->>'planned_hours')::numeric, 0)), 0)
    into v_total
  from jsonb_array_elements(_entries) e;

  if v_total < 15 then
    raise exception 'Kahden viikon suunnitelmassa pitää olla vähintään 15 tuntia';
  end if;

  delete from public.shifts s
  where s.user_id = v_user
    and s.date between _period_start and v_period_end
    and s.status = 'planned'
    and s.started_at is null;

  insert into public.shifts (user_id, date, planned_hours, focus, status, break_minutes)
  select
    v_user,
    (e->>'date')::date,
    (e->>'planned_hours')::numeric,
    nullif(btrim(e->>'focus'), ''),
    'planned',
    0
  from jsonb_array_elements(_entries) e
  where coalesce((e->>'planned_hours')::numeric, 0) > 0
  on conflict (user_id, date) do update
    set planned_hours = excluded.planned_hours,
        focus = excluded.focus
  where shifts.status = 'planned' and shifts.started_at is null;

  return query
  select s.date, s.planned_hours, s.focus, s.status
  from public.shifts s
  where s.user_id = v_user
    and s.date between _period_start and v_period_end
  order by s.date;
end;
$$;

revoke all on function public.save_two_week_shift_plan(date, jsonb) from public;
grant execute on function public.save_two_week_shift_plan(date, jsonb) to authenticated;
