# CONTEXT.md — DocuAssist PH: Document Processing CRM & Tracking System
## 1. Business Overview
**Business name: DocuAssist PH**
An online document processing service based in the Philippines. Customers who don't want to (or can't) line up at PSA/government offices pay the business to process official documents on their behalf. The business handles the request end-to-end: intake → processing → release → shipping to the customer's address.
**Services offered:**
| Code | Document |
|------|----------|
| `psa_birth` | PSA Birth Certificate |
| `cenomar` | CENOMAR (Certificate of No Marriage Record) |
| `psa_marriage` | PSA Marriage Certificate |
| `psa_death` | PSA Death Certificate |
| `tin_id` | TIN ID |
| `philhealth_id` | PhilHealth ID |
> Note: services list should be admin-configurable (add/edit/disable a service, set its price and its typical processing duration) — not hardcoded.
## 2. Current Manual Flow (what the system must digitize)
1. Customer messages the Facebook page.
2. Customer chooses which document(s) they want.
3. Business sends them a form (currently a template message/form).
4. Customer fills out the form and sends back their details.
5. Business processes the request — **approx. 1–2 weeks**.
6. Document is released, then shipped to the customer — **approx. 1 more week** in transit.
7. Customer receives the document. Payment is **COD (cash on delivery) only**.
**Pain points today:** everything lives in Messenger threads. No single record of customers, no status overview, customers repeatedly ask "san na po order ko?" and staff must scroll chats to answer.
## 3. What We're Building
A lightweight **internal CRM + public order tracking system** with two faces:
### A. Admin app (staff-facing, requires login)
- Encode new orders from Messenger conversations (staff types in the customer's form details).
- See all orders in a pipeline/kanban or filterable table view.
- Move orders through statuses; every status change is timestamped and logged.
- Auto-generate a **unique public tracking link + QR code** per order.
- Send the tracking link to the customer (copy link / download QR image to send via Messenger; optionally auto-SMS via Semaphore).
- Record shipping details (courier, courier tracking number) and payment status (COD collected or not).
- Dashboard: orders per status, aging orders (stuck too long in a stage), revenue summary.
### B. Public tracking page (customer-facing, **NO account, NO login**)
- Customer opens `https://{domain}/track/{tracking_code}` (from link or QR scan).
- Sees: their first name, document type(s) ordered, current status, and a visual timeline/stepper of all stages with dates.
- Shows estimated dates ("Expected release: ~Sep 10", "Expected delivery: ~Sep 17") computed from stage durations.
- If shipped: shows courier name + courier tracking number (and link to courier's tracker if available).
- Mobile-first — customers will open this from Messenger on a phone.
- Read-only. No customer data editable from this page. Minimal PII exposed (first name + masked details only — never full address, birthdate, or document contents).
## 4. Order Pipeline (Six Stages)
Status is per **order** (an order can contain multiple documents; optionally track per-document status later — v1 keeps one status per order).
| # | Status | Meaning | Trigger |
|---|--------|---------|---------|
| 1 | `new_inquiry` | Customer messaged, form sent, waiting for details | Staff creates the order stub |
| 2 | `details_received` | Customer submitted the filled-out form; staff encoded it | Staff enters form data |
| 3 | `processing` | Documents being processed with PSA/agency (~1–2 weeks) | Staff marks processing started |
| 4 | `released` | Document released/received by the business, preparing to ship | Staff confirms release |
| 5 | `shipped` | Handed to courier (~1 week transit), COD | Staff enters courier + tracking # |
| 6 | `delivered` | Customer received it; COD payment collected | Staff confirms delivery |
Plus two terminal statuses reachable from the flow:
- `cancelled` — (with reason) reachable from any stage before `shipped`.
- `returned` — RTS (return to sender) after 3 failed delivery attempts. A lost sale.
**Delivery attempts (within `shipped`):**
- While an order is `shipped`, staff can log a **failed delivery attempt** (button: "Log failed attempt" + reason: no one home, wrong address, refused, unreachable, etc.).
- `orders.delivery_attempts` increments (0 → 1 → 2 → 3); each attempt is written to `order_status_history` as an event with its reason and timestamp.
- Order card/table shows an attempt badge: "Attempt 1/3", "Attempt 2/3" (amber), "Attempt 3/3" (red).
- After the 3rd failed attempt, the courier returns the parcel — staff marks the order **`returned`** (records `returned_at` + reason). This flags the order as a lost sale in sales tracking (see §11) and the COD amount is never collected, while processing + shipping costs were already spent.
- Failed attempts should trigger an SMS nudge to the customer (see §10) — this is the single best lever to prevent RTS.
**Rules:**
- Statuses move forward only (admin can correct backward with a logged reason).
- Each transition writes to `order_status_history` (status, timestamp, staff user, note).
- The public tracking page renders directly from this history.
- Optional per-transition SMS to customer via **Semaphore** (Philippine SMS gateway) with the tracking link — toggleable per event; at minimum send on `shipped`.
## 5. Data Model (v1)
```
customers
  id, full_name, phone (PH mobile, for SMS), messenger_name/link,
  address_line, barangay, city, province, zip, notes, created_at
services
  id, code, name, price, processing_days_min, processing_days_max,
  shipping_days_estimate, active
orders
  id, customer_id, tracking_code (short, unguessable, e.g. 8–10 char
  base32 — used in the public URL), status, total_amount,
  payment_method ('cod' default), payment_status ('unpaid'|'paid'),
  courier_id, courier_tracking_number, shipped_at, delivered_at,
  delivery_attempts (int, default 0), returned_at, return_reason,
  expected_release_date, expected_delivery_date,
  created_at, updated_at
order_items
  id, order_id, service_id, quantity, price_at_order,
  form_details (jsonb — the customer's filled-out form fields for
  that document, e.g. name on certificate, date of birth,
  place of birth, purpose, etc.)
order_status_history
  id, order_id, status, note, changed_by (staff user id), created_at
couriers
  id, name (e.g. "J&T Express", "LBC", "Flash Express"),
  tracking_page_url (the courier's general tracking page — no
  per-number deep links exist, so the public page copies the
  tracking number and opens this URL), active
  — admin-configurable in settings (add/edit couriers anytime)
staff_users
  id, name, email, password_hash / auth provider id, role ('admin'|'staff')
```
**Form details per service** — each document type has different required fields. Store per-service field definitions (jsonb schema in `services.form_fields`) so the admin encoding form renders the right inputs:
- Birth cert / CENOMAR / Marriage / Death: full name on record, date of event, place of event, father's name, mother's maiden name, requester's relationship, purpose, copies.
- TIN ID / PhilHealth ID: full name, birthdate, existing TIN/PhilHealth number if any, etc.
(Exact field lists to be confirmed with the owner — make them configurable.)
## 6. Tracking Link & QR Code
- `tracking_code` generated on order creation: cryptographically random, URL-safe, not sequential (so codes can't be guessed/enumerated).
- Public URL: `/track/{tracking_code}`. No auth. Rate-limit lookups.
- Admin can: copy the link, download a QR PNG (QR encodes the URL), or trigger an SMS containing the link.
- QR generated server-side or client-side (any standard QR lib); include the business logo center-badge if easy.
- If a code doesn't exist → friendly "Order not found — double-check your link or message our page" screen with a Messenger link.
## 7. Public Tracking Page — UX Spec
- Header: DocuAssist PH logo + "Track your order".
- Order summary card: "Hi {first_name}! Here's the status of your **{document names}** order."
- Vertical stepper (mobile) of the 6 stages: completed steps ✓ with actual dates, current step highlighted with an animated indicator, future steps grayed with estimated dates.
- Status-specific helper text, e.g.:
  - Processing: "Your documents are being processed. This usually takes 1–2 weeks."
  - Shipped: "Your documents are on the way via {courier}! Tracking #: {number}. Please prepare **₱{total}** for cash on delivery."
  - Failed attempt: "Delivery attempt {n} of 3 was unsuccessful ({reason}). The courier will try again — please keep your phone reachable and prepare ₱{total} COD." At attempts 2–3, show a clear warning: "After 3 failed attempts, your parcel will be returned to sender."
  - Returned: "Your parcel was returned to us after 3 delivery attempts. Please message our page to arrange redelivery."
- **Shipped stage — courier tracking (copy + track):** courier tracking pages don't accept the tracking number in the URL, so the flow is two-step: the page shows the **tracking number with a "Copy" button** (one-tap copy to clipboard, with a "Copied!" toast), and next to it a **"Track Delivery" button** that opens the courier's general tracking page (J&T, LBC, Flash, etc.) in a new tab — the customer pastes the copied number there. Add helper text: "Copy your tracking number, then paste it on the courier's page." Hidden if no courier info was entered.
- Footer: "Questions? Message us on Facebook" button (deep link to the page).
- Taglish-friendly copy is fine and on-brand for the audience.
## 8. Admin App — Key Screens
1. **Orders board/table** — filter by status, service, date range; search by name, phone, tracking code. Highlight aging orders (e.g., in `processing` > 14 days = red badge).
2. **Order detail** — customer info, items + form details, status stepper with "Advance status" button (with optional note), tracking link/QR panel, courier fields (appear at `released`→`shipped`: **pick courier from a dropdown + enter tracking number** — the courier's tracking page URL comes from courier settings, so staff never pastes URLs per order), COD payment toggle at `delivered`, full status history log.
3. **New order** — pick/create customer → pick services → encode form details per service → creates order in `new_inquiry` or `details_received`.
4. **Customers** — list + detail with order history (repeat customers are common).
5. **Services & couriers settings** — CRUD services, prices, durations, form field definitions; CRUD couriers (name + tracking page URL).
6. **Dashboard** — counts per status, orders this week/month, revenue (delivered + paid), average processing time.
## 9. Order Intake (Two Paths)
An order reaches the system one of two ways, and they store details differently.
**Path A — staff encoding from Messenger.** The **New Order** screen is: customer full name → pick the document(s) → paste the customer's filled-out form → create. The paste is stored **verbatim** in `order_items.pasted_details`; nothing is parsed into fields. Staff read the reply as the customer wrote it, so no parser can silently mangle a PSA detail and get the application rejected.
**Path B — the customer's own order link (§13a).** The public form collects the service's declared `form_fields` directly from the customer, so `order_items.form_details` arrives already structured and validated. Orders from this path carry `source = 'public'`.
**Rules:**
- Mobile number is captured at intake where possible — the tracking SMS depends on it. Delivery address is collapsed during intake and can be completed before shipping.
- The printable PSA forms (§12a) fill from `form_details`. Path B fills them automatically; on Path A staff fill them **on the order detail screen**, with the pasted reply displayed directly above the fields to copy from. The print screen warns when an item's fields are still empty rather than silently printing a blank form.
- Both `pasted_details` and `form_details` stay editable on the order after creation.
- No AI parsing, no `ANTHROPIC_API_KEY`, no per-parse token cost.
## 9d. Auto-Fill (Parsing) — Admin Toggle
Staff shouldn't retype what the customer already sent, but a parser that guesses wrong on a PSA detail gets the application rejected. Auto-fill therefore proposes; it never saves.
- **Where.** On the order, the pasted reply sits directly above the PSA form fields. An **Auto-fill from the reply** button there fills those fields. Intake stays as it is (§9) — name, document, paste, create — because that is the step that needs to be fast.
- **Never auto-saved.** Filled boxes are highlighted amber and land in the form only; nothing reaches the database until staff press **Save form fields**. Editing a box clears its highlight.
- **Two switches, admin only** (Settings → Auto-fill), stored in `app_settings` and read on every parse so a change takes effect on the next click, not the next deploy:
  - `parsing_enabled` (default **on**) — the rule-based pass. Splits "Label: value" lines with fuzzy matching for typos, casing and Taglish variants. Free, instant, no API.
  - `parsing_ai_enabled` (default **off**) — the Anthropic fallback (`claude-haiku-4-5`, `output_config.format` JSON schema built from the service's own `form_fields`). Runs only when required fields are still empty after the free pass, and only when the admin has accepted the per-parse cost. Off by default so nobody meets the AI by way of a bill. With `ANTHROPIC_API_KEY` unset it is skipped and the free pass still runs.
- **Name splitting.** Customers send one line ("Pangalan ng ina: Maria Clara Santos") but the PSA form has Last / First / Middle boxes. Matched values are split across all three for the owner, the father and the mother, keeping surname particles together ("Dela Cruz", "De los Santos"). Boxes the customer filled separately are never overwritten.
- Parses are logged to `parse_logs` (order, service, tier, tokens) for cost visibility; logging never blocks a parse.
## 9b. Duplicate Warning on Intake
The same request arrives twice often enough to cost money — a customer messages again after not hearing back, or two staff pick up the same thread. Encoding it twice means paying PSA twice and shipping twice.
- Before creating anything, **New Order** checks for existing orders belonging to the same person: matched on normalized PH mobile number (so `09xx`, `+639xx` and spaced forms all count as one) or on a case- and spacing-insensitive full name, looking back 90 days and ignoring cancelled orders.
- **Strong** (red, "same document"): the match shares a document with what's being ordered and is either still live or finished within 14 days. **Possible** (amber): same person, different document.
- It **warns, never blocks** — a second copy is a real thing customers ask for. The warning lists each match with status, date, tracking code and a link to open it, then offers *Go back* or *Create anyway*.
- Acknowledging is scoped to what was shown: changing the customer or the selected documents clears it, so the warning has to be earned again.
- Separately, typing a name or phone already on file surfaces an **Already on file** hint with *Use this customer*, so a second customer record isn't created for the same person.
- The public order form (§13a) has no such check — customers can't be shown other people's orders — so a double submission there shows up as two orders for staff to spot.
## 9a. Facebook Pages on the Tracking Link
The business answers on more than one page — the VA handling TIN and PhilHealth IDs runs her own — so one global Messenger link would send those customers to staff who can't help them.
- `messenger_pages` (name + url, one `is_default`) is the source of truth; the old single `app_settings.messenger_url` is only a legacy fallback. Admins manage the list in **Settings → Business info**.
- `orders.messenger_page_id` decides which page a tracking link's "Message us" button opens. Whoever encodes the order picks it, and it stays changeable on the order afterwards.
- `staff_users.default_messenger_page_id` pre-selects a page per staff member, so the VA's orders carry hers without her remembering. Admins set it in **Settings → Staff accounts**.
- Resolution is one SQL function, `resolve_messenger_page(order's page → default page → legacy setting)`, so the tracking page and the order screen can't disagree. The tracking RPC returns the resolved name + url; `messenger_pages` itself stays staff-only under RLS and anon never reaches it.
- The button reads "Message {page name}" when a page is named, so the customer isn't surprised by which inbox opens.
## 9c. Per-Staff Document Access
A staff member can be limited to specific documents — e.g. the VA who only handles TIN and PhilHealth IDs has no business reading PSA birth applications, which carry parents' names, birthplaces and home addresses.
- `staff_services (staff_id, service_id)` holds the limit. **No rows = no limit**, so every existing account keeps full access and "all documents" is a deliberate choice rather than something you fall into.
- Enforcement is **RLS, not UI**. `staff_can_see_order()`, `staff_can_use_service()` and `staff_can_see_customer()` (SECURITY DEFINER) drive per-command policies on `orders`, `order_items`, `order_status_history`, `customers` and `notifications_log`. A limited account querying the API directly with its own token sees exactly what the app shows it.
- Writes are scoped too: `order_items` INSERT/UPDATE is checked against `staff_can_use_service()`, so a limited account cannot encode — or convert an order into — a document it can't see.
- Reads are scoped but inserts stay open to any staff, because intake creates a customer and an order one statement before the first item exists. Both helpers therefore treat a row with no children as visible; it stops being visible the moment its first item lands.
- Admins are exempt (`is_admin()` short-circuits every helper), and an admin cannot limit their own account — that would blind the owner to their own business.
- Screens follow the same scope so nothing is offered that the database would refuse: the New Order picker lists only their documents, the Orders board's service filter is narrowed, and both say plainly which documents the account covers so missing orders don't read as a bug.
## 10. Notifications (Semaphore SMS)
- Provider: **Semaphore** (semaphore.co) — PH SMS gateway, API-key based, ~₱0.50/SMS.
- Env: `SEMAPHORE_API_KEY`, `SEMAPHORE_SENDER_NAME`.
- Suggested sends (each toggleable in settings):
  - `details_received` → "Order confirmed! Track here: {link}"
  - `shipped` → "Your documents are on the way via {courier}. COD ₱{total}. Track: {link}"
  - **failed delivery attempt → "Hi {name}, delivery attempt {n}/3 for your DocuAssist PH order was unsuccessful. Courier will retry — please keep your phone on and prepare ₱{total} COD. {link}" — highest-priority SMS in the system: every recovered attempt is a saved sale, so this one should default to ON.**
  - `delivered` → optional thank-you.
- SMS is fire-and-forget with a `notifications_log` table (order_id, type, phone, status, response) for debugging.
- Messenger remains the primary channel — staff manually sends the link there; SMS is the backup that doesn't depend on the customer opening Messenger.
## 11. Sales & Revenue Tracking
Because payment is COD, a sale isn't real until the parcel is delivered — and an RTS return actively costs money. The system tracks this explicitly.
**Per order:**
- The owner sets the **amount per processing** (price per service in settings; `price_at_order` snapshots it on each order item, `orders.total_amount` sums it).
- Optional cost fields for true profit view (v1.1): `processing_cost` (what the business pays PSA/agency) and `shipping_cost` (courier fee — paid even on RTS).
**Revenue rules:**
- When an order is encoded, its amount counts toward **Booked Sales** (expected revenue).
- When an order is marked `delivered` + COD collected (`payment_status = paid`), the amount moves into **Collected Revenue** (actual money in).
- When an order is marked `returned` (RTS), its amount is **deducted from booked sales and recorded as an RTS Loss** — shown as a negative line, not silently dropped, so the owner sees exactly how much returns are costing. Same for `cancelled`.
- Net Sales = Booked − Returns − Cancellations. Collected Revenue ≤ Net Sales (the gap = shipped-but-not-yet-delivered orders).
**Sales dashboard (extends §8 dashboard):**
- This week / this month / custom range: Booked Sales, Collected Revenue, RTS Losses (₱ and count), Cancellations, Net Sales.
- **RTS rate** (% of shipped orders returned) — the health metric for a COD business; show trend over time.
- Breakdown by service (which documents earn the most, which get returned the most).
- List of returned orders with reasons — so patterns (bad addresses? one courier failing more?) are visible. Include per-courier RTS rate.
**Ledger integrity:** revenue numbers are always computed from order statuses/amounts (a query, not a manually edited running total) — so the dashboard can never drift out of sync with the orders themselves.
## 12. Recommended Stack (adjust to preference)
- **Next.js (App Router) + TypeScript** — one app serving both the admin UI and the public `/track/[code]` page.
- **Supabase** (Postgres + Auth for staff login + Row Level Security) — public tracking reads go through a server route/RPC that returns only whitelisted fields, never direct table access.
- **Tailwind + shadcn/ui** for admin; custom mobile-first styling for the public page.
- **QR:** `qrcode` npm package.
- **Hosting:** Vercel. **SMS:** Semaphore REST API.
## 13. Security & Privacy
- Public endpoint returns only: first name, service names, status + history dates, courier info, total due. Never full address, birthdates, parents' names, or form details.
- Tracking codes unguessable + rate-limited lookups + no listing endpoint.
- Staff auth required for everything else; `admin` role for settings/services, `staff` for order operations.
- Data Privacy Act awareness: collecting PII for document processing — add a short privacy note on the public page footer.
## 14. Out of Scope (v1)
- Customer accounts/logins — explicitly not wanted.
- Online payments — COD only.
- Messenger bot automation (auto-replies/auto-intake) — future phase; v1 is staff-encoded.
- Customer-facing order form web page (customers currently fill a form via chat) — good v2: a public form that creates the order directly.
- Per-document sub-statuses within one order.
## 15. Success Criteria
- Staff can encode an order in < 2 minutes.
- Any customer question "san na po order ko?" is answerable by sending one link.
- Zero customers need an account; tracking works first-tap from Messenger on mobile.
- Owner can see at a glance how many orders are in each stage and which ones are stuck.
