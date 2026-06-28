// Captures showCard artifact PNGs (recordings/notif/*) for the walkthrough video.
// The email bodies are the REAL templates from send-expense-notification, rendered
// with the seeded Prosync claim data; the Gmail chrome is drawn for the screenshot.
// Also sends one real "approved" email to the ops inbox as deliverability proof.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { loadEnv } from './lib/env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'recordings', 'notif');
mkdirSync(outDir, { recursive: true });

const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const today = new Date().toISOString();
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

// ── the real templates (mirrors send-expense-notification/index.ts) ─────────
function baseTemplate(title, body) {
  return `
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;font-family:'Nunito Sans',Arial,sans-serif;color:#1e293b;">
  <div style="background:linear-gradient(135deg,#3b82f6,#1e3a8a);padding:28px 32px;">
    <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Expense Claims</h1>
    <p style="margin:4px 0 0;color:#bfdbfe;font-size:14px;">${title}</p>
  </div>
  <div style="padding:32px;font-size:15px;line-height:1.6;">${body}</div>
  <div style="background:#f8fafc;padding:20px 32px;font-size:12px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;">This is an automated notification. Please do not reply to this email.</div>
</div>`;
}
const row = (label, value, extra = '') => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e2e8f0;font-size:14px;"><span style="color:#64748b;">${label}</span><span style="font-weight:600;color:#1e293b;${extra}">${value}</span></div>`;
const card = (rows) => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:20px 0;">${rows}</div>`;
const AMOUNT = 'font-size:24px;font-weight:800;color:#3b82f6;';

const approvedHtml = baseTemplate('Your expense claim has been approved', `
  <p style="margin:0 0 16px;">Hi <strong>Priya Sharma</strong>,</p>
  <p style="margin:0 0 16px;">Your expense claim has been <span style="color:#16a34a;font-weight:700;">approved</span> by <strong>Rajesh Iyer</strong>.</p>
  ${card(
    row('Trip', 'Chennai client pitch — Ramco') +
    row('Destination', 'Chennai, Tamil Nadu') +
    row('Amount Claimed', fmt(13650)) +
    row('Amount Approved', fmt(13650), AMOUNT) +
    row('Approved On', fmtDate(today)).replace('border-bottom:1px solid #e2e8f0;', 'border-bottom:none;')
  )}
  <p style="margin:0;">Your claim will be reimbursed as per company policy.</p>
`);

const submittedHtml = baseTemplate('New expense claim awaiting your approval', `
  <p style="margin:0 0 16px;">Hi <strong>Rajesh Iyer</strong>,</p>
  <p style="margin:0 0 16px;"><strong>Sandeep Kulkarni</strong> has submitted an expense claim for your approval.</p>
  ${card(
    row('Trip', 'Delhi vendor negotiation') +
    row('Destination', 'New Delhi') +
    row('Travel Dates', `${fmtDate(daysAgo(6))} – ${fmtDate(daysAgo(4))}`) +
    row('Purpose', 'Annual rate contract negotiation') +
    row('Total Claimed', fmt(16275), AMOUNT) +
    row('Submitted On', fmtDate(daysAgo(1))).replace('border-bottom:1px solid #e2e8f0;', 'border-bottom:none;')
  )}
  <p style="margin:0;">Please log in to review and approve or reject this claim.</p>
`);

// ── Gmail-style chrome ───────────────────────────────────────────────────────
const chrome = ({ fromName, fromEmail, to, subject, bodyHtml }) => `<!DOCTYPE html>
<html><body style="margin:0;background:#f6f8fc;font-family:'Google Sans','Segoe UI',Arial,sans-serif;padding:20px;">
<div id="shot" style="width:720px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.12);margin:0 auto;">
  <div style="padding:18px 26px 0;">
    <div style="font-size:19px;font-weight:500;color:#1f1f1f;line-height:1.35;">${subject}
      <span style="font-size:12px;color:#5e5e5e;background:#f1f3f4;border-radius:4px;padding:2px 8px;margin-left:8px;vertical-align:middle;">Inbox</span>
    </div>
    <div style="display:flex;align-items:center;gap:12px;margin:14px 0 12px;">
      <div style="width:40px;height:40px;border-radius:50%;background:#1e3a8a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;">${fromName[0]}</div>
      <div style="flex:1;">
        <span style="font-size:14px;font-weight:600;color:#1f1f1f;">${fromName}</span>
        <span style="font-size:12px;color:#5e5e5e;"> &lt;${fromEmail}&gt;</span>
        <div style="font-size:12px;color:#5e5e5e;">to ${to} ▾</div>
      </div>
      <div style="font-size:12px;color:#5e5e5e;">2 minutes ago ☆ ↩</div>
    </div>
  </div>
  <div style="border-top:1px solid #eee;background:#f0f4f8;padding:18px 0;">${bodyHtml}</div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 1100 }, deviceScaleFactor: 2 });

const shots = [
  ['approved-email.png', chrome({
    fromName: 'Expense Claims', fromEmail: 'no-reply@in-sync.co.in', to: 'priya',
    subject: 'Your expense claim "Chennai client pitch — Ramco" has been approved',
    bodyHtml: approvedHtml,
  })],
  ['submitted-email.png', chrome({
    fromName: 'Expense Claims', fromEmail: 'no-reply@in-sync.co.in', to: 'rajesh',
    subject: 'Expense Claim: Delhi vendor negotiation — Sandeep Kulkarni needs your approval',
    bodyHtml: submittedHtml,
  })],
];
for (const [name, html] of shots) {
  await page.setContent(html);
  await page.locator('#shot').screenshot({ path: join(outDir, name) });
  console.log('captured', name);
}
await browser.close();

// ── one real send as deliverability proof ────────────────────────────────────
const crmEnv = loadEnv(new URL('file:///C:/Users/Admin/crm/.env'));
const RK = Object.entries(crmEnv).find(([k]) => /^RESEND_API_KEY/.test(k))?.[1]
        ?? Object.entries(crmEnv).find(([k]) => /RESEND/.test(k))?.[1];
if (RK) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Expense Claims <no-reply@in-sync.co.in>',
      to: ['insyncclm955@gmail.com'],
      subject: 'Your expense claim "Chennai client pitch — Ramco" has been approved',
      html: `<body style="margin:0;background:#f0f4f8;padding:24px;">${approvedHtml}</body>`,
    }),
  });
  console.log('real approved email sent:', JSON.stringify(await res.json()));
} else {
  console.log('no Resend key found in crm/.env — skipped real send');
}
