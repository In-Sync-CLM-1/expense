// Expense Claims teaser v3 — "buyer-question" cut, TWO orientations.
//   node scripts/render-teaser.mjs            (FRESH_NARRATION=1 forces re-synth)
// Outputs:
//   C:\Users\Admin\Downloads\expense-teaser.mp4         (1920x1080, laptop/YouTube)
//   C:\Users\Admin\Downloads\expense-teaser-mobile.mp4  (1080x1920, Reels/Shorts/Status)
//
// Story spine (teaser-v3 spec, ATS template):
//   problem card -> coverage montage (what the platform IS) ->
//   3 differentiators on ONE character thread (Priya, who files the claim and
//   carries the advance in the frozen demo footage) ->
//   outcome-numbers card -> demo CTA.
// Backend is parked: every app shot is a SLICE cut from surviving walkthrough
// recordings (s*.mp4) — nothing is recorded against a live app. Slices appear
// only inside rounded proof windows on the brand canvas, never full-bleed.
import { chromium } from 'playwright';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execFileSync } from 'child_process';
import { synthTimed } from './lib/voice.mjs';
import * as V from './lib/video.mjs';
import { crossfadeStitchVideo, overlayAudio, holdAndFade, duration } from './lib/video.mjs';

const FF = 'C:\\Users\\Admin\\scoop\\shims\\ffmpeg.exe';
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'recordings', 'scenes');
const T_X = 0.4;

// ── The 7 narration blocks (slots are carved from ONE take) ───────────────────
const NARR = {
  n0: "Expense claims aren't painful when the money's spent — they're painful after. Paper bills, a WhatsApp photo trail, approvals stuck in an inbox. Reimbursement takes a month, and your people are lending you their own money. Expense Claims fixes the after.",
  n1: "The whole claim cycle runs in one place — dashboard, claims, approvals, and finance reports.",
  n2a: "One — filing files itself. Priya photographs the bill and the A.I. reads it, filling the amount, date, and category.",
  n2b: "Two — the judgment stays human. Her claim lands in one queue, receipt attached; anything out of policy never reaches her manager. Approve the exact amount, or reject with a reason.",
  n2c: "Three — the money reconciles itself. The advance Priya carried settles against her approved claim — what to recover, what you owe, no side ledger.",
  n3: "Filing is a photograph — the A.I. does the typing. Every rupee keeps its receipt, policy check, and approver. People get paid back in days, and expense day stops being dreaded. Priced per user, quoted the same day.",
  n4: "In-Sync Expense Claims. Book a thirty-minute demo — bring last month's claims pile.",
};
const ORDER = ['n0', 'n1', 'n2a', 'n2b', 'n2c', 'n3', 'n4'];

// ── 1. narration ──────────────────────────────────────────────────────────────
const SEP = ' ';
const fullText = ORDER.map((k) => NARR[k]).join(SEP);
const mp3Path = join(dir, 'teaser3-narration.mp3');
const alignPath = join(dir, 'teaser3-align.json');
let Taud;
if (process.env.FRESH_NARRATION !== '1' && existsSync(mp3Path) && existsSync(alignPath)) {
  const c = JSON.parse(readFileSync(alignPath, 'utf8'));
  if (c.text === fullText) {
    console.log('Reusing cached narration.');
    Taud = { duration: c.duration, joined: c.joined, starts: c.starts, ends: c.ends,
      timeAtChar: (i) => c.starts[Math.max(0, Math.min(i, c.starts.length - 1))] };
  }
}
if (!Taud) {
  console.log(`Synthesizing narration (${fullText.length} chars, 1.1x)...`);
  Taud = await synthTimed(fullText, mp3Path, { speed: 1.1 });
  writeFileSync(alignPath, JSON.stringify({ text: fullText, duration: Taud.duration, joined: Taud.joined, starts: Taud.starts, ends: Taud.ends }));
}
console.log(`Narration ${Taud.duration.toFixed(1)}s`);

let offset = 0;
const slots = {};
for (let i = 0; i < ORDER.length; i++) {
  const k = ORDER[i];
  const charStart = offset, charEnd = offset + NARR[k].length;
  const nextOffset = charEnd + SEP.length;
  const start = Taud.timeAtChar(charStart);
  const end = i < ORDER.length - 1 ? Taud.timeAtChar(nextOffset) : Taud.duration;
  offset = nextOffset;
  slots[k] = { start, duration: end - start };
}

