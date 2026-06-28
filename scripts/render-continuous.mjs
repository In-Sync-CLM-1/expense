// Continuous-narration pipeline: ONE Riya take for the whole script (natural flow,
// 0.9x speed), video recorded to per-scene slots, crossfaded, audio laid underneath.
//   node scripts/render-continuous.mjs
// Field-Sync scenes are read-only (no form submits), so there are no state-reset hooks.
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execFileSync } from 'child_process';
import { SCENES } from './scenes.mjs';
import { recordSceneVideo } from './lib/scene.mjs';
import { synthTimed } from './lib/voice.mjs';
import { crossfadeStitchVideo, overlayAudio, holdAndFade } from './lib/video.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'recordings', 'scenes');
const T_X = 0.5; // crossfade seconds

// 0. Re-seed a LIVE MID-DAY state immediately before recording, so the Live Team
// Map shows the team punched-in, several on active visits (pulsing), fresh positions,
// and compact multi-leg routes — plus orders/collections so the Reports money columns
// are populated. Order matters: seed-beats builds beats + today's attendance/visits +
// orders, seed-movement draws the GPS routes from them.
if (process.env.SKIP_SEED !== '1') {
  console.log('Seeding Prosync Engineering demo state (seed-demo)...');
  execFileSync(process.execPath, [join(here, 'seed-demo.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, SKIP_RECEIPTS: '1' },
  });
}

// 1. one continuous narration
const SEP = ' ';
const fullText = SCENES.map((s) => s.narration).join(SEP);
console.log('Synthesizing full narration (0.95x)...');
const Taud = await synthTimed(fullText, join(dir, 'full-narration.mp3'), { speed: 0.95 });
console.log(`narration ${Taud.duration.toFixed(1)}s, ${SCENES.length} scenes`);

// 2. slots + scene-local word finders
let offset = 0;
const slots = SCENES.map((s, i) => {
  const charStart = offset, charEnd = offset + s.narration.length;
  const start = Taud.timeAtChar(charStart);
  const nextOffset = offset + s.narration.length + SEP.length;
  const end = i < SCENES.length - 1 ? Taud.timeAtChar(nextOffset) : Taud.duration;
  offset = nextOffset;
  const localFind = (phrase) => { const k = Taud.joined.indexOf(phrase.toLowerCase(), charStart); return (k < 0 || k >= charEnd) ? null : Taud.starts[k]; };
  return { start, duration: end - start, localFind };
});

// 3. record each scene's video to its slot (retry a flaky login/scene up to 3x)
const videos = [];
for (let i = 0; i < SCENES.length; i++) {
  let v, lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { v = await recordSceneVideo({ scene: SCENES[i], slotStart: slots[i].start, slotDuration: slots[i].duration, localFind: slots[i].localFind, tailT: T_X }); break; }
    catch (e) { lastErr = e; console.log(`[${SCENES[i].name}] attempt ${attempt + 1} failed: ${e.message.split('\n')[0]}`); }
  }
  if (!v) throw new Error(`scene ${SCENES[i].name} failed after retries: ${lastErr?.message}`);
  videos.push(v);
}

// 4. crossfade the videos, then lay the single narration under them
console.log('Stitching (crossfade) + overlaying narration...');
const silent = join(dir, 'continuous-silent.mp4');
crossfadeStitchVideo(videos, silent, T_X);
const narrated = join(dir, 'continuous-narrated.mp4');
overlayAudio(silent, join(dir, 'full-narration.mp3'), narrated);
// Graceful outro: hold the end card ~2s and fade to black (no abrupt cut).
const out = 'C:\\Users\\Admin\\Downloads\\expense-demo-full.mp4';
holdAndFade(narrated, out, 2.0, 1.2);
console.log('DONE ->', out);
