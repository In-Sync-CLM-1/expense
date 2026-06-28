// Seeds the "Prosync Engineering" demo org into the live expense project.
// Idempotent: wipes and re-creates the demo users/org/claims/advances each run.
// Usage: node scripts/seed-demo.mjs   (add SKIP_RECEIPTS=1 to skip receipt PNGs)
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv(new URL('../.env', import.meta.url));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = env.EXPENSE_DEMO_PASSWORD;
if (!PASSWORD) throw new Error('EXPENSE_DEMO_PASSWORD missing from .env');

const ORG = { name: 'Prosync Engineering', slug: 'prosync-engineering', industry: 'Engineering Services' };

const PEOPLE = [
  { key: 'kavita',  email: 'kavita@prosync-demo.in',  name: 'Kavita Rao',       phone: '+91 98200 11223', role: 'admin' },
  { key: 'rajesh',  email: 'rajesh@prosync-demo.in',  name: 'Rajesh Iyer',      phone: '+91 98331 44556', role: 'manager' },
  { key: 'priya',   email: 'priya@prosync-demo.in',   name: 'Priya Sharma',     phone: '+91 99670 77889', role: 'employee', reportsTo: 'rajesh' },
  { key: 'arjun',   email: 'arjun@prosync-demo.in',   name: 'Arjun Mehta',      phone: '+91 98920 33445', role: 'employee', reportsTo: 'rajesh' },
  { key: 'sandeep', email: 'sandeep@prosync-demo.in', name: 'Sandeep Kulkarni', phone: '+91 99300 66778', role: 'employee', reportsTo: 'rajesh' },
];

const T = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const TS = (days, hour = 11) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 17, 0, 0);
  return d.toISOString();
};

