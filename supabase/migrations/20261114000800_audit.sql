-- =============================================================================
-- Audit log for merchant-managed configuration and order state changes.
-- (Points movements need no separate audit: the ledger is itself append-only.)
-- =============================================================================

create table public.audit_log (
  id          bigint generated always as identity primary key,
  merchant_id uuid,  -- intentionally no FK: audit rows must outlive the audited row
  table_name  text not null,
  record_id   text,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  actor_id    uuid,
  actor_role  text,
  created_at  timestamptz not null default now()
);
create index audit_log_merchant_idx on public.audit_log (merchant_id, created_at desc);
create index audit_log_record_idx on public.audit_log (table_name, record_id);

create function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  insert into public.audit_log
    (merchant_id, table_name, record_id, action, old_data, new_data, actor_id, actor_role)
  values (
    case when tg_table_name = 'merchants' then (v_row ->> 'id')::uuid
         else (v_row ->> 'merchant_id')::uuid end,
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id'),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid(),
    auth.role());
  return null;
end;
$$;

create trigger audit_merchants after insert or update or delete on public.merchants
  for each row execute function private.audit_row();
create trigger audit_merchant_staff after insert or update or delete on public.merchant_staff
  for each row execute function private.audit_row();
create trigger audit_tiers after insert or update or delete on public.tiers
  for each row execute function private.audit_row();
create trigger audit_stores after insert or update or delete on public.stores
  for each row execute function private.audit_row();
create trigger audit_products after insert or update or delete on public.products
  for each row execute function private.audit_row();
create trigger audit_rewards after insert or update or delete on public.rewards
  for each row execute function private.audit_row();
create trigger audit_orders after update of status on public.orders
  for each row execute function private.audit_row();

revoke execute on function private.audit_row() from public;

alter table public.audit_log enable row level security;
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;

create policy "audit_log: merchant owner/admin read" on public.audit_log
  for select to authenticated
  using (private.has_merchant_role(merchant_id, array['owner', 'admin']::public.staff_role[]));
