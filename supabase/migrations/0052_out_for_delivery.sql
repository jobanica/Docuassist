-- =============================================================================
-- 0052_out_for_delivery.sql — a stage between Shipped and Delivered
--
-- "Shipped" means the parcel left us; it may be two provinces away and three
-- days out. "Out for delivery" means a rider has it right now, will call or
-- text within hours, and — on a COD order — the exact amount needs to be in
-- the house today. The office has been sending that message by hand out of
-- Messenger, one customer at a time; making it a status is what lets the
-- tracking page say it and the SMS fire on its own.
--
-- No order changes status here: every existing shipped order stays shipped,
-- and out_for_delivery_at is null on every order that predates the stage.
-- =============================================================================

update order_statuses set sort_order = 9 where code = 'returned';
update order_statuses set sort_order = 8 where code = 'cancelled';
update order_statuses set sort_order = 7 where code = 'delivered';

insert into order_statuses (code, label, sort_order, is_terminal, public_helper)
values (
  'out_for_delivery',
  'Out for Delivery',
  6,
  false,
  'Nasa rider na po ang inyong parcel — for delivery today! Please keep your '
  'phone on: tatawagan o ite-text kayo ng rider bago dumating.'
)
on conflict (code) do update
  set label = excluded.label,
      sort_order = excluded.sort_order,
      is_terminal = excluded.is_terminal,
      public_helper = excluded.public_helper;

-- When the rider picked it up, alongside shipped_at and delivered_at. The
-- status says where it is now; this says when it got there, which is what
-- tells you whether "out for delivery" means the rider is running late today
-- or the parcel has been sitting for three days.
alter table orders
  add column if not exists out_for_delivery_at timestamptz;

comment on column orders.out_for_delivery_at is
  'When the parcel went out with the rider. Null on orders that went straight '
  'from shipped to delivered, which is every order placed before this stage '
  'existed.';

-- The text the office has been sending by hand, as a template. Off by default:
-- every SMS costs money and this one goes to every customer on every order, so
-- it is the owner's call to switch on in Settings → Notifications.
insert into notification_settings (event_key, enabled, template)
values (
  'out_for_delivery',
  false,
  'Hi {name}, out for delivery na po ang order ninyo ngayong araw. Expect a '
  'text or call from the {courier} rider. Please prepare {total} COD. {link}'
)
on conflict (event_key) do nothing;

-- The forward pipeline, as a question about the data rather than a hardcoded
-- range. The old version asked for "sort_order between 1 and 6", which would
-- have silently dropped the customer's last stepper stage the moment a new
-- stage was inserted. Cancelled and returned are the two endings that are not
-- part of the forward path; everything else is.
create or replace function public.get_public_pipeline()
returns json
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(
           json_agg(json_build_object('code', code, 'label', label)
                    order by sort_order),
           '[]'::json)
    from order_statuses
   where code not in ('cancelled', 'returned');
$function$;
