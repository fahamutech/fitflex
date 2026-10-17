#!/usr/bin/env node
// Renders a carousel from a content folder's source/slides.json using the brand
// tokens in social/brand/brand-tokens.json.
//
//   node social/tools/render-carousel.js social/content/<record-id> [--png]
//
// Writes source/NN.html always, and slides/NN.png when --png is given (uses the
// local Google Chrome in headless mode). Fonts, logo and photos come from
// social/brand/, so the repo renders on its own without the app submodules.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const brandDir = path.join(root, 'social', 'brand');
const tokens = JSON.parse(fs.readFileSync(path.join(brandDir, 'brand-tokens.json'), 'utf8'));
const themes = tokens.slideThemes;

const contentDir = path.resolve(process.argv[2] || '');
const wantPng = process.argv.includes('--png');
if (!contentDir || !fs.existsSync(path.join(contentDir, 'source', 'slides.json'))) {
  console.error('usage: node social/tools/render-carousel.js social/content/<id> [--png]');
  process.exit(2);
}
const spec = JSON.parse(fs.readFileSync(path.join(contentDir, 'source', 'slides.json'), 'utf8'));
const slides = spec.slides;
const [W, H] = tokens.formats[spec.format || 'ig_feed_portrait'];
const FONTS = `file://${path.join(brandDir, 'fonts')}`;
const LOGO = `file://${path.join(brandDir, 'assets', 'fitflex-logo.png')}`;
const PH = `file://${path.join(brandDir, 'photos', 'pexels-')}`;
const handle = spec.handle || '@fitflex.africa';

// ---- vector art (ported unchanged from the week-1 renderer, colours from the theme) ----
const person = (x, y, s, c, c2) => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-70" r="26" fill="${c}"/><rect x="-30" y="-36" width="60" height="100" rx="26" fill="${c2 || c}"/><rect x="-26" y="52" width="22" height="70" rx="10" fill="${c}"/><rect x="4" y="52" width="22" height="70" rx="10" fill="${c}"/></g>`;
const star = (x, y, r, c) => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p.push((x + Math.cos(a) * rr).toFixed(1) + ',' + (y + Math.sin(a) * rr).toFixed(1)); } return `<polygon points="${p.join(' ')}" fill="${c}"/>`; };
const phone = (x, y, w, h, p, inner) => `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="44" fill="${p.ink}"/><rect x="12" y="12" width="${w - 24}" height="${h - 24}" rx="34" fill="${p.bg === themes.navy.bg ? p.soft : '#FFFFFF'}"/><rect x="${w / 2 - 40}" y="22" width="80" height="12" rx="6" fill="${p.ink}"/>${inner}</g>`;
const dumbbell = (x, y, s, c, c2) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-120" y="-10" width="240" height="20" rx="10" fill="${c}"/><rect x="-150" y="-60" width="34" height="120" rx="12" fill="${c2}"/><rect x="-186" y="-38" width="30" height="76" rx="10" fill="${c}"/><rect x="116" y="-60" width="34" height="120" rx="12" fill="${c2}"/><rect x="156" y="-38" width="30" height="76" rx="10" fill="${c}"/></g>`;
const pin = (x, y, s, c, c2) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 120 C-70 40 -90 10 -90 -30 A90 90 0 1 1 90 -30 C90 10 70 40 0 120Z" fill="${c}"/><circle cx="0" cy="-30" r="36" fill="${c2}"/></g>`;
const check = (x, y, r, c, c2) => `<g><circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><path d="M${x - r * .45} ${y} L${x - r * .1} ${y + r * .38} L${x + r * .5} ${y - r * .35}" stroke="${c2}" stroke-width="${r * .22}" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`;
const bubble = (x, y, w, h, c, tail) => `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="36" fill="${c}"/><path d="M${x + (tail ? w - 90 : 70)} ${y + h - 4} l${tail ? 30 : -10} 56 l${tail ? -70 : 70} -56z" fill="${c}"/></g>`;
const txt = (x, y, s, t, c, w = 800, a = 'middle') => `<text x="${x}" y="${y}" font-family="Inter" font-weight="${w}" font-size="${s}" fill="${c}" text-anchor="${a}">${t}</text>`;
const bar = (x, y, w, h, c, r = 14) => `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" rx="${r}" fill="${c}"/>`;

