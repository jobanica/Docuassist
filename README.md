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
Apply the migrations in `supabase/migrations/` (in order) to your Supabase
project. Options:
- **Supabase CLI:** `supabase db push` (or `supabase migration up`), or
- **SQL editor:** paste each `0001…0005` file in order and run.

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
app/track/[code]  public tracking page (no auth) — built in Phase 3
app/api/track     public lookup route (rate-limited, whitelisted fields only)
lib/supabase      server / browser / service-role clients + session middleware
supabase/migrations   SQL schema, RLS, tracking RPC, seed
scripts/create-staff.ts   bootstrap the first staff account
```

## Security model
- Everything except `/track/*` and `/login` requires a staff session.
- RLS is **staff-only** on every table; `admin` role gates settings.
- The public tracking page has **no table access** — it calls one
  `SECURITY DEFINER` RPC (`get_tracking_info`) that returns only the
  whitelisted fields from CONTEXT.md §13, behind a rate-limited route.
