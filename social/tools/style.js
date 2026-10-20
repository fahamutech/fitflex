#!/usr/bin/env node
// Weekly template rotation (owner, 2026-10-20): week 1 photo-scrim (style v2), week 2 type-first
// bilingual (style v3), week 3 editorial; then the cycle restarts. Anchored on ISO week 43 of 2026
// (the week of the first scheduled posts). Covers alternate Volt and dark across consecutive posts.
//   node social/tools/style.js 2026-10-27   -> prints the style for that date
const ROTATION = ['v2', 'v3', 'editorial'];
const LABEL = { v2: 'photo-scrim (v2)', v3: 'type-first bilingual (v3)', editorial: 'editorial' };
function isoWeek(d) { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return { year: t.getUTCFullYear(), week: Math.ceil(((t - y0) / 864e5 + 1) / 7) }; }
function weekIndex(d) { const { year, week } = isoWeek(d); return (year - 2026) * 52 + week - 43; }
function styleForDate(dateStr) { const d = new Date(dateStr.slice(0, 10) + 'T00:00:00Z'); const i = ((weekIndex(d) % 3) + 3) % 3; return ROTATION[i]; }
module.exports = { styleForDate, isoWeek, ROTATION, LABEL };
if (require.main === module) { const d = process.argv[2] || new Date().toISOString(); const s = styleForDate(d); console.log(`${d.slice(0, 10)}: ISO week ${isoWeek(new Date(d.slice(0, 10) + 'T00:00:00Z')).week} -> ${LABEL[s]}`); }