const art = {
  bars: p => `<rect x="40" y="40" width="720" height="520" rx="40" fill="${p.soft}"/>${bar(120, 500, 90, 400, p.acc2)}${bar(230, 500, 90, 70, p.acc)}${bar(400, 500, 90, 330, p.acc2)}${bar(510, 500, 90, 120, p.acc)}<rect x="80" y="505" width="640" height="8" rx="4" fill="${p.fg}"/>${txt(165, 548, 22, 'JOINED', p.fg)}${txt(275, 548, 22, 'STAYED', p.fg)}${txt(445, 548, 22, 'JOINED', p.fg)}${txt(555, 548, 22, 'STAYED', p.fg)}`,
  chartgap: p => `<rect x="40" y="40" width="720" height="520" rx="40" fill="${p.soft}"/><path d="M100 440 H700 M100 440 V120" stroke="${p.fg}" stroke-width="8" stroke-linecap="round"/><path d="M120 360 L220 260 L320 330 L400 400" stroke="${p.acc}" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M400 400 L700 400" stroke="${p.acc2}" stroke-width="14" stroke-dasharray="4 26" stroke-linecap="round"/><rect x="420" y="130" width="250" height="240" rx="20" fill="${p.acc2}" opacity=".25"/>${txt(545, 260, 110, '?', p.acc2)}${txt(260, 500, 34, 'busy', p.fg)}${txt(545, 500, 34, 'empty', p.fg)}`,
  dashboard: p => `<rect x="60" y="60" width="680" height="480" rx="36" fill="${p.fg}"/><rect x="60" y="60" width="680" height="80" rx="36" fill="${p.acc}"/><rect x="60" y="110" width="680" height="30" fill="${p.acc}"/>${txt(110, 118, 34, 'Today', '#FFFFFF', 800, 'start')}${bar(120, 420, 60, 120, p.acc)}${bar(200, 420, 60, 200, p.acc2)}${bar(280, 420, 60, 160, p.acc)}${bar(360, 420, 60, 260, p.acc2)}${bar(440, 420, 60, 100, p.acc)}<rect x="540" y="180" width="170" height="60" rx="16" fill="${p.soft}"/><rect x="540" y="260" width="170" height="60" rx="16" fill="${p.soft}"/><rect x="540" y="340" width="170" height="60" rx="16" fill="${p.soft}"/>${check(575, 210, 18, p.acc, '#FFFFFF')}${check(575, 290, 18, p.acc, '#FFFFFF')}${check(575, 370, 18, p.acc2, p.ink)}<rect x="120" y="440" width="560" height="14" rx="7" fill="${p.soft}"/>`,
  chat: p => `${bubble(60, 50, 520, 170, p.soft, false)}${txt(320, 155, 52, '“Personal trainer”', p.fg, 700)}${bubble(220, 300, 520, 210, p.acc, true)}${txt(480, 385, 38, '“I help desk workers', p.ink, 800)}${txt(480, 445, 38, 'beat back pain”', p.ink, 800)}${check(700, 300, 34, p.acc2, p.ink)}`,
  proof: p => `<rect x="60" y="70" width="330" height="260" rx="30" fill="${p.fg}"/><circle cx="225" cy="190" r="70" fill="${p.acc2}"/><path d="M205 150 l60 40 l-60 40z" fill="${p.ink}"/><rect x="430" y="70" width="310" height="260" rx="30" fill="${p.fg}"/>${[0, 1, 2, 3, 4].map(i => star(480 + i * 53, 150, 24, p.acc2)).join('')}<rect x="470" y="210" width="230" height="16" rx="8" fill="${p.soft}"/><rect x="470" y="250" width="170" height="16" rx="8" fill="${p.soft}"/><rect x="60" y="370" width="680" height="170" rx="30" fill="${p.soft}"/>${check(150, 455, 42, p.acc, '#FFFFFF')}${txt(220, 470, 44, 'Photos. Clips. Reviews.', p.fg, 800, 'start')}`,
  three: p => [0, 1, 2].map(i => `<rect x="60" y="${60 + i * 170}" width="680" height="140" rx="36" fill="${p.fg}"/>${check(140, 130 + i * 170, 44, p.acc, '#FFFFFF')}${txt(220, 145 + i * 170, 44, ['Clear offer', 'Visible proof', 'Easy booking'][i], p.bg, 900, 'start')}`).join(''),
  profile: p => phone(240, 20, 320, 560, p, `<circle cx="160" cy="130" r="44" fill="${p.acc}"/><rect x="60" y="200" width="200" height="22" rx="11" fill="${p.ink}"/><rect x="85" y="240" width="150" height="16" rx="8" fill="${p.soft}"/>${[0, 1, 2, 3, 4].map(i => star(90 + i * 35, 300, 13, p.acc2)).join('')}<rect x="50" y="340" width="220" height="64" rx="32" fill="${p.acc}"/>${txt(160, 382, 28, 'Book now', '#FFFFFF', 900)}<rect x="50" y="424" width="220" height="64" rx="32" fill="${p.acc2}"/>${txt(160, 466, 28, 'Pay in app', p.ink, 900)}`),
  mobilemoney: p => phone(250, 20, 300, 560, p, `<rect x="40" y="70" width="220" height="100" rx="24" fill="${p.acc}"/>${txt(150, 135, 36, 'M-Pesa', '#FFFFFF', 900)}<rect x="40" y="190" width="220" height="100" rx="24" fill="${p.acc2}"/>${txt(150, 255, 32, 'Airtel Money', p.ink, 900)}<rect x="40" y="310" width="220" height="100" rx="24" fill="${p.soft}"/>${txt(150, 375, 32, 'Tigo Pesa', p.fg, 900)}${check(150, 470, 36, p.acc, '#FFFFFF')}`) + `<circle cx="130" cy="150" r="60" fill="${p.acc2}"/>${txt(130, 175, 40, 'TSh', p.ink, 900)}<circle cx="680" cy="420" r="70" fill="${p.acc}"/>${txt(680, 448, 70, '✓', '#FFFFFF', 900)}`,
  network: p => { const pts = [[400, 300], [160, 160], [640, 150], [140, 440], [660, 450], [400, 110], [400, 500]]; return `<g stroke="${p.fg}" stroke-width="8" stroke-dasharray="2 18" stroke-linecap="round">${pts.slice(1).map(q => `<path d="M400 300 L${q[0]} ${q[1]}"/>`).join('')}</g>` + pts.map((q, i) => pin(q[0], q[1] - (i ? 10 : 0), i ? 0.5 : 1.0, i ? p.acc : p.acc2, p.fg)).join('') + dumbbell(400, 300, 0.22, p.ink, p.ink); },
  vetted: p => `<path d="M400 40 L660 130 V330 C660 450 540 520 400 570 C260 520 140 450 140 330 V130Z" fill="${p.fg}"/><path d="M400 90 L610 160 V330 C610 420 520 475 400 515 C280 475 190 420 190 330 V160Z" fill="${p.acc}"/>${[0, 1, 2, 3, 4].map(i => star(280 + i * 60, 250, 26, p.acc2)).join('')}${check(400, 390, 60, p.fg, p.ink)}`,
  qr: p => { let cells = ''; const s = 22, ox = 240, oy = 110; let seed = 7; for (let r = 0; r < 12; r++) for (let c = 0; c < 12; c++) { seed = (seed * 9301 + 49297) % 233280; const on = seed / 233280 > 0.45 || ((r < 3 || r > 8) && (c < 3 || c > 8) && !(r > 8 && c > 8)); if (on && !(r > 8 && c > 8)) cells += `<rect x="${ox + c * s}" y="${oy + r * s}" width="${s - 2}" height="${s - 2}" rx="4" fill="${p.ink}"/>`; } return `<rect x="215" y="85" width="330" height="330" rx="30" fill="#FFFFFF"/>${cells}<circle cx="630" cy="440" r="110" fill="${p.acc2}"/><path d="M630 370 a70 70 0 1 1 -60 35" stroke="${p.ink}" stroke-width="20" fill="none" stroke-linecap="round"/><path d="M560 385 l20 40 l40 -25" fill="${p.ink}"/>${txt(630, 462, 48, '60s', p.ink, 900)}${txt(400, 585, 34, 'New code every minute.', p.fg)}`; },
  appfeat: p => phone(240, 20, 320, 560, p, `<rect x="40" y="70" width="240" height="110" rx="26" fill="${p.acc}"/>${txt(160, 138, 34, 'Trainers', '#FFFFFF', 900)}<rect x="40" y="200" width="240" height="110" rx="26" fill="${p.acc2}"/>${txt(160, 268, 34, 'Gear', p.ink, 900)}<rect x="40" y="330" width="240" height="110" rx="26" fill="${p.soft}"/>${txt(160, 398, 34, 'Gyms', p.fg, 900)}`) + dumbbell(110, 500, 0.4, p.fg, p.acc2),
};
const ctaPhoto = (p, kw) => `${bubble(60, 30, 680, 300, '#FFFFFF', false)}${txt(400, 135, 50, 'Comment', p.ink)}<rect x="130" y="160" width="540" height="130" rx="65" fill="${p.ink}"/>${txt(400, 252, 84, kw, '#FFFFFF', 900)}`;

