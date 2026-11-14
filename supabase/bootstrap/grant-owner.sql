-- Make an existing, email-confirmed user the owner of the default merchant.
-- Production bootstrap for the very first owner; later owners/admins can be added
-- by an owner (merchant_staff RLS: owner insert).
--
--   psql "$DATABASE_URL" -v email='you@yourshop.com' -f supabase/bootstrap/grant-owner.sql
--
\set ON_ERROR_STOP on
-- psql does not substitute :'email' inside a dollar-quoted block; pass it via a setting.
select set_config('bootstrap.email', :'email', false);
do $$
declare
  v_user     uuid;
  v_merchant uuid;
begin
  select id into v_user from auth.users
  where lower(email) = lower(current_setting('bootstrap.email'))
    and email_confirmed_at is not null;
  if v_user is null then
    raise exception 'no confirmed user with that email: sign up and confirm first';
  end if;
  select id into v_merchant from public.merchants where is_default and active;
  if v_merchant is null then
    raise exception 'no default merchant: load supabase/seed/01_catalog.sql first';
  end if;
  insert into public.merchant_staff (merchant_id, user_id, role)
  values (v_merchant, v_user, 'owner')
  on conflict (merchant_id, user_id) do update set role = 'owner';
  raise notice 'owner granted';
end $$;
