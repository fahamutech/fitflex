#!/usr/bin/env node
// Intelligence capture: append watchlist accounts and inspiration observations
// without duplicates, with the observation date and source always recorded.
//
//   node social/tools/intel-capture.js account --platform instagram --handle gsdgyms --category gym \
//        --region global --why "..." --source "saved collection Gyms 2026-10-09"
//   node social/tools/intel-capture.js observe --handle gsdgyms [--platform instagram] --url <public post url|-> \
//        --format carousel --hook data --pattern "structure in our words" --topic "retention" \
//        --tags run_gym,community --observed 2026-10-17 --source "saved collection Gyms" \
//        [--metrics '{"likes":123,"comments":4}']   (metrics absent -> null, never 0)
//   node social/tools/intel-capture.js check     (reports duplicate urls / patterns)
//
// Dedupe rules: an account is unique per platform+handle; an observation is unique per
// post_url when a url is given, otherwise per watchlist_id + normalised pattern. A repeat
// of an existing observation refreshes engagement (as a new metrics snapshot inside the
// record) instead of adding a second line.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..', '..');
const dataDir = process.env.SOCIAL_DATA_DIR ? path.resolve(process.env.SOCIAL_DATA_DIR) : path.join(root, 'social', 'data');
const WL = path.join(dataDir, 'watchlist.jsonl');
const INS = path.join(dataDir, 'inspiration.jsonl');
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const readJsonl = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const writeJsonl = (f, rows) => fs.writeFileSync(f, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
const today = () => new Date().toISOString().slice(0, 10);
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const METRICS = ['likes', 'comments', 'saves', 'shares', 'views'];
const FORMATS = ['carousel', 'reel', 'static', 'story', 'live', 'text'];
const HOOKS = ['contrarian', 'data', 'how_to', 'offer', 'spotlight', 'recap', 'price'];
const CATS = ['gym', 'trainer', 'vendor', 'workout', 'growth', 'club', 'real_estate', 'other'];

function need(v, name) { if (!v) { console.error(`missing --${name}`); process.exit(2); } return v; }

if (cmd === 'account') {
  const platform = opt('--platform', 'instagram'); const handle = need(opt('--handle'), 'handle').replace(/^@/, '');
  const rows = readJsonl(WL); const id = `wl_${platform}_${handle}`;
  if (rows.some(r => r.id === id)) { console.log(`exists: ${id}`); process.exit(0); }
  const category = opt('--category', 'other'); if (!CATS.includes(category)) { console.error(`category must be one of ${CATS.join(', ')}`); process.exit(2); }
  rows.push({ id, platform, handle, url: platform === 'instagram' ? `https://www.instagram.com/${handle}/` : opt('--url', ''), category, region: opt('--region', 'global'), why: opt('--why', ''), source: need(opt('--source'), 'source'), last_checked: opt('--observed', today()), active: true });
  writeJsonl(WL, rows); console.log(`added: ${id}`);
} else if (cmd === 'observe') {
  const platform = opt('--platform', 'instagram'); const handle = need(opt('--handle'), 'handle').replace(/^@/, '');
  const wlId = `wl_${platform}_${handle}`;
  const wl = readJsonl(WL);
  if (!wl.some(r => r.id === wlId)) { console.error(`account ${wlId} is not on the watchlist; add it first with 'account'`); process.exit(2); }
  const url = opt('--url', '-'); const pattern = need(opt('--pattern'), 'pattern'); const observed = opt('--observed', today()); const source = need(opt('--source'), 'source');
  const format = opt('--format', 'static'); if (!FORMATS.includes(format)) { console.error(`format must be one of ${FORMATS.join(', ')}`); process.exit(2); }
  const hook = opt('--hook', 'spotlight'); if (!HOOKS.includes(hook)) { console.error(`hook must be one of ${HOOKS.join(', ')}`); process.exit(2); }
  let metrics = null;
  if (opt('--metrics')) { const m = JSON.parse(opt('--metrics')); metrics = Object.fromEntries(METRICS.map(k => [k, (k in m && m[k] !== null && m[k] !== undefined) ? Number(m[k]) : null])); metrics.observed_at = observed; }
  const rows = readJsonl(INS);
  const dup = rows.find(r => (url !== '-' && r.post_url === url) || (url === '-' && r.watchlist_id === wlId && norm(r.pattern) === norm(pattern)));
  if (dup) {
    if (metrics) { dup.engagement_history = dup.engagement_history || (dup.engagement ? [dup.engagement] : []); dup.engagement_history.push(metrics); dup.engagement = metrics; dup.last_observed = observed; writeJsonl(INS, rows); console.log(`refreshed metrics on existing ${dup.id}`); }
    else console.log(`exists: ${dup.id} (no new metrics)`);
    process.exit(0);
  }
  const short = crypto.createHash('sha1').update(`${wlId}|${url}|${norm(pattern)}`).digest('hex').slice(0, 6);
  const id = `ins_${observed}_${short}`;
  rows.push({ id, watchlist_id: wlId, post_url: url === '-' ? null : url, captured_at: observed, last_observed: observed, format, hook_type: hook, topic: opt('--topic', ''), pattern, structure: opt('--structure', ''), engagement: metrics, tags: (opt('--tags', '') || '').split(',').filter(Boolean), used_in: [], source, kind: 'observation' });
  writeJsonl(INS, rows);
  const w = wl.find(r => r.id === wlId); w.last_checked = observed; writeJsonl(WL, wl);
  console.log(`added: ${id}`);
} else if (cmd === 'check') {
  const rows = readJsonl(INS); const seenUrl = new Map(); const seenPat = new Map(); let problems = 0;
  for (const r of rows) {
    if (r.post_url) { if (seenUrl.has(r.post_url)) { console.log(`duplicate url: ${r.id} = ${seenUrl.get(r.post_url)}`); problems++; } seenUrl.set(r.post_url, r.id); }
    const k = `${r.watchlist_id}|${norm(r.pattern)}`; if (seenPat.has(k)) { console.log(`duplicate pattern: ${r.id} = ${seenPat.get(k)}`); problems++; } seenPat.set(k, r.id);
    if (!r.captured_at) { console.log(`${r.id}: no observation date`); problems++; }
    if (r.engagement) for (const m of METRICS) if (!(m in r.engagement)) { console.log(`${r.id}: engagement missing ${m} (should be null)`); problems++; }
  }
  console.log(problems ? `intel-capture check: ${problems} problem(s)` : `intel-capture check: ok (${rows.length} observations, ${readJsonl(WL).length} accounts)`);
  process.exit(problems ? 1 : 0);
} else { console.error('usage: intel-capture.js account|observe|check ...'); process.exit(2); }