function html(i, sl) {
  const p = themes[sl.t]; const n = slides.length;
  const isC = !!sl.kw;
  const hs = sl.h.replace(/<[^>]+>/g, '').length;
  const fs_ = isC ? 96 : (hs < 28 ? 112 : hs < 48 ? 96 : 84);
  let ov = '';
  if (isC) ov = `<div class="ov cta"><svg viewBox="0 0 800 350">${ctaPhoto(p, sl.kw)}</svg></div>`;
  else if (sl.ov) ov = `<div class="ov ${sl.ov}"><svg viewBox="0 0 800 600">${art[sl.ov](p)}</svg></div>`;
  const em = sl.t === 'navy' ? p.acc2 : sl.t === 'cream' ? p.acc : sl.t === 'green' ? p.acc : '#fff';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
 @font-face{font-family:Inter;font-weight:400 900;src:url("${FONTS}/Inter-900.ttf")}
 @font-face{font-family:Inter;font-weight:700;src:url("${FONTS}/Inter-700.ttf")}
 @font-face{font-family:Inter;font-weight:800;src:url("${FONTS}/Inter-800.ttf")}
 *{box-sizing:border-box;margin:0}
 body{width:${W}px;height:${H}px;background:${p.bg};color:${p.fg};font-family:Inter,sans-serif;display:flex;flex-direction:column;padding:70px 80px 60px;overflow:hidden}
 .top{display:flex;justify-content:space-between;align-items:center;height:70px}
 .brand{display:flex;align-items:center;gap:16px;font-weight:800;font-size:34px;letter-spacing:-.5px}
 .brand img{width:62px;height:62px;border-radius:16px}
 .n{font-weight:800;font-size:30px;opacity:.7}
 h1{font-weight:900;font-size:${fs_}px;line-height:1.02;letter-spacing:-3px;margin-top:44px}
 h1 em,.s em{font-style:normal;color:${em}}
 .s{font-weight:700;font-size:48px;line-height:1.15;margin-top:22px;letter-spacing:-1px}
 .s b{font-weight:900;color:${em}}
 .photo{flex:1;margin-top:30px;border-radius:44px;position:relative;overflow:hidden;min-height:0;background:#222 url("${PH}${sl.ph}.jpg") ${sl.pos || '50% 40%'}/cover no-repeat}
 .photo:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 55%,rgba(0,0,0,.35));}
 .ov{position:absolute;z-index:2}
 .ov svg{width:100%;height:auto;display:block;filter:drop-shadow(0 12px 28px rgba(0,0,0,.35))}
 .ov.cta{left:4%;right:4%;bottom:4%}
 .ov:not(.cta){right:3%;bottom:4%;width:58%}
 .ov.vetted,.ov.network{width:46%}
 .foot{height:40px;margin-top:22px;font-weight:700;font-size:28px;opacity:.75;display:flex;justify-content:space-between}
 </style></head><body>
 <div class="top"><div class="brand"><img src="${LOGO}">FitFlex Africa</div><div class="n">${i + 1}/${n}</div></div>
 <h1>${sl.h}</h1>${sl.s ? `<div class="s">${sl.s}</div>` : ''}${isC ? `<div class="s">${sl.cta}</div>` : ''}
 <div class="photo">${ov}</div>
 <div class="foot"><span>${i < n - 1 ? 'Swipe →' : ''}</span><span>${handle}</span></div>
 </body></html>`;
}

const srcDir = path.join(contentDir, 'source');
const outDir = path.join(contentDir, 'slides');
fs.mkdirSync(outDir, { recursive: true });
const chrome = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
slides.forEach((sl, i) => {
  const nn = String(i + 1).padStart(2, '0');
  const f = path.join(srcDir, `${spec.prefix || ''}${nn}.html`);
  fs.writeFileSync(f, html(i, sl));
  if (wantPng) {
    const png = path.join(outDir, `${spec.prefix || ''}${nn}.png`);
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--window-size=${W},${H}`, `--screenshot=${png}`, `file://${f}`], { stdio: 'ignore' });
  }
});
console.log(`${slides.length} slides -> ${path.relative(root, srcDir)}${wantPng ? ' and ' + path.relative(root, outDir) : ''}`);
