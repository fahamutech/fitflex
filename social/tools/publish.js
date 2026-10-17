#!/usr/bin/env node
// Publishing operations for the Social Studio. No network calls are made here:
// the Metricool call itself is made by the social-publisher agent through the
// connector. This script does everything around it, deterministically:
//
//   node social/tools/publish.js hash     <record-id>                 content hash of the exact version
//   node social/tools/publish.js dry-run  <record-id> <platform> <YYYY-MM-DDTHH:mm> [--base <raw-url-base>]
//   node social/tools/publish.js reserve  <record-id> <platform> <YYYY-MM-DDTHH:mm> [--base ...]   (writes a pending line + payload file)
//   node social/tools/publish.js result   <publish-id> --status scheduled|failed --post-id <id> --uuid <uuid> --url <url> [--error <text>]
//   node social/tools/publish.js snapshot <publish-id> --json '<metrics json>' --source metricool
//
// Gates checked by dry-run and reserve (any failure = exit 1, nothing written):
//   pause switch off · record state approved · owner approval line for this exact
//   content hash AND this platform · brief and licences present, no UNRESOLVED ·
//   no blocking language-review note · publish.json present with caption and media ·
//   every media URL answers 200 · no existing pending/scheduled/published line for
//   the same record + platform + hash (idempotency) · schedule in the future, in
//   Africa/Dar_es_Salaam, converted to the API's ISO form with offset.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const dataDir = process.env.SOCIAL_DATA_DIR ? path.resolve(process.env.SOCIAL_DATA_DIR) : path.join(root, 'social', 'data');
const opsDir = process.env.SOCIAL_OPS_DIR ? path.resolve(process.env.SOCIAL_OPS_DIR) : path.join(root, 'social', 'ops');
const TZ = 'Africa/Dar_es_Salaam';
const TZ_OFFSET = '+03:00'; // Dar es Salaam has no daylight saving

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = k => argv.includes(k);

