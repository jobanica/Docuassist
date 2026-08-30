-- =============================================================================
-- 0025_staff_delete.sql — let a staff account be removed without losing history.
--
-- order_status_history.changed_by pointed at staff_users with no delete rule,
-- so Postgres refused to remove anyone who had ever moved an order — which is
-- everyone who has done any work. Deactivating is right for someone who has
-- left; deleting is for the account created by mistake, and it needs to be
-- possible.
--
-- SET NULL rather than CASCADE: the history entry is a record of what happened
-- to the order and must survive the person. It simply stops naming them.
-- =============================================================================

alter table order_status_history
  drop constraint if exists order_status_history_changed_by_fkey;

alter table order_status_history
  add constraint order_status_history_changed_by_fkey
  foreign key (changed_by) references staff_users(id) on delete set null;