// Diverse expense types — travel is one of many.
const CLAIMS = [
  // Training claim — Priya — approved; has ₹12k advance against ₹18k approval → company owes ₹6k
  {
    key: 'aws_training', owner: 'priya',
    title: 'AWS Solutions Architect — training & exam',
    dest: 'Pune, Maharashtra',
    purpose: 'Cloud certification training — Solutions Architect Associate level',
    start: T(-18), end: T(-16), status: 'approved',
    submittedAt: TS(-15), approvedAt: TS(-10), approvedAmount: 18000,
    items: [
      { type: 'training',       desc: 'AWS course fee — Whizlabs',           amount: 12500, date: T(-18) },
      { type: 'accommodation',  desc: 'Hotel near training centre, 2 nights', amount:  3800, date: T(-17), receipt: { vendor: 'Hotel Citrus Pune',  kind: 'hotel'  } },
      { type: 'train',          desc: 'Mumbai–Pune return',                   amount:  1000, date: T(-18), receipt: { vendor: 'IRCTC e-Ticket',      kind: 'train'  } },
      { type: 'food',           desc: 'Meals — 3 days',                       amount:  1200, date: T(-16), receipt: { vendor: 'Various restaurants', kind: 'food'   } },
    ],
  },

  // Office supplies — Arjun — submitted
  {
    key: 'office_q2', owner: 'arjun',
    title: 'Office supplies — Q2 stationery & pantry',
    dest: null,
    purpose: 'Quarterly stationery restock and pantry items for the team',
    start: T(-4), end: T(-4), status: 'submitted', submittedAt: TS(-2),
    items: [
      { type: 'office_supplies', desc: 'Printer cartridges, notebooks, pens', amount: 2850, date: T(-4) },
      { type: 'food',            desc: 'Pantry — coffee, biscuits, water',    amount: 1450, date: T(-4) },
    ],
  },

  // Client entertainment — Priya — submitted
  {
    key: 'client_lunch', owner: 'priya',
    title: 'Swiggy pitch — BKC client lunch',
    dest: 'BKC, Mumbai',
    purpose: 'Client pitch and product demo at Swiggy HQ',
    start: T(-5), end: T(-5), status: 'submitted', submittedAt: TS(-3),
    items: [
      { type: 'entertainment', desc: 'Client lunch — The Table, BKC',     amount: 4200, date: T(-5) },
      { type: 'cab',           desc: 'Uber — office to BKC and return',   amount:  890, date: T(-5) },
    ],
  },

  // SaaS subscriptions — Arjun — reimbursed
  {
    key: 'saas_june', owner: 'arjun',
    title: 'SaaS tools — June subscriptions',
    dest: null,
    purpose: 'Monthly software subscriptions for the engineering team',
    start: T(-30), end: T(-30), status: 'reimbursed',
    submittedAt: TS(-28), approvedAt: TS(-25), approvedAmount: 7200, reimbursedAt: TS(-20),
    items: [
      { type: 'software', desc: 'Figma — Pro plan (June)',      amount: 3200, date: T(-30) },
      { type: 'software', desc: 'Zoom — Business plan',         amount: 2100, date: T(-30) },
      { type: 'software', desc: 'Notion — Team plan',           amount: 1900, date: T(-30) },
    ],
  },

  // Vendor visit — Sandeep — submitted; has ₹5k advance → unspent (not yet approved)
  {
    key: 'pune_vendor', owner: 'sandeep',
    title: 'Pune vendor review — Kirloskar',
    dest: 'Pune, Maharashtra',
    purpose: 'Annual quality audit at Kirloskar fabrication unit',
    start: T(-6), end: T(-5), status: 'submitted', submittedAt: TS(-3),
    items: [
      { type: 'train', desc: 'Mumbai–Pune Shatabdi return',         amount: 1250, date: T(-6), receipt: { vendor: 'IRCTC e-Ticket', kind: 'train' } },
      { type: 'food',  desc: 'Meals — 2 days',                      amount: 1100, date: T(-5), receipt: { vendor: 'Various',        kind: 'food'  } },
      { type: 'cab',   desc: 'Local transport to plant',            amount:  650, date: T(-5) },
    ],
  },

  // Conference — Rajesh — reimbursed
  {
    key: 'nasscom', owner: 'rajesh',
    title: 'Nasscom Technology Summit — Hyderabad',
    dest: 'Hyderabad, Telangana',
    purpose: 'Annual tech summit — industry networking and product showcase',
    start: T(-42), end: T(-40), status: 'reimbursed',
    submittedAt: TS(-39), approvedAt: TS(-36), approvedAmount: 28500, reimbursedAt: TS(-30),
    items: [
      { type: 'training',      desc: 'Delegate registration — Nasscom Summit',  amount: 12000, date: T(-42) },
      { type: 'airfare',       desc: 'BOM–HYD return, IndiGo',                  amount:  8200, date: T(-42), receipt: { vendor: 'IndiGo',           kind: 'flight' } },
      { type: 'accommodation', desc: 'Novotel Hyderabad, 2 nights',             amount:  6800, date: T(-41), receipt: { vendor: 'Novotel Hyderabad', kind: 'hotel'  } },
      { type: 'food',          desc: 'Meals — 3 days',                          amount:  1500, date: T(-40), receipt: { vendor: 'Various',           kind: 'food'   } },
    ],
  },

  // Medical — Sandeep — rejected (missing prescription)
  {
    key: 'medical_dental', owner: 'sandeep',
    title: 'Medical — dental procedure',
    dest: null,
    purpose: 'Root canal treatment — company medical reimbursement policy',
    start: T(-10), end: T(-10), status: 'rejected',
    submittedAt: TS(-8), rejectedAt: TS(-6),
    rejectionReason: 'Prescription from a registered dentist is missing — please attach and re-submit.',
    items: [
      { type: 'medical', desc: 'Root canal — Dr Mehta Dental Clinic', amount: 9500, date: T(-10) },
    ],
  },

  // WFH equipment — Arjun — reimbursed
  {
    key: 'wfh_setup', owner: 'arjun',
    title: 'WFH equipment — ergonomic setup',
    dest: null,
    purpose: 'Work-from-home ergonomic equipment per HR policy',
    start: T(-55), end: T(-55), status: 'reimbursed',
    submittedAt: TS(-53), approvedAt: TS(-50), approvedAmount: 8900, reimbursedAt: TS(-44),
    items: [
      { type: 'equipment', desc: 'Ergonomic chair — Featherlite',   amount: 6500, date: T(-55) },
      { type: 'equipment', desc: 'USB-C hub + monitor stand',        amount: 2400, date: T(-55) },
    ],
  },

  // Team dinner — Rajesh — reimbursed
  {
    key: 'team_dinner', owner: 'rajesh',
    title: 'Team dinner — Q1 close celebration',
    dest: 'Lower Parel, Mumbai',
    purpose: 'End-of-quarter team dinner',
    start: T(-35), end: T(-35), status: 'reimbursed',
    submittedAt: TS(-33), approvedAt: TS(-30), approvedAmount: 6800, reimbursedAt: TS(-25),
    items: [
      { type: 'entertainment', desc: 'Team dinner — Smoke House Deli, 8 pax', amount: 6800, date: T(-35), receipt: { vendor: 'Smoke House Deli', kind: 'food' } },
    ],
  },

  // Draft — upcoming travel — Priya
  {
    key: 'bengaluru_draft', owner: 'priya',
    title: 'Bengaluru client visit — July',
    dest: 'Bengaluru, Karnataka',
    purpose: 'On-site implementation review — Phase 2',
    start: T(5), end: T(7), status: 'draft',
    items: [
      { type: 'airfare', desc: 'Advance booking — BOM–BLR return', amount: 5800, date: T(5) },
    ],
  },
];

