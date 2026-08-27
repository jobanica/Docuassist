-- =============================================================================
-- 0014_staff_active.sql — deactivate staff instead of deleting them.
--
-- staff_users rows are referenced by order_status_history.changed_by, so a
-- departed staff member cannot simply be deleted without either failing on the
-- foreign key or erasing who did what. `active` revokes their access while
-- leaving the audit trail intact.
-- =============================================================================
alter table staff_users
  add column if not exists active boolean not null default true;

comment on column staff_users.active is
  'false = access revoked. The row stays so order history keeps attributing '
  'their past actions to them.';

create index if not exists staff_users_active_idx on staff_users (active);

-- is_staff()/is_admin() gate RLS on every table, so an inactive account must
-- fail them too — not just the UI.
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff_users where id = auth.uid() and active
  );
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff_users where id = auth.uid() and active and role = 'admin'
  );
$$;
