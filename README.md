# DocuAssist PH

Internal CRM + public order-tracking system for a Philippine document-processing
business (PSA certificates, CENOMAR, TIN ID, PhilHealth ID). See
[`CONTEXT.md`](./CONTEXT.md) for the full spec and
[`implementation_plan.md`](./implementation_plan.md) for the build plan.

**Stack:** Next.js 14 (App Router) + TypeScript · Supabase (Postgres, Auth, RLS)
· Tailwind + shadcn/ui · `qrcode` · Semaphore SMS · Anthropic API.

## Local setup

### 1. Install
```bash
npm install
```

### 2. Environment
```bash
cp .env.local.example .env.local
# fill in Supabase URL + keys and NEXT_PUBLIC_SITE_URL
```
SMS and AI parsing are **optional**: leave `SEMAPHORE_API_KEY` / `ANTHROPIC_API_KEY`
blank and those calls are stubbed (logged, not sent) so the app runs end-to-end.

### 3. Database
Apply the schema to your Supabase project. Options:
- **SQL editor (easiest):** open `supabase/setup.sql`, copy the whole file,
  paste it into the Supabase SQL Editor and Run. It is migrations 0001–0008
  concatenated in order — run it once on a fresh project.
- **Supabase CLI:** `supabase db push` (applies `supabase/migrations/` in order).

This creates all tables, RLS policies (staff-only; no public table access), the
public tracking RPC, and seeds the 6 services, 3 couriers, 8 statuses, and SMS
templates.

### 4. Create the first staff user
The first login can't be seeded via SQL (password lives in Supabase Auth):
```bash
npm run create-staff -- --email you@example.com --password "your-password" \
    --name "Your Name" --role admin
```

### 5. Run
```bash
npm run dev
# http://localhost:3000 → redirects to /login
```

## Project layout
```
app/(admin)/      staff area (auth-guarded): dashboard, orders, customers, settings
app/login         staff sign-in
app/track/[code]  public tracking page (no auth, mobile-first)
app/api/track     public lookup route (rate-limited, whitelisted fields only)
lib/parse/        Paste & Parse — Tier-1 rule-based + Tier-2 Anthropic fallback
lib/sms/          Semaphore SMS (stubs without a key) + PH phone normalization
lib/sales.ts      sales figures, all computed by query (no stored totals)
lib/supabase      server / browser / service-role clients + session middleware
supabase/migrations   SQL schema, RLS, RPCs, seed
scripts/create-staff.ts   bootstrap the first staff account
```

## Tests

No test-runner dependency — both suites are plain scripts:

```bash
npm run test:parser   # Tier-1 label parsing, Taglish/typos, dates, fences (23 cases)
npm run test:sms      # PH phone normalization + SMS template tokens (16 cases)
npm run build         # type-checks the whole app
```

## Security model
- Everything except `/track/*` and `/login` requires a staff session.
- RLS is **staff-only** on every table; `admin` role gates settings.
- **Sales/revenue is admin-only.** Staff have the full CRM (orders, customers,
  shipping, SMS) but no access to money: `/dashboard` redirects them to the
  orders board, and the five sales RPCs raise `insufficient_privilege` for a
  non-admin — so a staff account cannot read revenue through the API either.
- The public tracking page has **no table access** — it calls one
  `SECURITY DEFINER` RPC (`get_tracking_info`) that returns only the
  whitelisted fields from CONTEXT.md §13, behind a rate-limited route.
  (`get_public_business_info` and `get_public_pipeline` are the only other
  anon-executable functions; both return non-sensitive branding/labels.)
- Sales reporting RPCs are `SECURITY INVOKER`, so RLS applies and `anon`
  cannot execute them.

## Known gaps

- **Services & couriers CRUD screens** (CONTEXT.md §8.5) are not built. The
  seeded services, prices, durations, `form_fields`, and couriers are editable
  via SQL for now. SMS templates/toggles *do* have a settings screen.
- Optional cost fields (`processing_cost`, `shipping_cost`) from §11 are marked
  v1.1 in the spec and are not implemented, so the dashboard reports revenue,
  not profit.