// Three advance records that tell a clear reconciliation story:
// 1. Priya/aws_training: advance ₹12k vs approved ₹18k → company owes Priya ₹6k (Payable)
// 2. Sandeep/pune_vendor: advance ₹5k vs not-yet-approved → unspent ₹5k (to recover)
// 3. Arjun/general: ₹3k float, no claim → unspent (to recover)
const ADVANCES = [
  { owner: 'priya',   claim: 'aws_training', amount: 12000, date: T(-19), note: 'Cash advance for AWS training and exam fees', by: 'kavita' },
  { owner: 'sandeep', claim: 'pune_vendor',  amount:  5000, date: T(-8),  note: 'Advance for Pune vendor review',              by: 'kavita' },
  { owner: 'arjun',   claim: null,           amount:  3000, date: T(-35), note: 'General petty cash float — Q2',               by: 'kavita' },
];

// ── receipt PNG rendering ────────────────────────────────────────────────────
const RECEIPT_HTML = ({ vendor, kind, amount, date, desc }) => {
  const inr = amount.toLocaleString('en-IN');
  const lines = {
    cab:    [['Base fare', Math.round(amount * 0.72)], ['Distance + time', Math.round(amount * 0.2)], ['GST (5%)', Math.round(amount * 0.08)]],
    hotel:  [['Room charges', Math.round(amount * 0.84)], ['CGST (6%)', Math.round(amount * 0.08)], ['SGST (6%)', Math.round(amount * 0.08)]],
    flight: [['Base fare', Math.round(amount * 0.78)], ['Taxes & fees', Math.round(amount * 0.16)], ['Convenience fee', Math.round(amount * 0.06)]],
    train:  [['Ticket fare', Math.round(amount * 0.94)], ['Reservation + GST', Math.round(amount * 0.06)]],
    food:   [['Food & beverages', Math.round(amount * 0.95)], ['GST (5%)', Math.round(amount * 0.05)]],
  }[kind] ?? [['Charges', amount]];
  const rows = lines.map(([l, v]) => `<tr><td>${l}</td><td class="r">₹${v.toLocaleString('en-IN')}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#e8e8e4;font-family:'Courier New',monospace;display:flex;justify-content:center;padding:24px}
    .slip{background:#fffdf8;width:340px;padding:22px 24px;box-shadow:0 2px 10px rgba(0,0,0,.18)}
    h1{font-size:17px;text-align:center;margin:0 0 2px;letter-spacing:.5px}
    .sub{text-align:center;font-size:10px;color:#666;margin-bottom:10px}
    .meta{font-size:11px;color:#444;border-top:1px dashed #999;border-bottom:1px dashed #999;padding:7px 0;margin-bottom:8px}
    table{width:100%;font-size:12px;border-collapse:collapse}
    td{padding:3px 0}.r{text-align:right}
    .tot{border-top:1px solid #333;font-weight:bold;font-size:14px}
    .foot{text-align:center;font-size:10px;color:#888;margin-top:12px}
  </style></head><body><div class="slip">
    <h1>${vendor}</h1>
    <div class="sub">GSTIN: 27ABCDE${Math.floor(1000 + Math.random() * 9000)}F1Z${Math.floor(Math.random() * 9)} · Tax Invoice</div>
    <div class="meta">Date: ${date}<br/>${desc}</div>
    <table>${rows}<tr class="tot"><td>TOTAL</td><td class="r">₹${inr}</td></tr></table>
    <div class="foot">** Thank you for your business **</div>
  </div></body></html>`;
};

async function renderReceipt(page, spec) {
  await page.setContent(RECEIPT_HTML(spec));
  return await page.locator('.slip').screenshot({ type: 'png' });
}

// ── main ─────────────────────────────────────────────────────────────────────
const log = (...a) => console.log('[seed]', ...a);

async function findUserByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page++;
  }
}

log('cleaning previous demo state…');
{
  const { error } = await sb.from('organizations').delete().eq('slug', ORG.slug);
  if (error) throw error;
}

