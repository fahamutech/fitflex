#!/usr/bin/env node
// Text-motion reel from a slide spec: renders source/reel.json with render-carousel.js (1080x1350 frames,
// no "swipe" footer), pads each frame to 1080x1920 on its own ground colour, adds a slow push-in and
// fades, and writes reel/<prefix>.mp4 (H.264, 30 fps, silent) plus reel/<prefix>-cover.png.
// Per-frame duration: slide.dur seconds (default 3; cover 2.5; last 4). No music: nothing licensed yet.
//   node social/tools/render-reel.js social/content/<id> [--spec reel.json] [--out reel]
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const contentDir = path.resolve(process.argv[2] || ''); const specName = argOf('--spec', 'reel.json'); const outName = argOf('--out', 'reel');
const specFile = path.join(contentDir, 'source', specName);
if (!fs.existsSync(specFile)) { console.error('usage: node social/tools/render-reel.js social/content/<id> [--spec reel.json] [--out reel]'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
if (!spec.noSwipe) { spec.noSwipe = true; fs.writeFileSync(specFile, JSON.stringify(spec, null, 2) + '\n'); }
const framesDir = path.join(outName, 'frames');
execFileSync('node', [path.join(__dirname, 'render-carousel.js'), contentDir, '--png', '--spec', specName, '--out', framesDir], { stdio: 'inherit' });
const outDir = path.join(contentDir, outName); const prefix = spec.prefix || 'R'; const n = spec.slides.length; const FPS = 30; const XF = 0.4;
const bgOf = i => { const html = fs.readFileSync(path.join(contentDir, 'source', `${prefix}${String(i + 1).padStart(2, '0')}.html`), 'utf8'); const m = html.match(/body\{[^}]*background:(#[0-9a-fA-F]{6})/); return m ? m[1] : '#020617'; };
const dur = spec.slides.map((sl, i) => sl.dur || (i === 0 ? 2.5 : i === n - 1 ? 4 : 3));
const inputs = []; const filters = [];
spec.slides.forEach((sl, i) => {
  const png = path.join(outDir, 'frames', `${prefix}${String(i + 1).padStart(2, '0')}.png`); inputs.push('-i', png);
  const frames = Math.round(dur[i] * FPS) + (i < n - 1 ? Math.round(XF * FPS) : 0);
  filters.push(`[${i}:v]scale=1080:1350,pad=1080:1920:0:285:color=${bgOf(i)},zoompan=z='min(1+0.0005*on,1.045)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${FPS},format=yuv420p,setsar=1[v${i}]`);
});
let last = 'v0'; let offset = 0;
for (let i = 1; i < n; i++) { offset += dur[i - 1]; const out = i === n - 1 ? 'vout' : `x${i}`; filters.push(`[${last}][v${i}]xfade=transition=fade:duration=${XF}:offset=${offset.toFixed(2)}[${out}]`); last = out; }
if (n === 1) filters.push(`[v0]copy[vout]`);
const mp4 = path.join(outDir, `${prefix}.mp4`);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '[vout]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', String(FPS), '-movflags', '+faststart', mp4], { stdio: 'inherit' });
const cover = path.join(outDir, `${prefix}-cover.png`);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(outDir, 'frames', `${prefix}01.png`), '-vf', `scale=1080:1350,pad=1080:1920:0:285:color=${bgOf(0)}`, cover], { stdio: 'inherit' });
const total = dur.reduce((a, b) => a + b, 0);
console.log(`${n} frames, ${total.toFixed(1)} s -> ${path.relative(root, mp4)} and ${path.relative(root, cover)}`);
