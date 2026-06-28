// Quick live probe: login → dashboard + advances screenshots.
import { chromium } from 'playwright';
import { loadEnv } from './lib/env.mjs';

const env = loadEnv(new URL('../.env', import.meta.url));
const BASE = 'https://expense-sync.pages.dev';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('#login-email', env.EXPENSE_ADMIN_EMAIL);
await page.fill('#login-password', env.EXPENSE_DEMO_PASSWORD);
await page.getByRole('button', { name: 'Sign In' }).click();
await page.waitForURL('**/dashboard', { timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'scripts/_probe-dashboard.png' });

await page.goto(`${BASE}/advances`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'scripts/_probe-advances.png' });

console.log('PROBE OK');
await browser.close();
