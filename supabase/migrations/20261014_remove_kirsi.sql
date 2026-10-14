begin;

delete from public.user_roles where role::text = 'kirsi';

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
        ur.role::text = 'jami'
        or (ur.role::text = 'hanna' and coalesce(_ready, false))
      )
  );
$$;

create or replace function public.can_prepare_hanna_work(_user_id uuid)
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
      and ur.role::text = 'jami'
  );
$$;

alter table public.user_roles
  alter column role type text using role::text;

drop type public.app_role;
create type public.app_role as enum ('hanna', 'jami');

alter table public.user_roles
  alter column role type public.app_role using role::public.app_role;

commit;
