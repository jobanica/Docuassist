-- =============================================================================
-- 0034_name_check_ack.sql — accepting the parents'-surname warning (§5)
--
-- The rule says a child carries the father's last name and the mother's maiden
-- name in the middle. It is right often enough to be worth checking, and wrong
-- in one case that is common here: when the parents are not married the child
-- is registered under the mother's surname even though the father is named on
-- the certificate. Adoption and corrected entries do the same thing.
--
-- Until now the only answer was to save anyway and meet the warning again on
-- the next visit — and, since the board started listing these so they could be
-- worked through one by one, to meet it there for good. So the office can now
-- accept a warning and say why.
--
-- The acceptance is pinned to the names it was given for. ack_key holds those
-- five names, normalised; the application compares it to the names as they are
-- now, and an acceptance whose key no longer matches simply stops applying. A
-- name edited after an acceptance is therefore checked again like any other,
-- with no trigger to keep in step.
-- =============================================================================

alter table order_items
  add column if not exists name_check_ack_key    text,
  add column if not exists name_check_ack_reason text,
  add column if not exists name_check_ack_at     timestamptz,
  add column if not exists name_check_ack_by     uuid references staff_users(id);

comment on column order_items.name_check_ack_key is
  'The five parent/child names, normalised, that the acceptance was given for. '
  'The warning returns as soon as any of them changes.';
comment on column order_items.name_check_ack_reason is
  'Why the names are right despite the rule — shown on the order and the board.';
