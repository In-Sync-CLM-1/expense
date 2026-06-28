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
        <div class="row"><span>Claims awaiting approval</span><span class="v warn">3</span></div>
        <div class="row"><span>Approved this month</span><span class="v good">₹62,400</span></div>
        <div class="row"><span>Advances outstanding</span><span class="v warn">2</span></div>
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
    narration: 'Every employee expense — meals, office supplies, software, travel, or training — deserves the same structured workflow. This is In-Sync Expense Claims, shown with a live demo organisation and real seeded data.',
    beats: async ({ page, D, ready }) => {
      await titleCard(page, {
        title: 'One workflow for every employee expense',
        subtitle: 'From office stationery and software subscriptions to client lunches and travel — file, approve, and reimburse in one place.',
      });
      const waitUntil = await ready(300);
      await waitUntil(D);
    },
  },

  's1-dashboard': {
    name: 's1-dashboard',
    account: ACCT.admin,
    narration: 'The admin opens on a dashboard that separates personal claims from the organisation overview — pending approvals, total approved spend, and any advances requiring attention are visible the moment you log in.',
    beats: async ({ page, at, D, ready }) => {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
      await waitVisible(page, 'Organisation Overview');
      const waitUntil = await ready(1200);
      const cap = await caption(page, 'Admin dashboard — personal status plus org-wide spend');
      await waitUntil(at('Organisation Overview', 3, -0.2));
      const overview = page.getByText('Organisation Overview').first();
      const r1 = await ring(page, overview, { label: 'Organisation overview' });
      await waitUntil(at('pending approvals', 8, -0.2));
      if (r1) await removeAnn(page, r1);
      const pending = page.getByText('Awaiting Approval').first();
      const r2 = await ring(page, pending, { label: 'Approvals queue' });
      await waitUntil(at('advances', 13, -0.2));
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
    narration: 'For employees, the same app is a personal expense desk. Priya can see every claim she has filed — a training trip, a client lunch, office supplies — along with her pending status and any advance balance.',
    beats: async ({ page, at, D, ready }) => {
      await page.goto(`${BASE}/my-expenses`, { waitUntil: 'networkidle' });
      await waitVisible(page, 'My Expenses');
      const waitUntil = await ready(1400);
      await waitUntil(at('personal expense desk', 2.5, -0.1));
      const r1 = await ring(page, page.getByText('My Expenses').first(), { label: 'My expense claims' });
      await waitUntil(at('pending status', 9, -0.2));
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
    narration: 'Creating a claim is two steps: first the details — a title, the dates it covers, and an optional location or project reference — then the individual expense lines with category and amount. Here Priya is filing an office supplies claim.',
    beats: async ({ page, at, D, ready }) => {
      const today = new Date().toISOString().slice(0, 10);
      await page.goto(`${BASE}/my-expenses`, { waitUntil: 'networkidle' });
      await waitVisible(page, 'New Expense Claim');
      const waitUntil = await ready(800);
      await waitUntil(at('Creating', 1.5, -0.1));
      await clickLocator(page, page.getByRole('button', { name: /New Expense Claim/i }).first(), { dur: 700 });
      await page.getByText('Claim Title').waitFor({ timeout: 15000 });
      await page.getByPlaceholder(/Client meeting/i).fill('Office supplies — July restock');
      await page.locator('input[type="date"]').first().fill(today);
      await page.locator('input[type="date"]').nth(1).fill(today);
      await page.getByPlaceholder(/Delhi office/i).fill('Mumbai office');
      await page.getByPlaceholder(/Brief description/i).fill('Monthly stationery and pantry restock');
      const r1 = await ring(page, page.getByText('Claim Title').first(), { label: 'Claim title — not just trips' });
      await waitUntil(at('expense lines', 9, -0.2));
      if (r1) await removeAnn(page, r1);
      await clickLocator(page, page.getByRole('button', { name: /Next/i }).first(), { dur: 550 });
      await page.getByText('Add Expenses').waitFor({ timeout: 15000 });
      await page.getByRole('combobox').first().click();
      await page.getByRole('option', { name: /Office Supplies/i }).click();
      await page.locator('input[type="date"]').first().fill(today);
      await page.getByPlaceholder('0.00').fill('2850');
      await page.getByPlaceholder('Brief description').fill('Printer cartridges, notebooks, pens');
      const r2 = await ring(page, page.getByText('Office Supplies').first(), { label: 'Category — any type, not just travel' });
      await waitUntil(at('office supplies claim', 16, -0.2));
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
    narration: 'Submitted claims from the whole team land in the approval queue — a vendor visit, an office supply run, a client lunch. The manager sees who filed it, the total claimed, and can approve with an exact reimbursable amount or reject with a reason.',
    beats: async ({ page, at, D, ready }) => {
      await page.goto(`${BASE}/approvals`, { waitUntil: 'networkidle' });
      await waitVisible(page, 'Expense Approvals');
      const waitUntil = await ready(1200);
      const cap = await caption(page, 'Manager review queue');
      await waitUntil(at('approval queue', 5, -0.2));
      const r1 = await ring(page, page.getByText('Pending').first(), { label: 'Pending claims' });
      await waitUntil(at('total claimed', 11, -0.2));
      if (r1) await removeAnn(page, r1);
      const amount = page.getByText(/₹/).first();
      const r2 = await ring(page, amount, { label: 'Claim amount' });
      await waitUntil(at('approve with', 16, -0.2));
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
    narration: 'Advances track money given to employees before they spend it. Finance records each advance — selecting the employee, entering the amount, and linking it to the specific claim — so that once the claim is approved, the balances reconcile automatically. Unspent advances show what to recover. Payable advances show what the company still owes the employee.',
    beats: async ({ page, at, D, ready }) => {
      const today = new Date().toISOString().slice(0, 10);
      await page.goto(`${BASE}/advances`, { waitUntil: 'networkidle' });
      await waitVisible(page, 'Advances');
      const waitUntil = await ready(1200);

      // Show KPIs
      await waitUntil(at('Finance records', 4, -0.2));
      const r1 = await ring(page, page.getByText('Total Advances Given').first(), { label: 'Total advanced this cycle' });

      // Click Record Advance header button
      await waitUntil(at('selecting the employee', 6, -0.3));
      if (r1) await removeAnn(page, r1);
      await clickLocator(page, page.getByRole('button', { name: /Record Advance/i }).first(), { dur: 700 });
      await page.getByText('Record an advance').waitFor({ timeout: 15000 });
      await page.waitForTimeout(500);

      // Select employee: Priya via the combobox popover
      // Employee Button is nth(0) combobox; SelectTrigger is nth(1) but disabled until emp selected
      await page.getByRole('combobox').first().click();
      await page.waitForTimeout(400);
      await page.getByPlaceholder('Search employee…').waitFor({ timeout: 8000 });
      await page.getByPlaceholder('Search employee…').fill('Priya');
      await page.waitForTimeout(600);
      // Use role=option — CMDK CommandItems have role=option, unlike the background table cells
      await page.getByRole('option', { name: /Priya Sharma/ }).first().waitFor({ timeout: 8000 });
      await page.getByRole('option', { name: /Priya Sharma/ }).first().click();
      await page.waitForTimeout(1000); // wait for popover close + claim list to load

      // Fill amount and date
      await waitUntil(at('entering the amount', 9, -0.2));
      await page.getByPlaceholder('0.00').fill('10000');
      await page.locator('input[type="date"]').first().fill(today);
      await page.waitForTimeout(300);

      // Link to claim via Radix Select (second combobox role in dialog)
      await waitUntil(at('linking it', 11, -0.2));
      await page.getByRole('combobox').nth(1).click();
      await page.waitForTimeout(600);
      await page.getByRole('option', { name: /AWS Solutions Architect/i }).first().waitFor({ timeout: 10000 });
      await page.getByRole('option', { name: /AWS Solutions Architect/i }).first().click();
      await page.waitForTimeout(400);

      // Fill note
      await page.getByPlaceholder(/cash advance/i).fill('Cash advance for training programme');
      await page.waitForTimeout(300);

      // Ring the dialog to show all fields filled
      const r2 = await ring(page, page.getByText('Link to claim').first(), { label: 'Advance linked to the claim' });
      await waitUntil(at('reconcile automatically', 16, -0.3));
      if (r2) await removeAnn(page, r2);

      // Submit — scope to dialog to avoid clicking the header button
      await page.getByRole('dialog').getByRole('button', { name: /Record Advance/ }).click();
      await page.waitForTimeout(1800);

      // Show reconciliation KPIs — Unspent and Payable
      await waitUntil(at('Unspent advances', 19, -0.2));
      const r3 = await ring(page, page.getByText('Unspent (to recover)').first(), { label: 'Advance to recover' });
      await waitUntil(at('Payable advances', 22, -0.2));
      if (r3) await removeAnn(page, r3);
      const r4 = await ring(page, page.getByText('Payable (overspent)').first(), { label: 'Company still owes employee' });
      await waitUntil(D - 0.8);
      if (r4) await removeAnn(page, r4);
      await waitUntil(D);
    },
  },

  's6-reports': {
    name: 's6-reports',
    account: ACCT.admin,
    narration: 'Reports turn the same operational data into finance outputs. Monthly summaries, team views, the reimbursement queue, and CSV exports are ready without rebuilding spreadsheets.',
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
      await waitUntil(at('reimbursement queue', 11.5, -0.2));
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
    narration: 'The approval loop closes with email notifications. Managers are alerted when a claim needs review, and employees hear back the moment it is approved or rejected.',
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
    narration: 'That is the full workflow: file any expense, approve it, reconcile advances, export the finance view, and keep everyone informed — all from one live system.',
    beats: async ({ page, D, ready }) => {
      await titleCard(page, {
        title: 'From any expense to reimbursement — one place',
        subtitle: 'Meals, travel, software, training, equipment — every claim goes through a single structured workflow: submit, approve, and reimburse.',
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
