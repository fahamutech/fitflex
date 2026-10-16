#!/usr/bin/env node
// Integrity checks for the social records. Exit 1 on any failure.
//   node social/tools/check-records.js [--data social/data] [--phase 2]
// Rules enforced:
//   - every *.jsonl line parses and carries the required fields
//   - every record state beyond `idea` has an approvals line that reaches it
//   - `approved`, `scheduled`, `published`, `measured` require an approvals line
//     with actor=owner and to_state=approved; a brand_reviewer line never counts
//   - before Phase 3 no record may be scheduled/published and publishes.jsonl must be absent or empty
//   - every record has content/<id>/brief.md and, when rendered, licences.md
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const root = path.resolve(__dirname, '..', '..');
const dataDir = path.resolve(root, opt('--data', 'social/data'));
const contentDir = path.resolve(root, opt('--content', 'social/content'));
const phase = Number(opt('--phase', '2'));

const errors = [];
const fail = m => errors.push(m);
const readJsonl = f => {
  const p = path.join(dataDir, f);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l, i) => {
    try { return JSON.parse(l); } catch (e) { fail(`${f}:${i + 1} invalid JSON`); return null; }
  }).filter(Boolean);
};
const need = (rows, f, fields) => rows.forEach((r, i) => fields.forEach(k => { if (!(k in r)) fail(`${f}:${i + 1} missing field ${k}`); }));

const ideas = readJsonl('ideas.jsonl');
const approvals = readJsonl('approvals.jsonl');
const publishes = readJsonl('publishes.jsonl');
need(ideas, 'ideas.jsonl', ['id', 'pillar', 'audience', 'problem', 'hook', 'state', 'facts_cited', 'created_at', 'updated_at']);
need(approvals, 'approvals.jsonl', ['id', 'idea_id', 'from_state', 'to_state', 'actor', 'decision', 'at']);
need(readJsonl('watchlist.jsonl'), 'watchlist.jsonl', ['id', 'platform', 'handle', 'category', 'source']);
need(readJsonl('inspiration.jsonl'), 'inspiration.jsonl', ['id', 'watchlist_id', 'pattern', 'captured_at']);

const STATES = ['idea', 'drafted', 'brand_checked', 'approved', 'scheduled', 'published', 'measured', 'rejected', 'archived'];
const NEEDS_OWNER = new Set(['approved', 'scheduled', 'published', 'measured']);
const ACTORS = new Set(['claude', 'brand_reviewer', 'owner']);

approvals.forEach(a => {
  if (!ACTORS.has(a.actor)) fail(`${a.id}: unknown actor ${a.actor}`);
  if (a.to_state === 'approved' && a.actor !== 'owner') fail(`${a.id}: only the owner may write to_state=approved (actor was ${a.actor})`);
  if (a.actor === 'brand_reviewer' && !['drafted', 'brand_checked', 'rejected'].includes(a.to_state)) fail(`${a.id}: brand_reviewer may only move a record to drafted, brand_checked or rejected (got ${a.to_state})`);
});

ideas.forEach(r => {
  if (!STATES.includes(r.state)) fail(`${r.id}: unknown state ${r.state}`);
  const mine = approvals.filter(a => a.idea_id === r.id);
  if (r.state !== 'idea' && !mine.some(a => a.to_state === r.state)) fail(`${r.id}: state ${r.state} has no approvals line reaching it`);
  if (NEEDS_OWNER.has(r.state) && !mine.some(a => a.actor === 'owner' && a.to_state === 'approved' && a.decision === 'pass')) fail(`${r.id}: state ${r.state} without an owner approved line`);
  if (phase < 3 && ['scheduled', 'published', 'measured'].includes(r.state)) fail(`${r.id}: ${r.state} is not allowed before Phase 3`);
  const dir = path.join(contentDir, r.id);
  if (r.state !== 'idea' && !fs.existsSync(path.join(dir, 'brief.md'))) fail(`${r.id}: no brief.md for a ${r.state} record`);
  if (fs.existsSync(path.join(dir, 'slides')) && fs.readdirSync(path.join(dir, 'slides')).length && !fs.existsSync(path.join(dir, 'licences.md'))) fail(`${r.id}: rendered slides without licences.md`);
  if (!Array.isArray(r.facts_cited)) fail(`${r.id}: facts_cited must be a list`);
});

if (phase < 3 && publishes.length) fail(`publishes.jsonl has ${publishes.length} line(s) before Phase 3`);

if (errors.length) { console.error(`check-records: ${errors.length} problem(s)`); errors.forEach(e => console.error(' - ' + e)); process.exit(1); }
console.log(`check-records: ok (${ideas.length} records, ${approvals.length} approval lines, phase ${phase})`);
