// Shared DB row types (hand-maintained subset — mirrors supabase/migrations).

export type StatusCode =
  | "new_inquiry"
  | "details_received"
  | "processing"
  | "released"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned";

/** A supplier is an outside partner who processes some documents for us. They
 *  are not staff: the database's is_staff() excludes them, so they can read no
 *  table directly and reach their own orders only through supplier_queue(). */
export type Role = "admin" | "staff" | "supplier";

export interface OrderStatus {
  code: StatusCode;
  label: string;
  sort_order: number;
  is_terminal: boolean;
  public_helper: string | null;
}

export interface FormFieldDef {
  key: string;
  label: string;
  type: "text" | "date" | "number" | "textarea";
  required: boolean;
  synonyms?: string[];
}

export interface Service {
  id: string;
  code: string;
  name: string;
  price: number;
  processing_days_min: number;
  processing_days_max: number;
  shipping_days_estimate: number;
  form_fields: FormFieldDef[];
  active: boolean;
  /** Where this document sits in every list. Lower first; the business order,
   *  not alphabetical. */
  sort_order: number;
  created_at: string;
}

export interface MessengerPage {
  id: string;
  name: string;
  url: string;
  active: boolean;
  is_default: boolean;
  created_at: string;
}

export interface Courier {
  id: string;
  name: string;
  tracking_page_url: string | null;
  active: boolean;
  created_at: string;
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string | null;
  messenger_name: string | null;
  messenger_link: string | null;
  address_line: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  notes: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  customer_id: string;
  tracking_code: string;
  status: StatusCode;
  total_amount: number;
  payment_method: string;
  payment_status: "unpaid" | "paid";
  courier_id: string | null;
  courier_tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  delivery_attempts: number;
  returned_at: string | null;
  return_reason: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  expected_release_date: string | null;
  expected_delivery_date: string | null;
  status_since: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  service_id: string;
  quantity: number;
  price_at_order: number;
  form_details: Record<string, string>;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  status: StatusCode | null;
  event_type: "status_change" | "failed_attempt" | "backward_correction";
  attempt_number: number | null;
  note: string | null;
  changed_by: string | null;
  created_at: string;
}
