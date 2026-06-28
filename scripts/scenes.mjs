import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { BASE, ORG } from './lib/app.mjs';
import { ACCT } from './lib/scene.mjs';
import { caption, removeCaption, ring, removeAnn, zoomTo, zoomReset, dim, showCard, hideCard } from './lib/annotate.mjs';
import { clickLocator, moveToLocator } from './lib/cursor.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const notifDir = join(here, 'recordings', 'notif');

async function titleCard(page, { title, subtitle, kicker = 'In-Sync Expense Claims' }) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;width:100vw;height:100vh;font-family:Inter,Segoe UI,Arial,sans-serif;background:#f8fafc;color:#111827;overflow:hidden}
    .wrap{height:100vh;display:grid;grid-template-columns:1.05fr .95fr}
    .left{padding:86px 72px;display:flex;flex-direction:column;justify-content:center}
    .right{background:#0f766e;color:#fff;padding:58px;display:flex;align-items:center;justify-content:center}
    .k{font-size:15px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#0f766e;margin-bottom:22px}
    h1{font-size:58px;line-height:1.02;margin:0 0 22px;font-weight:850;letter-spacing:0}
    p{font-size:23px;line-height:1.42;margin:0;color:#475569;max-width:700px}
    .panel{width:470px;background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.22);border-radius:18px;padding:30px;box-shadow:0 24px 80px rgba(15,23,42,.28)}
    .row{display:flex;justify-content:space-between;gap:22px;border-bottom:1px solid rgba(255,255,255,.2);padding:16px 0;font-size:18px}
    .row:last-child{border-bottom:0}.v{font-weight:850}.good{color:#a7f3d0}.warn{color:#fde68a}
    .org{position:absolute;left:72px;bottom:42px;color:#64748b;font-size:16px}
  </style></head><body>
    <div class="wrap">
      <section class="left"><div class="k">${kicker}</div><h1>${title}</h1><p>${subtitle}</p></section>
      <section class="right"><div class="panel">
        <div class="row"><span>Claims awaiting approval</span><span class="v warn">2</span></div>
        <div class="row"><span>Approved this month</span><span class="v good">₹39,450</span></div>
        <div class="row"><span>Advance exceptions</span><span class="v warn">3</span></div>
        <div class="row"><span>Export-ready finance data</span><span class="v good">Live</span></div>
      </div></section>
    </div><div class="org">${ORG.name}</div>
  </body></html>`);
}

async function waitVisible(page, text, timeout = 25000) {
  const loc = page.getByText(text, { exact: false }).first();
  await loc.waitFor({ timeout });
  return loc;
}

export const SCENE_MAP = {
  's0-open': {
    name: 's0-open',
    account: ACCT.guest,
    narration: 'Expense claims only work when employees, managers, and finance all see the same picture. This is In-Sync Expense Claims, shown with a live demo organisation and real seeded travel data.',
    beats: async ({ page, D, ready }) => {
      await titleCard(page, {
        title: 'Expense control without spreadsheet follow-up',
        subtitle: 'Employees submit travel claims, managers approve with context, and finance sees advances, reimbursements, and exports from one place.',
      });
      const waitUntil = await ready(300);
      await waitUntil(D);
    },
  },
  's1-dashboard': {
    name: 's1-dashboard',
    account: ACCT.admin,
    narration: 'The admin opens on a dashboard that separates personal claims from the organisation overview, so pending approvals and approved spend are visible immediately.',
    beats: async ({ page, at, D, ready }) => {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
      await waitVisible(page, 'Organisation Overview');
      const waitUntil = await ready(1200);
      const cap = await caption(page, 'Admin dashboard: personal status plus organisation spend');
      await waitUntil(at('dashboard', 3, -0.2));
      const overview = page.getByText('Organisation Overview').first();
      const r1 = await ring(page, overview, { label: 'Organisation overview' });
      await waitUntil(at('pending approvals', 8, -0.2));
      if (r1) await removeAnn(page, r1);
      const pending = page.getByText('Awaiting Approval').first();
      const r2 = await ring(page, pending, { label: 'Approvals queue' });
      await waitUntil(at('approved spend', 13, -0.2));
      if (r2) await removeAnn(page, r2);
      const approved = page.getByText('Approved Amount').first();
      const r3 = await ring(page, approved, { label: 'Approved spend' });
      await waitUntil(D - 0.8);
      if (r3) await removeAnn(page, r3);
      await removeCaption(page, cap);
      await waitUntil(D);
    },
  },
  's2-employee-claims': {
    name: 's2-employee-claims',
    account: ACCT.member,
    mobile: true,
    narration: 'For the employee, the same app becomes a travel claim desk. Priya can see her own trips, pending claims, approved claims, and any advance balance before she files the next expense.',
    beats: async ({ page, at, D, ready }) => {
      await page.goto(`${BASE}/my-expenses`, { waitUntil: 'networkidle' });
      await waitVisible(page, 'Travel Expenses');
      const waitUntil = await ready(1400);
      await waitUntil(at('employee', 2.5, -0.1));
      const r1 = await ring(page, page.getByText('Travel Expenses').first(), { label: 'My travel claims' });
      await waitUntil(at('pending claims', 9, -0.2));
      if (r1) await removeAnn(page, r1);
      const r2 = await ring(page, page.getByText('Pending').first(), { label: 'Pending total' });
      await waitUntil(at('advance balance', 15, -0.2));
      if (r2) await removeAnn(page, r2);
      const summary = page.getByText('My Advances').first();
      const r3 = await ring(page, summary, { label: 'Advance position' });
      await waitUntil(D - 0.6);
      if (r3) await removeAnn(page, r3);
      await waitUntil(D);
    },
  },
  's3-new-claim': {
    name: 's3-new-claim',
    account: ACCT.member,
    narration: 'Creating a claim is deliberately structured: first the trip, then each expense line, receipt, amount, and date. The employee can save a draft or submit it for approval when everything is ready.',
    beats: async ({ page, at, D, ready }) => {
      await page.goto(`${BASE}/my-expenses`, { waitUntil: 'networkidle' });
      await waitVisible(page, 'New Expense Claim');
      const waitUntil = await ready(800);
      await waitUntil(at('Creating', 1.5, -0.1));
      await clickLocator(page, page.getByRole('button', { name: /New Expense Claim/i }).first(), { dur: 700 });
      await page.getByText('Trip Details').waitFor({ timeout: 15000 });
      await page.getByPlaceholder(/Client meeting/i).fill('Bhopal vendor review');
      await page.locator('input[type="date"]').first().fill('2026-06-18');
      await page.locator('input[type="date"]').nth(1).fill('2026-06-19');
      await page.getByPlaceholder(/Mumbai, Maharashtra/i).fill('Bhopal, Madhya Pradesh');
      await page.getByPlaceholder(/Brief purpose/i).fill('Vendor review and documentation handover');
      const r1 = await ring(page, page.getByText('Trip Details').first(), { label: 'Trip context first' });
      await waitUntil(at('expense line', 9, -0.2));
      if (r1) await removeAnn(page, r1);
      await clickLocator(page, page.getByRole('button', { name: /Next/i }).first(), { dur: 550 });
      await page.getByText('Add Expenses').waitFor({ timeout: 15000 });
      await page.getByRole('combobox').first().click();
      await page.getByRole('option', { name: /Hotel/i }).click();
      await page.locator('input[type="date"]').first().fill('2026-06-18');
      await page.getByPlaceholder('0.00').fill('4200');
      await page.getByPlaceholder('Brief description').fill('One night business hotel');
      const r2 = await ring(page, page.getByText('Total Amount').first(), { label: 'Total updates automatically' });
      await waitUntil(at('save a draft', 16, -0.2));
      if (r2) await removeAnn(page, r2);
      const r3 = await ring(page, page.getByRole('button', { name: /Save Draft/i }).first(), { label: 'Draft or submit' });
      await waitUntil(D - 0.7);
      if (r3) await removeAnn(page, r3);
      await page.keyboard.press('Escape');
      await waitUntil(D);
    },
  },
  's4-approvals': {
    name: 's4-approvals',
    account: ACCT.manager,
    narration: 'On the manager side, submitted claims arrive in the approval queue. The reviewer sees who travelled, where they went, the amount claimed, and can approve or reject without chasing email threads.',
    beats: async ({ page, at, D, ready }) => {
      await page.goto(`${BASE}/approvals`, { waitUntil: 'networkidle' });
      await waitVisible(page, 'Expense Approvals');
      const waitUntil = await ready(1200);
      const cap = await caption(page, 'Manager review queue');
      await waitUntil(at('approval queue', 5, -0.2));
      const r1 = await ring(page, page.getByText('Pending').first(), { label: 'Pending claims' });
      await waitUntil(at('amount claimed', 12, -0.2));
      if (r1) await removeAnn(page, r1);
      const amount = page.getByText(/₹/).first();
      const r2 = await ring(page, amount, { label: 'Claim amount' });
      await waitUntil(at('approve or reject', 17, -0.2));
      if (r2) await removeAnn(page, r2);
      const approve = page.getByRole('button', { name: /Approve/i }).first();
      await moveToLocator(page, approve, 650);
      const r3 = await ring(page, approve, { label: 'Approve action' });
      await waitUntil(D - 0.8);
      if (r3) await removeAnn(page, r3);
      await removeCaption(page, cap);
      await waitUntil(D);
    },
  },
  's5-advances': {
    name: 's5-advances',
    account: ACCT.admin,
    narration: 'Finance can also track advances. Money given before a trip is reconciled against approved expenses, making unspent balances, payable differences, and settled trips clear at a glance.',
    beats: async ({ page, at, D, ready }) => {
      await page.goto(`${BASE}/advances`, { waitUntil: 'networkidle' });
      await waitVisible(page, 'Advances');
      const waitUntil = await ready(1200);
      await waitUntil(at('track advances', 4, -0.2));
      const r1 = await ring(page, page.getByText('Total Advances Given').first(), { label: 'Advances given' });
      await waitUntil(at('unspent balances', 10, -0.2));
      if (r1) await removeAnn(page, r1);
      const r2 = await ring(page, page.getByText('Unspent').first(), { label: 'Recoverable balance' });
      await waitUntil(at('payable differences', 13, -0.2));
      if (r2) await removeAnn(page, r2);
      const r3 = await ring(page, page.getByText('Payable').first(), { label: 'Company still owes' });
      await waitUntil(at('settled trips', 17, -0.2));
      if (r3) await removeAnn(page, r3);
      const table = page.getByText('By employee').first();
      const r4 = await ring(page, table, { label: 'Employee and trip reconciliation' });
      await waitUntil(D - 0.7);
      if (r4) await removeAnn(page, r4);
      await waitUntil(D);
    },
  },
  's6-reports': {
    name: 's6-reports',
    account: ACCT.admin,
    narration: 'Reports turn the same operational data into finance outputs. Monthly summaries, team views, reimbursement queues, and CSV exports are ready without rebuilding spreadsheets.',
    beats: async ({ page, at, D, ready }) => {
      await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle' });
      await waitVisible(page, 'Expense Reports');
      const waitUntil = await ready(1300);
      const cap = await caption(page, 'Finance reports and exports');
      await waitUntil(at('Monthly summaries', 4, -0.2));
      const r1 = await ring(page, page.getByText('Monthly Summary').first(), { label: 'Monthly summary' });
      await waitUntil(at('team views', 8, -0.2));
      if (r1) await removeAnn(page, r1);
      await clickLocator(page, page.getByRole('tab', { name: /By Team/i }).first(), { dur: 650 });
      const r2 = await ring(page, page.getByText('Team Summary').first(), { label: 'Team view' });
      await waitUntil(at('reimbursement queues', 11.5, -0.2));
      if (r2) await removeAnn(page, r2);
      await clickLocator(page, page.getByRole('tab', { name: /Pending Reimbursement/i }).first(), { dur: 650 });
      const r3 = await ring(page, page.getByText('Pending Reimbursement').first(), { label: 'Reimbursement queue' });
      await waitUntil(at('CSV exports', 15, -0.2));
      if (r3) await removeAnn(page, r3);
      const r4 = await ring(page, page.getByRole('button', { name: /Export/i }).first(), { label: 'CSV export' });
      await waitUntil(D - 0.7);
      if (r4) await removeAnn(page, r4);
      await removeCaption(page, cap);
      await waitUntil(D);
    },
  },
  's7-notifications': {
    name: 's7-notifications',
    account: ACCT.admin,
    narration: 'The approval loop is closed with email notifications. Managers are alerted when a claim needs review, and employees are told when their claim is approved.',
    beats: async ({ page, at, D, ready }) => {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
      await waitVisible(page, 'Dashboard');
      const waitUntil = await ready(900);
      await waitUntil(at('email notifications', 5, -0.2));
      await dim(page, true);
      const submitted = await showCard(page, join(notifDir, 'submitted-email.png'), { top: 56, right: 34, width: 410, label: 'Manager notification', accent: '#0f766e' });
      await waitUntil(at('needs review', 11, -0.2));
      const approved = await showCard(page, join(notifDir, 'approved-email.png'), { top: 138, right: 472, width: 410, label: 'Employee notification', accent: '#2563eb' });
      await waitUntil(D - 0.8);
      await hideCard(page, submitted);
      await hideCard(page, approved);
      await dim(page, false);
      await waitUntil(D);
    },
  },
  's8-close': {
    name: 's8-close',
    account: ACCT.guest,
    narration: 'That is the core flow: file the claim, review it, reconcile advances, export the finance view, and keep everyone informed from one live system.',
    beats: async ({ page, D, ready }) => {
      await titleCard(page, {
        title: 'One live workflow from claim to reimbursement',
        subtitle: 'Built for travel expenses, approval control, advance reconciliation, and clean finance handoff.',
        kicker: 'In-Sync Expense Claims',
      });
      const waitUntil = await ready(300);
      await zoomTo(page, page.locator('.panel'), 1.08, 1000);
      await waitUntil(D - 1.2);
      await zoomReset(page, 700);
      await waitUntil(D);
    },
  },
};

const PROSPECT_ORDER = [
  's0-open',
  's1-dashboard',
  's2-employee-claims',
  's3-new-claim',
  's4-approvals',
  's5-advances',
  's6-reports',
  's7-notifications',
  's8-close',
];

export const SCENES = PROSPECT_ORDER.map((name) => SCENE_MAP[name]);
