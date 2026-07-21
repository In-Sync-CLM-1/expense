// One-time: create the RMPL org + all real users in the Expense backend,
// wired into the same manager hierarchy already on file in RMPL's own DB.
// Safe to re-run (skips users that already exist by email).
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/env.mjs';
import { PEOPLE, ADMIN_EMAILS, ORG } from './lib/rmpl-people.mjs';

const env = loadEnv(new URL('../.env', import.meta.url));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Only these two actually record advances in RMPL today (Accounts) — Expense's
// own permission model gates "record advance" behind org role=admin, so they
// need it to keep doing their job. Everyone else is a plain maker; approval
// authority already falls out of reports_to (hasSubordinates), no role needed.
const DEMO_PASSWORD = env.RMPL_TEMP_PASSWORD;
if (!DEMO_PASSWORD) throw new Error('RMPL_TEMP_PASSWORD missing from .env');

async function main() {
  console.log('[rmpl] creating organization…');
  let { data: org, error: orgErr } = await sb
    .from('organizations')
    .select('id')
    .eq('slug', ORG.slug)
    .maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) {
    const { data, error } = await sb.from('organizations').insert(ORG).select('id').single();
    if (error) throw error;
    org = data;
  }
  console.log('[rmpl] org_id =', org.id);

  const idMap = new Map(); // rmpl_id -> new expense user id

  for (const [rmplId, fullName, email] of PEOPLE) {
    const { data: existingProfile } = await sb.from('profiles').select('id').eq('email', email).maybeSingle();
    let userId = existingProfile?.id;
    if (!userId) {
      const { data: created, error } = await sb.auth.admin.createUser({
        email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (error) {
        console.error(`[rmpl] createUser failed for ${email}:`, error.message);
        continue;
      }
      userId = created.user.id;
      console.log(`[rmpl] created ${fullName} <${email}>`);
    } else {
      console.log(`[rmpl] exists   ${fullName} <${email}>`);
    }
    idMap.set(rmplId, userId);
  }

  console.log('[rmpl] wiring reports_to + phone + org membership…');
  for (const [rmplId, fullName, email, phone, mgrRmplId] of PEOPLE) {
    const userId = idMap.get(rmplId);
    if (!userId) continue;
    const reportsTo = mgrRmplId ? idMap.get(mgrRmplId) ?? null : null;

    const { error: profErr } = await sb
      .from('profiles')
      .update({ phone, reports_to: reportsTo, full_name: fullName })
      .eq('id', userId);
    if (profErr) console.error(`[rmpl] profile update failed for ${email}:`, profErr.message);

    const role = ADMIN_EMAILS.has(email) ? 'admin' : 'employee';
    const { error: memErr } = await sb
      .from('org_memberships')
      .upsert({ org_id: org.id, user_id: userId, role, is_active: true }, { onConflict: 'org_id,user_id' });
    if (memErr) console.error(`[rmpl] membership failed for ${email}:`, memErr.message);
  }

  console.log('[rmpl] DONE. org_id =', org.id);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
