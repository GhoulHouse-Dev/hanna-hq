-- Hanna preparation workspace permissions.
-- Incomplete work items stay hidden from Hanna. Jami can prepare
-- drafts and promote them only after the existing ready_for_hanna gate passes.

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
      and ur.role = 'jami'::app_role
  );
$$;

do $$
declare
  t text;
begin
  foreach t in array array['opportunities', 'projects', 'admin_tasks'] loop
    execute format('drop policy if exists "Team update %1$s" on public.%1$I', t);
    execute format(
      'create policy "Team update %1$s" on public.%1$I for update to authenticated using (public.can_view_hanna_work_item(auth.uid(), ready_for_hanna)) with check (public.can_view_hanna_work_item(auth.uid(), ready_for_hanna))',
      t
    );
  end loop;
end $$;
