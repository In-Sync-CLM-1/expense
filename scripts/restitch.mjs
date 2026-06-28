// Surgical rebuild: re-record ONE scene into its existing slot, then re-stitch all
// existing scene videos + the existing narration track into the final MP4.
//   node scripts/restitch.mjs <scene-name> <slotSeconds>
// Slot = that scene's video duration from the last render minus the 0.5s tail.
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { SCENES } from './scenes.mjs';
import { recordSceneVideo } from './lib/scene.mjs';
import { crossfadeStitchVideo, overlayAudio, holdAndFade } from './lib/video.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'recordings', 'scenes');
const T_X = 0.5;

const name = process.argv[2];
const slot = Number(process.argv[3]);
if (name && slot) {
  const scene = SCENES.find((s) => s.name === name);
  if (!scene) throw new Error(`scene ${name} not found`);
  let ok = false, lastErr;
  for (let i = 0; i < 3 && !ok; i++) {
    try { await recordSceneVideo({ scene, slotStart: 0, slotDuration: slot, localFind: () => null, tailT: T_X }); ok = true; }
    catch (e) { lastErr = e; console.log(`attempt ${i + 1} failed: ${e.message.split('\n')[0]}`); }
  }
  if (!ok) throw new Error(`re-record failed: ${lastErr?.message}`);
}

const videos = SCENES.map((s) => join(dir, `${s.name}-v.mp4`));
for (const v of videos) if (!existsSync(v)) throw new Error(`missing scene video: ${v}`);
console.log('Stitching', videos.length, 'scenes...');
const silent = join(dir, 'continuous-silent.mp4');
crossfadeStitchVideo(videos, silent, T_X);
const narrated = join(dir, 'continuous-narrated.mp4');
overlayAudio(silent, join(dir, 'full-narration.mp3'), narrated);
const out = 'C:\\Users\\Admin\\Downloads\\email-demo-full.mp4';
holdAndFade(narrated, out, 2.0, 1.2);
console.log('DONE ->', out);