// ── 2. PASS A — slice raw clips from the surviving walkthrough footage ────────
// Proof slices are chosen so the moment being claimed sits inside the slot:
//   s3  ~8.8s  Next click -> step-2 lines (category, amount)
//   s4  ~11-16s rings on amount, cursor moves to Approve
//   s5  ~14-23s advance linked -> submitted -> reconciliation KPIs
const RAW = [
  { name: 'f-cov-dash',      src: 's1-dashboard-v.mp4',       from: 5, seconds: 4 },
  { name: 'f-cov-claims',    src: 's2-employee-claims-v.mp4', from: 4, seconds: 4 },
  { name: 'f-cov-approvals', src: 's4-approvals-v.mp4',       from: 2, seconds: 4 },
  { name: 'f-cov-reports',   src: 's6-reports-v.mp4',         from: 4, seconds: 4 },
  { name: 'f-p2-judge',      src: 's4-approvals-v.mp4',       from: 9,   slot: 'n2b' },
  { name: 'f-p3-advance',    src: 's5-advances-v.mp4',        from: 14,  slot: 'n2c' },
];

for (const r of RAW) {
  const out = join(dir, `${r.name}-v.mp4`);
  const need = (r.slot ? slots[r.slot].duration + T_X : r.seconds);
  const src = join(dir, r.src);
  const avail = duration(src);
  const from = Math.max(0, Math.min(r.from, avail - need));
  V.webmToMp4(src, out, from, Math.min(need, avail - from));
  console.log(`[${r.name}] slice ${r.src} @${from.toFixed(1)}s for ${need.toFixed(2)}s`);
}

const b64 = (name) => 'data:video/mp4;base64,' + readFileSync(join(dir, `${name}-v.mp4`)).toString('base64');

// ── 3. PASS B — canvas scenes per orientation ─────────────────────────────────
// Brand canvas: dark plum with the product's rose/pink accent (website theme).
const CANVAS_BG = `background:
  radial-gradient(900px 500px at 15% -10%,rgba(225,29,72,.22),transparent 60%),
  radial-gradient(800px 500px at 95% 115%,rgba(236,72,153,.22),transparent 55%),
  linear-gradient(135deg,#160a10 0%,#221019 55%,#2a1224 100%)`;

// Company logo card — the official In-Sync lockup (user: In-Sync logo only).
const INSYNC_LOGO = 'data:image/png;base64,' +
  readFileSync(join(here, 'recordings', 'insync-logo-band.png')).toString('base64');
const LOGO_HTML = () => `<div class="logocard"><img src="${INSYNC_LOGO}"/></div>`;

