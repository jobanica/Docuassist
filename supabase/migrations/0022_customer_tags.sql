-- =============================================================================
-- 0022_customer_tags.sql — batch tags on customers.
--
-- PSA requests are filed in batches: a stack goes to the counter together and
-- comes back together. Staff need to find "everyone in the 30 Aug batch" days
-- later, to chase releases or answer "where is mine?" — and nothing on the
-- order carries that, because a batch is a decision staff make, not a status.
--
-- Tags are free-form so the business names its own batches ("Batch 30 Aug",
-- "Rush", "Walk-in"). Deleting a tag detaches it everywhere rather than being
-- blocked, so a mistyped tag can always be cleaned up.
-- =============================================================================

create table if not exists tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- One of a small palette, so a batch is recognisable at a glance on the board.
  color      text not null default 'slate',
  created_at timestamptz not null default now(),
  created_by uuid references staff_users(id) on delete set null
);

-- Case-insensitive uniqueness: "Batch 30 Aug" and "batch 30 aug" are the same
-- batch, and two of them would split the very list staff came here to get.
create unique index if not exists tags_name_unique on tags (lower(name));

create table if not exists customer_tags (
  customer_id uuid not null references customers(id) on delete cascade,
  tag_id      uuid not null references tags(id) on delete cascade,
  added_at    timestamptz not null default now(),
  added_by    uuid references staff_users(id) on delete set null,
  primary key (customer_id, tag_id)
);

create index if not exists customer_tags_tag_idx on customer_tags (tag_id);

-- --- RLS -------------------------------------------------------------------
-- Tag names themselves are not customer data — every staff member sees the
-- same list, or a scoped account could not pick the batch it is working on.
alter table tags enable row level security;
drop policy if exists tags_staff_all on tags;
create policy tags_staff_all on tags
  for all using (is_staff()) with check (is_staff());

-- The attachment IS customer data: which customers are in a batch tells a
-- scoped account about customers it may not see. Same scope as the customer.
alter table customer_tags enable row level security;
drop policy if exists customer_tags_staff_all on customer_tags;
drop policy if exists customer_tags_staff_select on customer_tags;
drop policy if exists customer_tags_staff_insert on customer_tags;
drop policy if exists customer_tags_staff_delete on customer_tags;
create policy customer_tags_staff_select on customer_tags
  for select using (is_staff() and staff_can_see_customer(customer_id));
create policy customer_tags_staff_insert on customer_tags
  for insert with check (is_staff() and staff_can_see_customer(customer_id));
create policy customer_tags_staff_delete on customer_tags
  for delete using (is_staff() and staff_can_see_customer(customer_id));