const readJsonl = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const appendJsonl = (f, obj) => fs.appendFileSync(f, JSON.stringify(obj) + '\n');
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
// Redact anything that looks like a credential before it reaches a record or a log.
const redact = s => String(s || '')
  .replace(/(bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1[REDACTED]')
  .replace(/([?&](?:token|key|secret|access_token|api_key)=)[^&\s]+/gi, '$1[REDACTED]')
  .replace(/\b(sk|pk|ghp|xox[abp])-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
  .replace(/\b[A-Fa-f0-9]{40,}\b/g, '[REDACTED]');

const brandFile = path.join(opsDir, 'metricool-brand.json');
const brand = fs.existsSync(brandFile) ? JSON.parse(fs.readFileSync(brandFile, 'utf8')) : null;

function contentHash(recordId) {
  const dir = path.join(root, 'social', 'content', recordId);
  const pub = path.join(dir, 'publish.json');
  if (!fs.existsSync(pub)) throw new Error(`${recordId}: publish.json missing`);
  const spec = JSON.parse(fs.readFileSync(pub, 'utf8'));
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(pub));
  for (const m of spec.media) {
    const f = path.join(dir, m);
    if (!fs.existsSync(f)) throw new Error(`${recordId}: media file missing: ${m}`);
    h.update(fs.readFileSync(f));
  }
  return 'sha256:' + h.digest('hex').slice(0, 32);
}

function headOk(url) {
  try {
    const out = execFileSync('curl', ['-sI', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '20', url], { encoding: 'utf8' });
    return out.trim() === '200';
  } catch (e) { return false; }
}

function gate(recordId, platform, when, { base, write }) {
  const problems = [];
  const pause = JSON.parse(fs.readFileSync(path.join(opsDir, 'pause.json'), 'utf8'));
  if (pause.paused) problems.push(`pause switch is ON (${redact(pause.reason)}); no publishing writes`);

  const ideas = readJsonl(path.join(dataDir, 'ideas.jsonl'));
  const rec = ideas.find(r => r.id === recordId);
  if (!rec) { problems.push(`record ${recordId} not found`); return { problems }; }
  if (rec.state !== 'approved') problems.push(`record state is ${rec.state}; only approved records can be scheduled`);
  if (!['instagram', 'facebook'].includes(platform)) problems.push(`platform ${platform} is not enabled (instagram, facebook only)`);
  if (!(rec.platforms || []).includes(platform)) problems.push(`record does not list ${platform} in platforms`);

  const dir = path.join(root, 'social', 'content', recordId);
  for (const f of ['brief.md', 'licences.md', 'publish.json']) if (!fs.existsSync(path.join(dir, f))) problems.push(`${f} missing`);
  if (fs.existsSync(path.join(dir, 'licences.md')) && /UNRESOLVED/.test(fs.readFileSync(path.join(dir, 'licences.md'), 'utf8'))) problems.push('licences.md has UNRESOLVED entries');

  let hash = null, spec = null;
  try { hash = contentHash(recordId); spec = JSON.parse(fs.readFileSync(path.join(dir, 'publish.json'), 'utf8')); } catch (e) { problems.push(e.message); }

  const approvals = readJsonl(path.join(dataDir, 'approvals.jsonl')).filter(a => a.idea_id === recordId);
  const ownerOk = approvals.filter(a => a.actor === 'owner' && a.to_state === 'approved' && a.decision === 'pass');
  const exact = ownerOk.filter(a => a.content_hash === hash && Array.isArray(a.platforms) && a.platforms.includes(platform));
  if (!ownerOk.length) problems.push('no owner approval line');
  else if (!exact.length) problems.push(`owner approval exists but not for this exact content version (${hash}) and platform (${platform}); ask the owner to confirm the exact version`);
  const langBlock = approvals.find(a => /language review:\s*blocking/i.test(a.note || ''));
  if (langBlock) problems.push(`language review marked blocking in ${langBlock.id}`);

  let payload = null;
  if (spec) {
    const v = spec.variants && spec.variants[platform];
    if (!v) problems.push(`publish.json has no variant for ${platform}`);
    else {
      if (!v.text || !v.text.trim()) problems.push(`${platform} caption text is empty`);
      if (!spec.media || !spec.media.length) problems.push('no media listed');
      if (platform === 'instagram' && spec.media.length > 10) problems.push('Instagram carousels allow at most 10 images');
      const urls = spec.media.map(m => `${base.replace(/\/$/, '')}/social/content/${recordId}/${m}`);
      const bad = urls.filter(u => !headOk(u));
      if (bad.length) problems.push(`media not publicly reachable (commit and push first): ${bad.join(', ')}`);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) problems.push(`schedule must be YYYY-MM-DDTHH:mm in ${TZ}`);
      else if (new Date(`${when}:00${TZ_OFFSET}`).getTime() <= Date.now() + 10 * 60 * 1000) problems.push(`schedule ${when} ${TZ} is in the past or less than 10 minutes away`);
      payload = {
        blogId: brand ? brand.brandId : null,
        date: `${when}:00${TZ_OFFSET}`,
        info: {
          autoPublish: true, draft: false, descendants: [], firstCommentText: v.firstComment || '', hasNotReadNotes: false,
          media: urls, mediaAltText: spec.altText || [], providers: [{ network: platform }],
          publicationDate: { dateTime: `${when}:00`, timezone: TZ }, shortener: false, smartLinkData: { ids: [] },
          text: v.text,
          ...(platform === 'instagram' ? { instagramData: { type: 'POST', isAiGenerated: !!spec.aiGenerated } } : {}),
          ...(platform === 'facebook' ? { facebookData: { type: 'POST' } } : {}),
        },
      };
      if (!payload.blogId) problems.push('metricool-brand.json missing or without brandId');
    }
  }

  const publishes = readJsonl(path.join(dataDir, 'publishes.jsonl'));
  const latest = {};
  for (const p of publishes) latest[p.id] = { ...(latest[p.id] || {}), ...p };
  const dup = Object.values(latest).find(p => p.idea_id === recordId && p.platform === platform && p.content_hash === hash && ['pending', 'scheduled', 'published'].includes(p.status));
  if (dup) problems.push(`duplicate: ${dup.id} already ${dup.status} for this record, platform and version`);

  return { problems, hash, payload, rec };
}

function printReport(title, g, extra = {}) {
  const report = { title, at: nowIso(), ok: g.problems.length === 0, problems: g.problems, content_hash: g.hash || null, payload: g.payload, ...extra };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (cmd === 'hash') {
  console.log(contentHash(argv[1]));
} else if (cmd === 'dry-run' || cmd === 'reserve') {
  const [recordId, platform, when] = [argv[1], argv[2], argv[3]];
  const base = opt('--base', (brand && brand.mediaBase) || '');
  if (!base) { console.error('no media base URL: pass --base or set mediaBase in social/ops/metricool-brand.json'); process.exit(2); }
  const g = gate(recordId, platform, when, { base, write: cmd === 'reserve' });
  fs.mkdirSync(path.join(opsDir, 'dryruns'), { recursive: true });
  const stamp = nowIso().replace(/[:]/g, '').replace(/\..*/, '');
  const file = path.join(opsDir, 'dryruns', `${recordId}-${platform}-${stamp}.json`);
  const report = printReport(`${cmd} ${recordId} ${platform} ${when} ${TZ}`, g, { base });
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  console.error(`report written: ${path.relative(root, file)}`);
  if (!report.ok) process.exit(1);
  if (cmd === 'reserve') {
    const n = readJsonl(path.join(dataDir, 'publishes.jsonl')).length + 1;
    const id = `pub_${String(n).padStart(4, '0')}`;
    appendJsonl(path.join(dataDir, 'publishes.jsonl'), {
      id, idea_id: recordId, platform, variant: platform, content_hash: g.hash, scheduled_for: `${when}:00${TZ_OFFSET}`, timezone: TZ,
      status: 'pending', idempotency_key: `${recordId}|${platform}|${g.hash}`, payload_file: path.relative(root, file), metricool_post_id: null, metricool_uuid: null, post_url: null, planner_url: null, error: null, at: nowIso(),
    });
    console.error(`reserved ${id}; the social-publisher agent may now make exactly one createScheduledPost call with the payload in the report, then record the result with: publish.js result ${id} ...`);
  }
} else if (cmd === 'result') {
  const id = argv[1]; const status = opt('--status');
  if (!['scheduled', 'failed', 'published', 'deleted'].includes(status)) { console.error('--status scheduled|failed|published|deleted'); process.exit(2); }
  const rows = readJsonl(path.join(dataDir, 'publishes.jsonl')).filter(p => p.id === id);
  if (!rows.length) { console.error(`${id} not found`); process.exit(2); }
  appendJsonl(path.join(dataDir, 'publishes.jsonl'), {
    id, idea_id: rows[0].idea_id, platform: rows[0].platform, status,
    metricool_post_id: opt('--post-id', null), metricool_uuid: opt('--uuid', null), post_url: opt('--url', null), planner_url: opt('--planner', null),
    error: opt('--error') ? redact(opt('--error')) : null, at: nowIso(),
  });
  console.log(`${id} -> ${status}`);
} else if (cmd === 'snapshot') {
  const id = argv[1]; const metrics = JSON.parse(opt('--json', '{}'));
  appendJsonl(path.join(dataDir, 'performance.jsonl'), { publish_id: id, observed_at: nowIso(), ...metrics, source: opt('--source', 'metricool') });
  console.log(`snapshot recorded for ${id}`);
} else {
  console.error('usage: publish.js hash|dry-run|reserve|result|snapshot ...'); process.exit(2);
}