const baseCss = (o) => `
  *{margin:0;padding:0;box-sizing:border-box}html,body{height:100%}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#f5e7ee;overflow:hidden;${CANVAS_BG}}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:${o === 'tall' ? '60px 44px 200px' : '56px'}}
  .logocard{background:#fff;border-radius:20px;padding:${o === 'tall' ? '20px 34px' : '16px 28px'};box-shadow:0 14px 40px rgba(0,0,0,.35)}
  .logocard img{height:${o === 'tall' ? 108 : 82}px;width:auto;display:block}
  .kicker{color:#fb7185;font-weight:800;font-size:${o === 'tall' ? 26 : 22}px;letter-spacing:2.5px;text-transform:uppercase}
  h1{font-weight:800;letter-spacing:-.02em;line-height:1.1;font-size:${o === 'tall' ? 66 : 64}px}
  h1 .g{color:#fb7185}
  .sub{color:#cfa8bc;font-size:${o === 'tall' ? 30 : 26}px;line-height:1.45}
  .chip{display:inline-block;background:rgba(251,113,133,.14);border:1px solid rgba(251,113,133,.4);border-radius:999px;
    padding:${o === 'tall' ? '14px 30px' : '10px 24px'};font-size:${o === 'tall' ? 28 : 22}px;font-weight:700;color:#fecdd3}
  .frame{border-radius:18px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.14);
    width:${o === 'tall' ? '94%' : '76%'};position:relative;background:#160a10}
  .crop{overflow:hidden;width:100%;aspect-ratio:16/9}
  .crop video{display:block;width:100%;height:100%;object-fit:cover}
  .grid{display:grid;grid-template-columns:1fr 1fr;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:16px;overflow:hidden;text-align:left}
  .grid .l{font-size:${o === 'tall' ? 26 : 21}px;color:rgba(255,255,255,.55);padding:${o === 'tall' ? '18px 22px' : '14px 24px'};display:flex;align-items:center;justify-content:flex-end;text-align:right}
  .grid .r{font-size:${o === 'tall' ? 26 : 21}px;font-weight:600;color:#fda4af;padding:${o === 'tall' ? '18px 22px' : '14px 24px'};border-left:1px solid rgba(255,255,255,.15);display:flex;align-items:center}
  .cta{display:inline-block;background:linear-gradient(135deg,#e11d48,#be185d);color:#fff;font-weight:700;
    font-size:${o === 'tall' ? 34 : 28}px;padding:${o === 'tall' ? '24px 52px' : '18px 42px'};border-radius:999px;box-shadow:0 12px 30px rgba(225,29,72,.4)}
  .gap-s{margin-top:18px}.gap-m{margin-top:28px}.gap-l{margin-top:38px}
`;

const page5 = (o, inner, script = '') => `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss(o)}</style></head>
<body><div class="wrap">${inner}</div><script>${script}</script></body></html>`;

function cardProblem(o) {
  return page5(o, `
    ${LOGO_HTML(o)}
    <div class="kicker gap-l">Expense Claims &middot; Expense Management</div>
    <h1 class="gap-m">Claims aren&rsquo;t painful when spent.<br>They&rsquo;re painful <span class="g">after.</span></h1>
    <div class="sub gap-m">Paper bills &middot; a WhatsApp photo trail &middot; approvals stuck in an inbox.</div>
    <div class="chip gap-m">3&ndash;4 week payback &asymp; your team lends you a month of spend &middot; every month</div>`);
}

function cardCoverage(o, perSec) {
  const labels = ['Spend Dashboard', 'Every Claim', 'Approvals', 'Finance Reports'];
  const vids = ['f-cov-dash', 'f-cov-claims', 'f-cov-approvals', 'f-cov-reports']
    .map((n, i) => `<video muted playsinline preload="auto" src="${b64(n)}" style="position:absolute;inset:0;opacity:${i === 0 ? 1 : 0};transition:opacity .3s"></video>`)
    .join('');
  return page5(o, `
    <div class="kicker">One platform &middot; the whole claim cycle</div>
    <div class="frame gap-m"><div class="crop" style="aspect-ratio:16/9;position:relative">${vids}</div></div>
    <div class="chip gap-m" id="lab">${labels[0]}</div>`, `
    window.__start = () => {
      const vids=[...document.querySelectorAll('video')], lab=document.getElementById('lab');
      const labels=${JSON.stringify(labels)};
      const show=(k)=>{vids.forEach((v,j)=>{v.style.opacity=j===k?1:0; if(j===k){try{v.currentTime=0;v.play();}catch(e){}}else{try{v.pause();}catch(e){}}}); lab.textContent=labels[k];};
      show(0); let i=0;
      const iv=setInterval(()=>{i++; if(i>=4){clearInterval(iv);return;} show(i);}, ${Math.max(1.2, perSec).toFixed(2)}*1000);
    };`);
}