log('creating/updating users…');
const ids = {};
for (const p of PEOPLE) {
  const existing = await findUserByEmail(p.email);
  if (existing) {
    const { error } = await sb.auth.admin.updateUserById(existing.id, {
      password: PASSWORD, email_confirm: true, user_metadata: { full_name: p.name },
    });
    if (error) throw error;
    ids[p.key] = existing.id;
    log('updated user', p.email);
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: p.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: p.name },
    });
    if (error) throw error;
    ids[p.key] = data.user.id;
    log('created user', p.email);
  }
}
for (const p of PEOPLE) {
  const { error } = await sb.from('profiles').upsert({
    id: ids[p.key], email: p.email, full_name: p.name, phone: p.phone,
    reports_to: p.reportsTo ? ids[p.reportsTo] : null, is_active: true,
  }, { onConflict: 'id' });
  if (error) throw error;
}
log('users ready:', Object.keys(ids).join(', '));

log('creating org…');
const { data: org, error: orgInsErr } = await sb.from('organizations')
  .insert({ ...ORG, created_by: ids.kavita, is_active: true })
  .select('id').single();
if (orgInsErr) throw orgInsErr;
const orgId = org.id;
{
  const { error } = await sb.from('org_memberships').insert(
    PEOPLE.map(p => ({ org_id: orgId, user_id: ids[p.key], role: p.role, is_active: true }))
  );
  if (error) throw error;
}
log('org', orgId);

log('creating claims…');
const claimIds = {};
for (const c of CLAIMS) {
  const row = {
    user_id: ids[c.owner],
    org_id: orgId,
    trip_title: c.title,
    trip_start_date: c.start,
    trip_end_date: c.end,
    destination: c.dest ?? null,
    purpose: c.purpose,
    status: c.status,
    submitted_at: c.submittedAt ?? null,
    approved_by: (c.approvedAt || c.rejectedAt) ? ids.rajesh : null,
    approved_at: c.approvedAt ?? c.rejectedAt ?? null,
    approved_amount: c.approvedAmount ?? null,
    rejection_reason: c.rejectionReason ?? null,
    reimbursed_at: c.reimbursedAt ?? null,
  };
  const { data, error } = await sb.from('travel_expense_claims').insert(row).select('id').single();
  if (error) throw error;
  claimIds[c.key] = data.id;
  const { error: itemsErr } = await sb.from('travel_expense_items').insert(
    c.items.map(it => ({
      claim_id: data.id, expense_type: it.type, description: it.desc,
      amount: it.amount, expense_date: it.date,
    }))
  );
  if (itemsErr) throw itemsErr;
}
log('claims:', Object.keys(claimIds).length);

if (!process.env.SKIP_RECEIPTS) {
  log('rendering + uploading receipts…');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 480, height: 640 }, deviceScaleFactor: 2 });
  for (const c of CLAIMS) {
    const withReceipts = c.items.filter(it => it.receipt);
    if (withReceipts.length === 0) continue;
    const { data: dbItems, error } = await sb.from('travel_expense_items')
      .select('id, description').eq('claim_id', claimIds[c.key]);
    if (error) throw error;
    for (const it of withReceipts) {
      const dbItem = dbItems.find(d => d.description === it.desc);
      if (!dbItem) continue;
      const png = await renderReceipt(page, { ...it.receipt, amount: it.amount, date: it.date, desc: it.desc });
      const path = `${ids[c.owner]}/${claimIds[c.key]}/receipts/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`;
      const up = await sb.storage.from('expense-receipts').upload(path, png, { contentType: 'image/png' });
      if (up.error) throw up.error;
      const { data: signed } = await sb.storage.from('expense-receipts').createSignedUrl(path, 60 * 60 * 24 * 365);
      await sb.from('travel_expense_items')
        .update({ receipt_url: signed?.signedUrl ?? null, receipt_name: `${it.receipt.vendor}.png` })
        .eq('id', dbItem.id);
    }
    log('receipts attached:', c.key);
  }
  await browser.close();
}

log('recording advances…');
{
  const { error } = await sb.from('expense_advances').insert(
    ADVANCES.map(a => ({
      org_id: orgId,
      user_id: ids[a.owner],
      claim_id: a.claim ? claimIds[a.claim] : null,
      amount: a.amount,
      advance_date: a.date,
      note: a.note,
      given_by: ids[a.by],
    }))
  );
  if (error) throw error;
}

log('DONE. org_id =', orgId);
