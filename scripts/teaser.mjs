// Expense Claims teaser — v2 "1 main + 3 subsets" (approved standard).
// Built entirely from surviving walkthrough slices + guest title cards
// (backend parked — no live app, no login).
//   MAIN    — managers judge the claim; everything else files itself
//   SUBSET 1 — file in a minute (details + lines, from anywhere)
//   SUBSET 2 — approve in one queue (exact amount; advances reconcile themselves)
//   SUBSET 3 — month-end is already built (reports + CSV, no Excel weekend)
// Hook names pain + product first; three numbered chapters; close restates
// main + subsets + per-user pricing + demo CTA. Nothing else.
import { ACCT } from './lib/scene.mjs';

const HOOK_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:1366px;height:768px;font-family:'Segoe UI',Arial,sans-serif;background:radial-gradient(120% 120% at 20% 0%,#132c40 0%,#0d2030 55%,#061118 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fff}
  .kicker{font-size:19px;font-weight:700;color:#38bdf8;letter-spacing:3px;text-transform:uppercase}
  h1{font-size:56px;font-weight:800;letter-spacing:-1.5px;line-height:1.16;max-width:86%;margin-top:22px}
  .sub{font-size:26px;font-weight:400;color:rgba(255,255,255,.78);margin-top:26px;max-width:72%;line-height:1.45}
</style></head><body>
  <div class="kicker">Expense Claims &middot; Expense Management</div>
  <h1>Your team spent.<br>Do you know what was approved?</h1>
  <div class="sub">Expense Claims does the filing, the chasing, and the month-end.</div>
</body></html>`;

const CLOSE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:1366px;height:768px;font-family:'Segoe UI',Arial,sans-serif;background:radial-gradient(120% 120% at 20% 0%,#132c40 0%,#0d2030 55%,#061118 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fff}
  .kicker{font-size:19px;font-weight:700;color:#38bdf8;letter-spacing:3px;text-transform:uppercase}
  h1{font-size:52px;font-weight:800;letter-spacing:-1.5px;line-height:1.16;margin-top:16px}
  .grid{display:grid;grid-template-columns:1fr 1fr;margin-top:32px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:16px;overflow:hidden}
  .grid .l{font-size:21px;font-weight:400;color:rgba(255,255,255,.5);padding:13px 26px;text-align:right;display:flex;align-items:center;justify-content:flex-end}
  .grid .r{font-size:21px;font-weight:600;color:#7dd3fc;padding:13px 26px;text-align:left;border-left:1px solid rgba(255,255,255,.15);display:flex;align-items:center}
  .price{font-size:23px;font-weight:600;color:rgba(255,255,255,.92);margin-top:30px}
  .cta{font-size:25px;font-weight:500;color:rgba(255,255,255,.85);margin-top:12px}
</style></head><body>
  <div class="kicker">Expense Claims</div>
  <h1>Managers judge the claim.<br>Everything else files itself.</h1>
  <div class="grid">
    <div class="l">Paper bills + a WhatsApp photo trail</div><div class="r">Filed in a minute, categorised</div>
    <div class="l">Approvals chased across desks for weeks</div><div class="r">One queue &mdash; approve the exact amount</div>
    <div class="l">Month-end: an Excel weekend</div><div class="r">Reports &amp; CSV export, ready</div>
  </div>
  <div class="price">Priced per user &middot; quoted the same day</div>
  <div class="cta">expense.in-sync.co.in &middot; Book a demo &mdash; bring last month&rsquo;s claims pile</div>
</body></html>`;

export const SCENES = [

// 0 — hook: pain + product named up front
{
  name: 'x0-hook', account: ACCT.guest,
  narration: "Your team spent. Do you know what was approved — and what's still owed? Expense Claims does the filing, the chasing, and the month-end.",
  beats: async ({ page, D, ready }) => {
    await page.setContent(HOOK_HTML, { waitUntil: 'load' });
    const waitUntil = await ready(300);
    await waitUntil(D);
  },
},

// 1 — SUBSET 1: file in a minute (slice: new claim)
{
  name: 'x1-claim', slice: { src: 's3-new-claim-v.mp4', from: 2 },
  narration: "One — filing takes a minute. Details, expense lines, category, amount — from anywhere.",
},

// 2a — SUBSET 2: approve in one queue (slice: approvals)
{
  name: 'x2a-approve', slice: { src: 's4-approvals-v.mp4', from: 2 },
  narration: "Two — approvals live in one queue. The manager approves the exact amount, or rejects with a reason. The judgment stays human.",
},

// 2b — …advances reconcile themselves (slice)
{
  name: 'x2b-advances', slice: { src: 's5-advances-v.mp4', from: 2 },
  narration: "Advances reconcile themselves against approved claims — no side ledgers.",
},

// 3 — SUBSET 3: month-end is already built (slice: reports)
{
  name: 'x3-reports', slice: { src: 's6-reports-v.mp4', from: 2 },
  narration: "Three — month-end is already built. Summaries, the reimbursement queue, CSV exports — nobody rebuilds a spreadsheet.",
},

// 4 — close: restate main + subsets, pricing, demo CTA
{
  name: 'x4-close', account: ACCT.guest,
  narration: "That's Expense Claims: filed in a minute, approved in one queue, month-end ready. Priced per user, quoted the same day. Book a demo — bring last month's claims pile.",
  beats: async ({ page, D, ready }) => {
    await page.setContent(CLOSE_HTML, { waitUntil: 'load' });
    const waitUntil = await ready(300);
    await waitUntil(D);
  },
},

];