// Beat with no footage (AI receipt reading — backend parked, never filmed):
// a brand card, per spec — schematic flow, no fake app UI.
function cardFlow(o) {
  const icon = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="#fb7185" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:${o === 'tall' ? 54 : 44}px;height:${o === 'tall' ? 54 : 44}px">${paths}</svg>`;
  const cam = icon('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>');
  const spark = icon('<path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="M5.6 5.6l2.1 2.1"/><path d="M16.3 16.3l2.1 2.1"/><path d="M18.4 5.6l-2.1 2.1"/><path d="M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.5"/>');
  const tile = (inner) => `<div style="background:rgba(255,255,255,.07);border:1px solid rgba(251,113,133,.35);border-radius:16px;padding:${o === 'tall' ? '30px 34px' : '24px 30px'};display:flex;flex-direction:column;align-items:center;gap:14px;min-width:${o === 'tall' ? 260 : 230}px">${inner}</div>`;
  const lab = (t) => `<div style="font-weight:700;font-size:${o === 'tall' ? 28 : 23}px">${t}</div>`;
  const row = (t) => `<div style="font-size:${o === 'tall' ? 24 : 19}px;color:#fda4af;font-weight:600;background:rgba(251,113,133,.12);border-radius:8px;padding:6px 14px">${t}</div>`;
  const arrow = `<div style="color:#fb7185;font-size:${o === 'tall' ? 52 : 44}px;font-weight:800">${o === 'tall' ? '&darr;' : '&rarr;'}</div>`;
  return page5(o, `
    <div class="chip">1 &middot; Filing files itself</div>
    <div style="display:flex;flex-direction:${o === 'tall' ? 'column' : 'row'};align-items:center;justify-content:center;gap:${o === 'tall' ? 18 : 26}px" class="gap-l">
      ${tile(cam + lab('Photograph the bill'))}
      ${arrow}
      ${tile(spark + lab('The AI reads it'))}
      ${arrow}
      ${tile(`<div style="display:flex;flex-direction:column;gap:10px;align-items:center">${lab('Claim, filled')}${row('Office Supplies')}${row('&#8377;2,850 &middot; 28 Jun')}</div>`)}
    </div>
    <div class="sub gap-l">A minute, from anywhere &mdash; the PWA works offline, syncs on signal.</div>`);
}

// fx pans/zooms the proof window onto the panel being claimed:
// {s: scale, x/y: translate % — X = 0.5 minus the target's horizontal centre}.
function cardProof(o, clipName, label, fx) {
  const f = (fx && fx[o]) || (o === 'tall' ? { s: 1.4, x: 0, y: 0 } : { s: 1, x: 0, y: 0 });
  const style = `transform:scale(${f.s}) translate(${f.x}%,${f.y}%)`;
  return page5(o, `
    <div class="chip">${label}</div>
    <div class="frame gap-m"><div class="crop"><video muted playsinline preload="auto" style="${style}" src="${b64(clipName)}"></video></div></div>`, `
    window.__start = () => { const v=document.querySelector('video'); try{v.play();}catch(e){} };`);
}

function cardNumbers(o) {
  return page5(o, `
    <div class="kicker">The math changes</div>
    <div class="grid gap-m">
      <div class="l">Filing a claim</div><div class="r">A photo &mdash; the AI does the typing</div>
      <div class="l">Approvals</div><div class="r">Weeks in an inbox &rarr; one queue, exact amount</div>
      <div class="l">Fraud &amp; audit</div><div class="r">Receipt &middot; policy check &middot; named approver &mdash; on record</div>
      <div class="l">Paying people back</div><div class="r">3&ndash;4 weeks &rarr; days</div>
    </div>
    <div class="sub gap-m" style="color:#f5e7ee;font-weight:600">Priced per user &middot; quoted the same day</div>`);
}

function cardCta(o) {
  return page5(o, `
    ${LOGO_HTML(o)}
    <h1 class="gap-l" style="font-size:${o === 'tall' ? 58 : 56}px">Managers judge the claim.<br><span class="g">Everything else files itself.</span></h1>
    <div class="cta gap-l">Book your 30-minute demo &rarr;</div>
    <div class="sub gap-m" style="font-size:${o === 'tall' ? 24 : 20}px">In-Sync Expense Claims &middot; expense.in-sync.co.in</div>`);
}

async function recordCanvas({ name, html, seconds, vp }) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: vp, recordVideo: { dir, size: vp } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => Promise.all([...document.querySelectorAll('video')].map((v) =>
    v.readyState >= 3 ? 1 : new Promise((res) => { v.addEventListener('canplaythrough', res, { once: true }); v.addEventListener('error', res, { once: true }); })
  ))).catch(() => {});
  await page.waitForTimeout(250);
  const leadSec = (Date.now() - t0) / 1000;
  await page.evaluate(() => window.__start && window.__start()).catch(() => {});
  await page.waitForTimeout(seconds * 1000);
  await ctx.close(); await browser.close();
  const webm = await page.video().path();
  const mp4 = join(dir, `${name}-v.mp4`);
  V.webmToMp4(webm, mp4, leadSec, seconds);
  console.log(`[${name}] canvas ${seconds.toFixed(2)}s`);
  return mp4;
}

