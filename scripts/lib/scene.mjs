// Shared scene runner: synth (timed) -> pre-auth -> record -> trim boot -> mux.
// Each scene supplies narration + a beats() callback that calls ready() once the
// opening frame is on screen, then paces actions with the returned waitUntil().
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadEnv } from './env.mjs';
import { synthTimed } from './voice.mjs';
import * as V from './video.mjs';
import { installCursor } from './cursor.mjs';
import { login } from './app.mjs';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'recordings', 'scenes');
const env = loadEnv(new URL('../../.env', import.meta.url));
const VP = { width: 1366, height: 768 };

export const ACCT = {
  admin: { email: env.EXPENSE_ADMIN_EMAIL || 'kavita@prosync-demo.in', password: env.EXPENSE_DEMO_PASSWORD },
  manager: { email: env.EXPENSE_MANAGER_EMAIL || 'rajesh@prosync-demo.in', password: env.EXPENSE_DEMO_PASSWORD },
  member: { email: env.EXPENSE_AGENT_EMAIL || 'priya@prosync-demo.in', password: env.EXPENSE_DEMO_PASSWORD },
  member2: { email: env.EXPENSE_AGENT2_EMAIL || 'arjun@prosync-demo.in', password: env.EXPENSE_DEMO_PASSWORD },
  guest: { guest: true }, // no login (intro/outro scenes)
};

// Continuous-narration mode: record VIDEO ONLY, paced to a slot of the single
// master audio track. `localFind(phrase)` returns the GLOBAL time of a word
// within this scene's text range (so duplicate words across scenes don't clash).
// Bangalore (Koramangala) — the team's location; powers the GPS check-in scene.
const GEO = { latitude: 12.9352, longitude: 77.6245 };

const PHONE = { width: 390, height: 844 }; // rep-on-mobile POV

export async function recordSceneVideo({ scene, slotStart, slotDuration, localFind, tailT = 0.5 }) {
  const browser = await chromium.launch({ headless: true });
  const recVP = scene.mobile ? PHONE : VP;
  let storageState;
  if (!scene.account.guest) {
    const a = await browser.newContext({ viewport: VP, geolocation: GEO, permissions: ['geolocation'] });
    const ap = await a.newPage();
    await login(ap, scene.account.email, scene.account.password); // login at desktop, reuse state
    storageState = await a.storageState();
    await a.close();
  }
  const ctx = await browser.newContext({
    viewport: recVP, storageState, geolocation: GEO, permissions: ['geolocation'],
    timezoneId: 'Asia/Kolkata', locale: 'en-IN', // deterministic "today" regardless of render host
    ...(scene.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
    recordVideo: { dir: outDir, size: recVP },
  });
  const page = await ctx.newPage();
  let leadSec = 0, tBeats = 0;
  const t0 = Date.now();
  const ready = async (extra = 300) => {
    await page.waitForTimeout(extra);
    leadSec = (Date.now() - t0) / 1000;
    await installCursor(page);
    tBeats = Date.now();
    return async (s) => { const e = (Date.now() - tBeats) / 1000; if (e < s) await page.waitForTimeout((s - e) * 1000); };
  };
  const at = (phrase, fb, off = 0) => {
    const g = localFind(phrase);
    const local = g == null ? fb : g - slotStart;
    return Math.max(0, local) + off;
  };
  const D = slotDuration + tailT; // tail overlaps the crossfade into the next scene
  try { await scene.beats({ page, find: localFind, at, D, ready }); }
  catch (e) {
    console.log(`[${scene.name}] beats error: ${e.message.split('\n')[0]}`);
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
    throw e; // ruined take — let the harness retry the whole scene
  }
  await ctx.close();
  await browser.close();

  const webm = await page.video().path();
  const mp4 = join(outDir, `${scene.name}-v.mp4`);
  if (scene.mobile) V.webmToMp4Phone(webm, mp4, leadSec, D);   // phone-on-canvas composite
  else V.webmToMp4(webm, mp4, leadSec, D);                     // exactly slotDuration + tailT
  console.log(`[${scene.name}] video ${D.toFixed(2)}s (lead ${leadSec.toFixed(2)})${scene.mobile ? ' [mobile]' : ''}`);
  return mp4;
}

export async function runScene({ name, narration, account, beats }) {
  const audioPath = join(outDir, `${name}.mp3`);
  console.log(`\n[${name}] synth...`);
  const T = await synthTimed(narration, audioPath);
  console.log(`[${name}] audio ${T.duration.toFixed(2)}s`);

  const browser = await chromium.launch({ headless: true });
  let storageState;
  if (!account.guest) {
    const a = await browser.newContext({ viewport: VP, geolocation: GEO, permissions: ['geolocation'] });
    const ap = await a.newPage();
    await login(ap, account.email, account.password);
    storageState = await a.storageState();
    await a.close();
  }

  const ctx = await browser.newContext({ viewport: VP, storageState, geolocation: GEO, permissions: ['geolocation'], recordVideo: { dir: outDir, size: VP } });
  const page = await ctx.newPage();
  let leadSec = 0, tBeats = 0;
  const t0 = Date.now();
  const ready = async (extraSettle = 300) => {
    await page.waitForTimeout(extraSettle);
    leadSec = (Date.now() - t0) / 1000;
    await installCursor(page);
    tBeats = Date.now();
    return async (s) => { const e = (Date.now() - tBeats) / 1000; if (e < s) await page.waitForTimeout((s - e) * 1000); };
  };
  const at = (phrase, fb, off = 0) => { const t = T.find(phrase); return (t == null ? fb : t) + off; };

  try {
    await beats({ page, find: T.find, at, D: T.duration, ready });
  } catch (e) {
    console.log(`[${name}] beats error: ${e.message.split('\n')[0]}`);
  }
  await ctx.close();
  await browser.close();

  const webm = await page.video().path();
  const mp4 = join(outDir, `${name}.mp4`);
  V.webmToMp4(webm, mp4, leadSec);
  const final = join(outDir, `${name}-final.mp4`);
  V.mux(mp4, audioPath, final, T.duration + 0.45); // trim trailing TTS silence for smoother flow
  console.log(`[${name}] done -> ${final} (lead ${leadSec.toFixed(2)}s)`);
  return { final, D: T.duration };
}
