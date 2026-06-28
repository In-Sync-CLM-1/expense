// In-Sync Expense app driver: plain email+password login.

// Record against the direct Cloudflare Pages URL (identical app) to avoid the apex
// domain's Cloudflare managed-challenge, which intercepts automated/non-browser
// traffic. Keeps headless captures reliable and avoids tripping bot protection.
export const BASE = 'https://expense-sync.pages.dev';

// The demo organization the admin login belongs to (id filled by seed-demo).
export const ORG = { name: 'Prosync Engineering' };

export const ACCOUNTS = {
  admin: { email: 'kavita@prosync-demo.in' },
  manager: { email: 'rajesh@prosync-demo.in' },
  member: { email: 'priya@prosync-demo.in' },
};

// Login: fill email + password, submit, require BOTH the /dashboard URL AND a
// persisted Supabase session token (toast-success-without-session trap), retry 6x.
export async function login(page, email, password) {
  const attempt = async () => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.locator('#login-email').fill(email, { timeout: 25000 });
    await page.locator('#login-password').fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 20000 });
    await page.waitForFunction(
      () => Object.keys(localStorage).some((k) => /sb-.*-auth-token/.test(k) && localStorage.getItem(k)),
      undefined, { timeout: 8000 },
    );
  };
  let err;
  for (let i = 0; i < 6; i++) {
    try { await attempt(); await page.waitForLoadState('networkidle').catch(() => {}); return; }
    catch (e) { err = e; await page.waitForTimeout(1500); }
  }
  throw err;
}