const ORIENTS = [
  { key: 'wide', vp: { width: 1920, height: 1080 }, out: 'C:\\Users\\Admin\\Downloads\\expense-teaser.mp4', subStyle: "FontName=Segoe UI,FontSize=17,Bold=1,BorderStyle=1,Outline=2,Shadow=0,OutlineColour=&H96000000,PrimaryColour=&H00FFFFFF,MarginV=40" },
  // Portrait note: libass scales FontSize/margins against PlayResY=288, so the
  // portrait 1920-high frame multiplies everything by ~6.7 — values must be tiny.
  { key: 'tall', vp: { width: 1080, height: 1920 }, out: 'C:\\Users\\Admin\\Downloads\\expense-teaser-mobile.mp4', subStyle: "FontName=Segoe UI,FontSize=7,Bold=1,BorderStyle=1,Outline=1,Shadow=0,OutlineColour=&H96000000,PrimaryColour=&H00FFFFFF,MarginV=20" },
];

// sentence-level subtitle cues from the TTS timing (teasers get watched muted)
const srtTime = (t) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
};
const cues = [];
let cursor = 0;
for (const k of ORDER) {
  for (const raw of NARR[k].split(/(?<=[.!?])\s+/)) {
    const line = raw.trim();
    if (!line) continue;
    const j = Taud.joined.indexOf(line.toLowerCase().slice(0, Math.min(24, line.length)), cursor);
    if (j < 0) continue;
    const start = Taud.timeAtChar(j);
    const end = Taud.timeAtChar(j + line.length - 1) + 0.25;
    cues.push(`${cues.length + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${line}\n`);
    cursor = j + line.length;
  }
}
writeFileSync(join(dir, 'teaser3-subs.srt'), cues.join('\n'), 'utf8');
console.log(`${cues.length} subtitle cues`);

for (const O of ORIENTS) {
  console.log(`\n=== ${O.key} (${O.vp.width}x${O.vp.height}) ===`);
  const covPer = slots.n1.duration / 4;
  const sceneDefs = [
    { k: 'n0', html: cardProblem(O.key) },
    { k: 'n1', html: cardCoverage(O.key, covPer) },
    { k: 'n2a', html: cardFlow(O.key) },
    { k: 'n2b', html: cardProof(O.key, 'f-p2-judge', '2 &middot; The judgment stays human', { wide: { s: 1.25, x: -6, y: 0 }, tall: { s: 1.6, x: -8, y: 0 } }) },
    { k: 'n2c', html: cardProof(O.key, 'f-p3-advance', '3 &middot; Advances settle themselves', { wide: { s: 1.2, x: 0, y: 0 }, tall: { s: 1.55, x: 0, y: 0 } }) },
    { k: 'n3', html: cardNumbers(O.key) },
    { k: 'n4', html: cardCta(O.key) },
  ];
  const clips = [];
  for (const sd of sceneDefs) {
    clips.push(await recordCanvas({ name: `c-${sd.k}-${O.key}`, html: sd.html, seconds: slots[sd.k].duration + T_X, vp: O.vp }));
  }
  const silent = join(dir, `teaser3-${O.key}-silent.mp4`);
  crossfadeStitchVideo(clips, silent, T_X);
  const narrated = join(dir, `teaser3-${O.key}-narrated.mp4`);
  overlayAudio(silent, mp3Path, narrated);
  execFileSync(FF, ['-y', '-i', `teaser3-${O.key}-narrated.mp4`,
    '-vf', `subtitles=teaser3-subs.srt:force_style='${O.subStyle}'`,
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart', `teaser3-${O.key}-styled.mp4`], { cwd: dir });
  holdAndFade(join(dir, `teaser3-${O.key}-styled.mp4`), O.out, 2.0, 1.0);
  console.log('DONE ->', O.out);
}
