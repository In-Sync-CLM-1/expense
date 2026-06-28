// Smoke-run a single scene without TTS: node scripts/_smoke-scene.mjs <scene-name> [slotSeconds]
// Uses at() fallbacks for timing; emits the scene mp4 + 3 probe frames.
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SCENES } from './scenes.mjs';
import { recordSceneVideo } from './lib/scene.mjs';

const name = process.argv[2];
const slot = Number(process.argv[3] || 16);
const scene = SCENES.find((s) => s.name === name || s.name.includes(name));
if (!scene) { console.log('scenes:', SCENES.map((s) => s.name).join(', ')); process.exit(1); }

const mp4 = await recordSceneVideo({ scene, slotStart: 0, slotDuration: slot, localFind: () => null, tailT: 0.5 });
const FF = 'C:\\Users\\Admin\\scoop\\shims\\ffmpeg.exe';
const dir = join(dirname(fileURLToPath(import.meta.url)), 'recordings', 'scenes');
for (const [i, t] of [[1, slot * 0.25], [2, slot * 0.6], [3, slot * 0.95]]) {
  execFileSync(FF, ['-y', '-ss', String(t), '-i', mp4, '-frames:v', '1', join(dir, `_probe-${scene.name}-${i}.png`)], { stdio: 'ignore' });
}
console.log('SMOKE OK', mp4);
