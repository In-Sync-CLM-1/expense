// One-time: migrate RMPL's real travel_expense_claims/items/expense_advances
// history into the Expense backend under the RMPL org, remapping user ids to
// the accounts created by rmpl-create-org-users.mjs. Also re-hosts the small
// number of receipt files RMPL has (private storage -> private storage).
//
// Advances are migrated as general/company-wide entries (no claim_id) — RMPL's
// project-based reconciliation isn't replicated (user decision, 2026-07-21);
// the original project name is preserved as free text in the note instead.
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './lib/env.mjs';
import { PEOPLE } from './lib/rmpl-people.mjs';

const env = loadEnv(new URL('../.env', import.meta.url));
const dest = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const rmplEnv = loadEnv(new URL('../../rmpl/.env', import.meta.url));
const src = createClient(rmplEnv.SUPABASE_URL, rmplEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function buildIdMap() {
  const idMap = new Map();
  for (const [rmplId, , email] of PEOPLE) {
    const { data, error } = await dest.from('profiles').select('id').eq('email', email).maybeSingle();
    if (error || !data) throw new Error(`Could not resolve ${email} in Expense: ${error?.message ?? 'not found'}`);
    idMap.set(rmplId, data.id);
  }
  return idMap;
}

async function getOrgId() {
  const { data, error } = await dest.from('organizations').select('id').eq('slug', 'rmpl').single();
  if (error) throw error;
  return data.id;
}

// Downloads a private-bucket file from RMPL and re-uploads it to Expense,
// returning a fresh 1-year signed URL in the new project.
async function rehostFile(signedUrl, newPath) {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`download failed (${res.status}): ${signedUrl.slice(0, 80)}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'application/octet-stream';

  const { error: upErr } = await dest.storage.from('expense-receipts').upload(newPath, buf, { contentType, upsert: true });
  if (upErr) throw upErr;

  const { data: signedData, error: signErr } = await dest.storage
    .from('expense-receipts')
    .createSignedUrl(newPath, 60 * 60 * 24 * 365);
  if (signErr) throw signErr;
  return signedData.signedUrl;
}

async function main() {
  const idMap = await buildIdMap();
  const orgId = await getOrgId();
  console.log('[migrate] org_id =', orgId, '| resolved', idMap.size, 'users');

  const { data: claims, error: claimsErr } = await src
    .from('travel_expense_claims')
    .select('*')
    .order('created_at');
  if (claimsErr) throw claimsErr;

  const { data: items, error: itemsErr } = await src
    .from('travel_expense_items')
    .select('*')
    .order('created_at');
  if (itemsErr) throw itemsErr;

  const { data: advances, error: advErr } = await src
    .from('expense_advances')
    .select('*, projects:project_id(project_name, project_number)')
    .order('advance_date');
  if (advErr) throw advErr;

  console.log(`[migrate] source: ${claims.length} claims, ${items.length} items, ${advances.length} advances`);

  const claimIdMap = new Map(); // rmpl claim id -> new claim id
  let claimsInserted = 0, claimsSkipped = 0;

  for (const c of claims) {
    const userId = idMap.get(c.user_id);
    if (!userId) { console.error('[migrate] SKIP claim, unknown user_id', c.user_id, c.id); claimsSkipped++; continue; }
    const approvedBy = c.approved_by ? idMap.get(c.approved_by) ?? null : null;

    const { data: inserted, error } = await dest
      .from('travel_expense_claims')
      .insert({
        org_id: orgId,
        user_id: userId,
        trip_title: c.trip_title,
        trip_start_date: c.trip_start_date,
        trip_end_date: c.trip_end_date,
        destination: c.destination,
        purpose: c.purpose,
        total_amount: c.total_amount,
        approved_amount: c.approved_amount,
        currency: c.currency,
        status: c.status,
        submitted_at: c.submitted_at,
        approved_by: approvedBy,
        approved_at: c.approved_at,
        rejection_reason: c.rejection_reason,
        reimbursed_at: c.reimbursed_at,
        proof_urls: [],
        created_at: c.created_at,
        updated_at: c.updated_at,
      })
      .select('id')
      .single();

    if (error) { console.error('[migrate] claim insert failed', c.id, error.message); claimsSkipped++; continue; }
    claimIdMap.set(c.id, inserted.id);
    claimsInserted++;
  }
  console.log(`[migrate] claims: ${claimsInserted} inserted, ${claimsSkipped} skipped`);

  let itemsInserted = 0, itemsSkipped = 0;
  for (const i of items) {
    const newClaimId = claimIdMap.get(i.claim_id);
    if (!newClaimId) { console.error('[migrate] SKIP item, unknown claim_id', i.claim_id, i.id); itemsSkipped++; continue; }

    const { data: insertedItem, error } = await dest
      .from('travel_expense_items')
      .insert({
        claim_id: newClaimId,
        expense_type: i.expense_type,
        description: i.description,
        amount: i.amount,
        expense_date: i.expense_date,
        receipt_url: null,
        receipt_name: i.receipt_name,
        approved_amount: i.approved_amount,
        item_status: i.item_status,
        remarks: i.remarks,
        created_at: i.created_at,
      })
      .select('id')
      .single();

    if (error) { console.error('[migrate] item insert failed', i.id, error.message); itemsSkipped++; continue; }
    itemsInserted++;

    if (i.receipt_url) {
      try {
        const ext = (i.receipt_name || 'file').split('.').pop() || 'bin';
        const claimUserId = claims.find((c) => c.id === i.claim_id)?.user_id;
        const newUserId = idMap.get(claimUserId);
        const path = `${newUserId}/${newClaimId}/${Date.now()}-${insertedItem.id.slice(0, 8)}.${ext}`;
        const newUrl = await rehostFile(i.receipt_url, path);
        await dest.from('travel_expense_items').update({ receipt_url: newUrl }).eq('id', insertedItem.id);
        console.log(`[migrate] receipt rehosted for item ${i.id}`);
      } catch (err) {
        console.error(`[migrate] receipt rehost FAILED for item ${i.id}:`, err.message);
      }
    }
  }
  console.log(`[migrate] items: ${itemsInserted} inserted, ${itemsSkipped} skipped`);

  // Claim proof_urls (separate multi-file proofs), rehosted per claim.
  let proofsRehosted = 0;
  for (const c of claims) {
    if (!c.proof_urls || c.proof_urls.length === 0) continue;
    const newClaimId = claimIdMap.get(c.id);
    const newUserId = idMap.get(c.user_id);
    if (!newClaimId || !newUserId) continue;

    const newProofs = [];
    for (const p of c.proof_urls) {
      try {
        const ext = (p.name || 'file').split('.').pop() || 'bin';
        const path = `${newUserId}/${newClaimId}/proofs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const newUrl = await rehostFile(p.url, path);
        newProofs.push({ url: newUrl, name: p.name, size: p.size });
      } catch (err) {
        console.error(`[migrate] proof rehost FAILED for claim ${c.id}:`, err.message);
      }
    }
    if (newProofs.length > 0) {
      await dest.from('travel_expense_claims').update({ proof_urls: newProofs }).eq('id', newClaimId);
      proofsRehosted += newProofs.length;
    }
  }
  console.log(`[migrate] proof files rehosted: ${proofsRehosted}`);

  let advInserted = 0, advSkipped = 0;
  for (const a of advances) {
    const userId = idMap.get(a.user_id);
    const givenBy = a.given_by ? idMap.get(a.given_by) ?? null : null;
    if (!userId) { console.error('[migrate] SKIP advance, unknown user_id', a.user_id, a.id); advSkipped++; continue; }

    let note = a.note || '';
    if (a.projects?.project_name) {
      note = `${note} [Project: ${a.projects.project_name}${a.projects.project_number ? ' (' + a.projects.project_number + ')' : ''}]`.trim();
    }

    const { error } = await dest.from('expense_advances').insert({
      org_id: orgId,
      user_id: userId,
      claim_id: null,
      amount: a.amount,
      advance_date: a.advance_date,
      note,
      given_by: givenBy,
      created_at: a.created_at,
    });
    if (error) { console.error('[migrate] advance insert failed', a.id, error.message); advSkipped++; continue; }
    advInserted++;
  }
  console.log(`[migrate] advances: ${advInserted} inserted, ${advSkipped} skipped`);

  console.log('[migrate] DONE.');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
