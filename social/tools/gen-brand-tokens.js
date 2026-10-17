#!/usr/bin/env node
// Regenerates social/brand/brand-tokens.json from the machine-readable block in
// the canonical brand doc. Usage:
//   node social/tools/gen-brand-tokens.js [path/to/design-system.md]
// Default source: ../../canon/04-marketing/design-system.md relative to the repo
// root (the canon folder is kept in the owner's workspace, not in this repo).
// The script looks for a fenced ```json block that starts with {"brandTokens":
// and writes its "brandTokens" value. It refuses to write if any hex colour in
// the block is not also mentioned in the prose, so the two cannot drift.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const src = process.argv[2] || path.join(root, 'canon', '04-marketing', 'design-system.md');
const out = path.join(root, 'social', 'brand', 'brand-tokens.json');

if (!fs.existsSync(src)) {
  console.error(`canon doc not found at ${src}; brand-tokens.json left unchanged`);
  process.exit(2);
}
const md = fs.readFileSync(src, 'utf8');
const m = md.match(/```json\s*\n(\{\s*"brandTokens"[\s\S]*?)\n```/);
if (!m) {
  console.error('no ```json {"brandTokens": ...} block found in the canon doc');
  process.exit(2);
}
const tokens = JSON.parse(m[1]).brandTokens;
const prose = md.replace(m[0], '').toUpperCase();
const hexes = JSON.stringify(tokens).match(/#[0-9A-Fa-f]{6}/g) || [];
const missing = [...new Set(hexes.map(h => h.toUpperCase()))].filter(h => !prose.includes(h));
if (missing.length) {
  console.error(`these token colours are not mentioned in the canon prose: ${missing.join(', ')}`);
  process.exit(1);
}
fs.writeFileSync(out, JSON.stringify(tokens, null, 2) + '\n');
console.log(`wrote ${path.relative(root, out)} from ${path.relative(root, src)}`);
