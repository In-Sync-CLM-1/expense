// Capture crisp module stills for the premium promo (device-frame hero shots).
import { chromium } from 'playwright';
import { login, BASE } from './lib/app.mjs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'assets', 'promo');
mkdirSync(out, { recursive: true });

const PW = 'Prosync#Demo2026';
const VP = { width: 1600, height: 1000 };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const dismissToasts = async (p) => {
  for (const b of await p.locator('[toast-close]').all()) await b.click().catch(() => {});
  await p.waitForTimeout(300);
};

const makeShot = (p) => async (name, extra) => {
  await p.mouse.move(2, 2);
  await p.waitForTimeout(600);
  if (extra) await extra(p).catch((e) => console.error(`  ${name} extra failed:`, e.message));
  await dismissToasts(p);
  await p.waitForTimeout(600);
  await p.screenshot({ path: join(out, `${name}.png`) });
  console.log('  shot', name);
};

// ── as admin: Reports overview + Advances ────────────────────────────────────
await login(page, 'kavita@prosync-demo.in', PW);
const shot = makeShot(page);

await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle' });
await page.getByText(/Recoverable GST/i).first().waitFor({ timeout: 20000 });
await page.waitForTimeout(1800); // let echarts draw
await shot('reports');

await page.goto(`${BASE}/advances`, { waitUntil: 'networkidle' });
await page.getByText(/Payable \(overspent\)/i).first().waitFor({ timeout: 20000 });
await shot('advances');
await ctx.close();

// ── as an employee: filing + GST capture on My Claims (fresh context — a
// second login() on the same page collides with the still-active session) ──
const ctx2 = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
const page2 = await ctx2.newPage();
const shot2 = makeShot(page2);
await login(page2, 'rajesh@prosync-demo.in', PW);
await page2.goto(`${BASE}/my-expenses`, { waitUntil: 'networkidle' });

// "Filing" still — a receipt mid-read (a photo, not a form)
await page2.getByRole('button', { name: /new expense claim/i }).click();
await page2.waitForTimeout(400);
await page2.getByPlaceholder(/client meeting/i).fill('Pune vendor review — Kirloskar');
await page2.locator('input[type="date"]').first().fill('2026-07-16');
await page2.locator('input[type="date"]').nth(1).fill('2026-07-17');
await page2.getByRole('button', { name: /next.*add expenses/i }).click();
await page2.waitForTimeout(400);
await page2.locator('input[type="file"]').first().setInputFiles(join(here, 'assets', 'sample-receipt.png'));
await page2.waitForTimeout(1200); // capture mid-analysis, sparkle showing
await shot2('filing');

// wait out the analysis so the dialog can close cleanly, then start a fresh
// claim for the GST still (a distinct receipt, fully filled in)
await page2.waitForTimeout(6000);
await page2.keyboard.press('Escape').catch(() => {});
await page2.waitForTimeout(500);

await page2.getByRole('button', { name: /new expense claim/i }).click();
await page2.waitForTimeout(400);
await page2.getByPlaceholder(/client meeting/i).fill('Nasscom Technology Summit — Hyderabad');
await page2.locator('input[type="date"]').first().fill('2026-06-10');
await page2.locator('input[type="date"]').nth(1).fill('2026-06-12');
await page2.getByRole('button', { name: /next.*add expenses/i }).click();
await page2.waitForTimeout(400);
await page2.locator('input[type="file"]').first().setInputFiles(join(here, 'assets', 'sample-receipt.png'));
console.log('  waiting for GST extraction...');
for (let i = 0; i < 15; i++) {
  await page2.waitForTimeout(2000);
  const stillReading = await page2.getByText(/reading receipt/i).count();
  if (stillReading === 0) break;
}
await shot2('gst');

await ctx2.close();
await browser.close();
console.log('done');
