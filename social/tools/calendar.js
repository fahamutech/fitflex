#!/usr/bin/env node
// Generates the content calendar from the records (ideas.jsonl + publishes.jsonl).
// The calendar is a view, never a second source of truth.
//
//   node social/tools/calendar.js [--month 2026-10] [--write] [--check]
// --write  writes social/calendar/<month>.md (and <month>.md for every month that has records when --month is omitted)
// --check  exits 1 if any calendar file differs from what the records produce
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const dataDir = process.env.SOCIAL_DATA_DIR ? path.resolve(process.env.SOCIAL_DATA_DIR) : path.join(root, 'social', 'data');
const calDir = process.env.SOCIAL_CAL_DIR ? path.resolve(process.env.SOCIAL_CAL_DIR) : path.join(root, 'social', 'calendar');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const readJsonl = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const ideas = readJsonl(path.join(dataDir, 'ideas.jsonl'));
const pubRows = readJsonl(path.join(dataDir, 'publishes.jsonl'));
const latestPub = {}; for (const p of pubRows) latestPub[p.id] = { ...(latestPub[p.id] || {}), ...p };
const pubs = Object.values(latestPub);
const SLOT = { A: 'Mon', B: 'Fri', C: 'Sat', D: 'Wed', R: 'Mon' };
const { styleForDate, LABEL } = require('./style.js');

const monthOf = r => (r.id.match(/^(\d{4}-\d{2})/) || [])[1] || r.created_at.slice(0, 7);
function render(month) {
  const rows = ideas.filter(r => monthOf(r) === month).sort((a, b) => a.id.localeCompare(b.id));
  const out = [];
  out.push(`# Content calendar ${month}`);
  out.push('');
  out.push(`Generated from \`social/data/ideas.jsonl\` and \`publishes.jsonl\` by \`social/tools/calendar.js\`. Do not edit; change the records and regenerate. The month plan with pillars and rhythm is \`${month}-plan.md\` when present.`);
  out.push('');
  out.push('| Record | Week | Slot | Style (rotation) | Pillar | Audience | Format | Lang | State | Platforms | Scheduled / published | Open checks |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const wk = (r.id.match(/-W(\d)-/) || [])[1] || ''; const letter = (r.id.match(/-W\d-([A-Z])-/) || [])[1] || '';
    const mine = pubs.filter(p => p.idea_id === r.id && ['pending', 'scheduled', 'published'].includes(p.status));
    const sched = mine.map(p => `${p.platform}: ${p.status}${p.scheduled_for ? ' ' + p.scheduled_for.slice(0, 16).replace('T', ' ') : ''}${p.post_url ? ` [post](${p.post_url})` : ''}`).join('<br>') || '';
    const brief = path.join(root, 'social', 'content', r.id, 'brief.md');
    let open = '';
    if (fs.existsSync(brief)) { const n = (fs.readFileSync(brief, 'utf8').match(/^- \[ \] /gm) || []).length; open = n ? `${n} open` : 'none'; }
    const when = (mine.find(p => p.scheduled_for) || {}).scheduled_for || (pubs.find(p => p.idea_id === r.id && p.published_at) || {}).published_at || null;
    const style = when ? LABEL[styleForDate(when)] : '';
    let built = ''; try { built = JSON.parse(fs.readFileSync(path.join(root, 'social', 'content', r.id, 'source', 'slides.json'), 'utf8')).style || 'v1'; } catch (e) {}
    out.push(`| [${r.id}](../content/${r.id}/brief.md) | W${wk} | ${SLOT[letter] || ''} | ${style}${built ? ` · built ${built}` : ''} | ${r.pillar} | ${r.audience} | ${r.format} | ${r.language_lead} | ${r.state} | ${(r.platforms || []).join(', ')} | ${sched} | ${open} |`);
  }
  out.push('');
  const states = {}; rows.forEach(r => { states[r.state] = (states[r.state] || 0) + 1; });
  out.push(`States: ${Object.entries(states).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`);
  out.push('');
  return out.join('\n');
}
const months = opt('--month') ? [opt('--month')] : [...new Set(ideas.map(monthOf))].sort();
let diff = 0;
fs.mkdirSync(calDir, { recursive: true });
for (const m of months) {
  const text = render(m); const f = path.join(calDir, `${m}.md`);
  if (argv.includes('--check')) { const cur = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; if (cur !== text) { console.error(`calendar ${m}.md differs from the records`); diff++; } else console.log(`calendar ${m}.md matches the records`); }
  else if (argv.includes('--write')) { fs.writeFileSync(f, text); console.log(`wrote ${path.relative(root, f)} (${ideas.filter(r => monthOf(r) === m).length} records)`); }
  else process.stdout.write(text);
}
if (diff) process.exit(1);
