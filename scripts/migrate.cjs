// One-time migration runner for expense tables
const { Client } = require("pg");

const DB_URL =
  "postgresql://postgres:7vN%24F9%232xP%26z%40qL1@db.fozoerpeynkehpchfxcj.supabase.co:5432/postgres";

// Each entry runs as a separate statement (pg doesn't support multi-statement strings)
const steps = [
  // ── Extend existing app_role enum ──────────────────────────────────────────
  // Must run outside a transaction
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='app_role' AND e.enumlabel='admin') THEN
       ALTER TYPE app_role ADD VALUE 'admin';
     END IF;
   END $$`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='app_role' AND e.enumlabel='manager') THEN
       ALTER TYPE app_role ADD VALUE 'manager';
     END IF;
   END $$`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='app_role' AND e.enumlabel='employee') THEN
       ALTER TYPE app_role ADD VALUE 'employee';
     END IF;
   END $$`,

  // ── Add missing columns to existing profiles table ─────────────────────────
  `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL`,
  `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`,
  `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS exit_date date`,

  // ── Create index on reports_to ─────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_profiles_reports_to ON public.profiles(reports_to)`,

  // ── teams ──────────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS public.teams (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,

  // ── team_members ───────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS public.team_members (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    team_id    uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, team_id)
  )`,

  // ── travel_expense_claims ──────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS public.travel_expense_claims (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    trip_title       text NOT NULL,
    trip_start_date  date NOT NULL,
    trip_end_date    date NOT NULL,
    destination      text,
    purpose          text,
    total_amount     numeric(12,2) NOT NULL DEFAULT 0,
    approved_amount  numeric(12,2),
    currency         text NOT NULL DEFAULT 'INR',
    status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN (
                       'draft','submitted','approved',
                       'partially_approved','rejected','reimbursed'
                     )),
    submitted_at     timestamptz,
    approved_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at      timestamptz,
    rejection_reason text,
    reimbursed_at    timestamptz,
    proof_urls       jsonb NOT NULL DEFAULT '[]',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
  )`,

  // ── travel_expense_items ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS public.travel_expense_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id        uuid NOT NULL REFERENCES public.travel_expense_claims(id) ON DELETE CASCADE,
    expense_type    text NOT NULL
                    CHECK (expense_type IN (
                      'airfare','train','bus','cab','auto','fuel',
                      'hotel','food','communication','visa','miscellaneous'
                    )),
    description     text NOT NULL DEFAULT '',
    amount          numeric(12,2) NOT NULL,
    expense_date    date NOT NULL,
    receipt_url     text,
    receipt_name    text,
    approved_amount numeric(12,2),
    item_status     text DEFAULT 'pending',
    remarks         text,
    created_at      timestamptz NOT NULL DEFAULT now()
  )`,

  // ── indexes ────────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_claims_user_id   ON public.travel_expense_claims(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_claims_status    ON public.travel_expense_claims(status)`,
  `CREATE INDEX IF NOT EXISTS idx_claims_submitted ON public.travel_expense_claims(submitted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_items_claim_id   ON public.travel_expense_items(claim_id)`,

  // ── set_updated_at trigger function ───────────────────────────────────────
  `CREATE OR REPLACE FUNCTION public.set_updated_at()
   RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN new.updated_at = now(); RETURN new; END; $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='claims_updated_at') THEN
       CREATE TRIGGER claims_updated_at
         BEFORE UPDATE ON public.travel_expense_claims
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
     END IF;
   END $$`,

  // ── recalc_claim_total trigger ─────────────────────────────────────────────
  `CREATE OR REPLACE FUNCTION public.recalc_claim_total()
   RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE v_claim_id uuid;
   BEGIN
     v_claim_id := COALESCE(NEW.claim_id, OLD.claim_id);
     UPDATE public.travel_expense_claims
     SET total_amount = (SELECT COALESCE(SUM(amount),0) FROM public.travel_expense_items WHERE claim_id = v_claim_id),
         updated_at = now()
     WHERE id = v_claim_id;
     RETURN COALESCE(NEW, OLD);
   END; $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='items_recalc_total') THEN
       CREATE TRIGGER items_recalc_total
         AFTER INSERT OR UPDATE OF amount OR DELETE ON public.travel_expense_items
         FOR EACH ROW EXECUTE FUNCTION public.recalc_claim_total();
     END IF;
   END $$`,

  // ── handle_new_user trigger ────────────────────────────────────────────────
  `CREATE OR REPLACE FUNCTION public.handle_new_user()
   RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
   BEGIN
     INSERT INTO public.profiles (id, email, full_name)
     VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email,'@',1)))
     ON CONFLICT (id) DO NOTHING;
     RETURN NEW;
   END; $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='on_auth_user_created') THEN
       CREATE TRIGGER on_auth_user_created
         AFTER INSERT ON auth.users
         FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
     END IF;
   END $$`,

  // ── storage bucket ─────────────────────────────────────────────────────────
  `INSERT INTO storage.buckets (id, name, public)
   VALUES ('expense-receipts', 'expense-receipts', false)
   ON CONFLICT (id) DO NOTHING`,

  // ── RLS ────────────────────────────────────────────────────────────────────
  `ALTER TABLE public.teams        ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.travel_expense_claims ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE public.travel_expense_items  ENABLE ROW LEVEL SECURITY`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='teams_select' AND tablename='teams') THEN
       CREATE POLICY teams_select ON public.teams FOR SELECT USING (auth.role()='authenticated');
     END IF;
   END $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='team_members_select' AND tablename='team_members') THEN
       CREATE POLICY team_members_select ON public.team_members FOR SELECT USING (
         user_id = auth.uid() OR
         EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text='admin')
       );
     END IF;
   END $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='claims_select' AND tablename='travel_expense_claims') THEN
       CREATE POLICY claims_select ON public.travel_expense_claims FOR SELECT USING (
         user_id = auth.uid() OR
         EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text='admin') OR
         EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=travel_expense_claims.user_id AND p.reports_to=auth.uid())
       );
     END IF;
   END $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='claims_insert' AND tablename='travel_expense_claims') THEN
       CREATE POLICY claims_insert ON public.travel_expense_claims FOR INSERT WITH CHECK (user_id=auth.uid());
     END IF;
   END $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='claims_update' AND tablename='travel_expense_claims') THEN
       CREATE POLICY claims_update ON public.travel_expense_claims FOR UPDATE USING (
         user_id=auth.uid() OR
         EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text IN ('admin','manager')) OR
         EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=travel_expense_claims.user_id AND p.reports_to=auth.uid())
       );
     END IF;
   END $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='claims_delete_draft' AND tablename='travel_expense_claims') THEN
       CREATE POLICY claims_delete_draft ON public.travel_expense_claims FOR DELETE USING (user_id=auth.uid() AND status='draft');
     END IF;
   END $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='items_select' AND tablename='travel_expense_items') THEN
       CREATE POLICY items_select ON public.travel_expense_items FOR SELECT USING (
         EXISTS (SELECT 1 FROM public.travel_expense_claims c WHERE c.id=travel_expense_items.claim_id)
       );
     END IF;
   END $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='items_insert' AND tablename='travel_expense_items') THEN
       CREATE POLICY items_insert ON public.travel_expense_items FOR INSERT WITH CHECK (
         EXISTS (SELECT 1 FROM public.travel_expense_claims c WHERE c.id=claim_id AND c.user_id=auth.uid())
       );
     END IF;
   END $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='items_update' AND tablename='travel_expense_items') THEN
       CREATE POLICY items_update ON public.travel_expense_items FOR UPDATE USING (
         EXISTS (SELECT 1 FROM public.travel_expense_claims c WHERE c.id=travel_expense_items.claim_id AND c.user_id=auth.uid())
       );
     END IF;
   END $$`,

  // ── storage policies ───────────────────────────────────────────────────────
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='receipts_upload' AND tablename='objects') THEN
       CREATE POLICY receipts_upload ON storage.objects FOR INSERT WITH CHECK (
         bucket_id='expense-receipts' AND auth.uid()::text=(storage.foldername(name))[1]
       );
     END IF;
   END $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='receipts_read' AND tablename='objects') THEN
       CREATE POLICY receipts_read ON storage.objects FOR SELECT USING (
         bucket_id='expense-receipts' AND (
           auth.uid()::text=(storage.foldername(name))[1] OR
           EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role::text IN ('admin','manager'))
         )
       );
     END IF;
   END $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='receipts_delete' AND tablename='objects') THEN
       CREATE POLICY receipts_delete ON storage.objects FOR DELETE USING (
         bucket_id='expense-receipts' AND auth.uid()::text=(storage.foldername(name))[1]
       );
     END IF;
   END $$`,
];

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log("Connected to database");

  let ok = 0, failed = 0;
  for (let i = 0; i < steps.length; i++) {
    const label = steps[i].trim().split("\n")[0].substring(0, 60);
    try {
      await client.query(steps[i]);
      console.log(`  ✓ [${i + 1}/${steps.length}] ${label}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ [${i + 1}/${steps.length}] ${label}`);
      console.error(`    → ${err.message}`);
      failed++;
    }
  }

  await client.end();
  console.log(`\nDone: ${ok} succeeded, ${failed} failed`);
}

run().catch((err) => { console.error("Fatal:", err.message); process.exit(1); });
