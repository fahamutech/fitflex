#!/bin/sh
# Phase 4 acceptance tests on COPIES of the records.
set -u
cd "$(dirname "$0")/../../.." || exit 1
T=$(mktemp -d); cp -R social/data "$T/data"; mkdir -p "$T/intel" "$T/cal"
export SOCIAL_DATA_DIR="$T/data" SOCIAL_INTEL_DIR="$T/intel" SOCIAL_CAL_DIR="$T/cal" SOCIAL_OPS_DIR="$T/ops" SOCIAL_CONTENT_DIR="$T/content"; cp -R social/ops "$T/ops"; cp -R social/content "$T/content"
: > "$T/data/publishes.jsonl"; : > "$T/data/performance.jsonl"
node -e 'const fs=require("fs");const f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,"utf8").split("\n").filter(Boolean).map(l=>{const r=JSON.parse(l);if(["scheduled","published","measured"].includes(r.state)&&!r.manual)r.state="approved";return JSON.stringify(r)}).join("\n")+"\n")' "$T/data/ideas.jsonl"
pass=0; failn=0
expect() { want=$1; label=$2; shift 2; out=$("$@" 2>&1); code=$?; if [ "$code" -eq "$want" ]; then echo "PASS  $label"; pass=$((pass+1)); else echo "FAIL  $label (exit $code, wanted $want)"; echo "$out" | head -12; failn=$((failn+1)); fi; }
check() { label=$1; shift; if "$@" >/dev/null 2>&1; then echo "PASS  $label"; pass=$((pass+1)); else echo "FAIL  $label"; failn=$((failn+1)); fi; }

echo "# 1 weekly report cites dated source records"
node social/tools/intel-report.js --week 2026-W99 >/dev/null
check "report lists record ids" grep -q "ins_2026-10-09_01" "$T/intel/2026-W99.md"
check "report rows carry observation dates" grep -q "| 2026-10-09 |" "$T/intel/2026-W99.md"
check "report rows carry a source" grep -q "saved collections" "$T/intel/2026-W99.md"
check "report separates interpretation" grep -q "Interpretation (analyst reading, not measured)" "$T/intel/2026-W99.md"

echo "# 2 repeated observations do not create duplicates"
node social/tools/intel-capture.js account --handle testgym --category gym --region tz --why "test" --source "test" >/dev/null
expect 0 "first observation added" node social/tools/intel-capture.js observe --handle testgym --url https://www.instagram.com/p/TEST1/ --format reel --hook data --pattern "test pattern one" --observed 2026-10-17 --source "test"
before=$(wc -l < "$T/data/inspiration.jsonl")
expect 0 "same url again -> no new line" node social/tools/intel-capture.js observe --handle testgym --url https://www.instagram.com/p/TEST1/ --format reel --hook data --pattern "test pattern one" --observed 2026-10-18 --source "test"
after=$(wc -l < "$T/data/inspiration.jsonl"); [ "$before" -eq "$after" ] && { echo "PASS  line count unchanged on repeat"; pass=$((pass+1)); } || { echo "FAIL  duplicate line added"; failn=$((failn+1)); }
expect 0 "same pattern without url -> deduped by account+pattern" node social/tools/intel-capture.js observe --handle testgym --url - --format reel --hook data --pattern "Test Pattern ONE" --observed 2026-10-18 --source "test"
after2=$(wc -l < "$T/data/inspiration.jsonl"); [ "$before" -eq "$after2" ] && { echo "PASS  pattern dedupe holds"; pass=$((pass+1)); } || { echo "FAIL  pattern duplicate added"; failn=$((failn+1)); }
expect 0 "capture check passes" node social/tools/intel-capture.js check

echo "# 3 missing metrics remain null"
expect 0 "observation with partial metrics" node social/tools/intel-capture.js observe --handle testgym --url https://www.instagram.com/p/TEST2/ --format carousel --hook how_to --pattern "second" --observed 2026-10-17 --source "test" --metrics '{"likes": 10}'
check "saves is null, not 0" sh -c "grep TEST2 '$T/data/inspiration.jsonl' | grep -q '\"saves\": null' || grep TEST2 '$T/data/inspiration.jsonl' | grep -q '\"saves\":null'"
# performance snapshot: needs a publish line; create a published one on the copy with an exact approval
HASH=$(node social/tools/publish.js hash 2026-10-W3-A-owners)
printf '{"id":"apr_t","idea_id":"2026-10-W3-A-owners","from_state":"approved","to_state":"approved","actor":"owner","decision":"pass","content_hash":"%s","platforms":["instagram"],"note":"test","at":"2026-10-17T00:00:00+03:00"}\n' "$HASH" >> "$T/data/approvals.jsonl"
printf '{"id":"pub_t1","idea_id":"2026-10-W3-A-owners","platform":"instagram","content_hash":"%s","scheduled_for":"2026-10-19T08:00:00+03:00","status":"published","post_url":"https://www.instagram.com/p/TESTPOST/","at":"2026-10-19T08:05:00+03:00"}\n' "$HASH" >> "$T/data/publishes.jsonl"
expect 0 "snapshot with only likes and reach" node social/tools/publish.js snapshot pub_t1 --json '{"likes": 12, "reach": 300}' --observed 2026-10-20T07:00:00+03:00
check "saves null in performance.jsonl" sh -c "tail -1 '$T/data/performance.jsonl' | grep -q '\"saves\":null'"
check "likes kept" sh -c "tail -1 '$T/data/performance.jsonl' | grep -q '\"likes\":12'"

echo "# 4 calendar reconciles with the records"
node social/tools/calendar.js --write >/dev/null
expect 0 "calendar --check passes after write" node social/tools/calendar.js --check
printf '{"id":"2026-10-W4-Z-vendor","pillar":"marketplace","audience":"vendor","problem":"t","hook":"t","concept":"t","format":"reel","language_lead":"en","platforms":["instagram"],"inspiration_ids":[],"facts_cited":[],"state":"idea","owner_note":"","created_at":"2026-10-17T00:00:00+03:00","updated_at":"2026-10-17T00:00:00+03:00"}\n' >> "$T/data/ideas.jsonl"
expect 1 "calendar --check fails when records changed" node social/tools/calendar.js --check

echo "# 5 performance recommendations disclose limitations"
node social/tools/performance-report.js --write >/dev/null
check "learnings has Limitations" grep -q "### Limitations" "$T/data/learnings.md"
check "no winner from one post" grep -q "only one .* group so far\|fewer than two" "$T/data/learnings.md"
check "sample-size rule stated" grep -q "no winner is declared below n=" "$T/data/learnings.md"

echo "# 6 scheduled tasks produce no publishing writes"
printf '{"paused": false, "reason": "test", "changed_by": "test", "changed_at": "2026-10-17T00:00:00+03:00"}\n' > "$T/ops/pause.json"
expect 1 "automation actor cannot reserve" env SOCIAL_ACTOR=automation node social/tools/publish.js reserve 2026-10-W3-A-owners facebook 2026-11-05T08:00
check "sweep prompt forbids writes" grep -q "may NOT" social/ops/tasks/weekly-intel-sweep.md
check "pull prompt forbids writes" grep -q "may NOT" social/ops/tasks/monday-performance-pull.md
check "automation master switch exists (paused key present)" grep -q '"paused":' social/ops/automation.json

echo "# 7 next proposal cites learnings (procedural)"
check "strategy skill requires a Learnings cited list" grep -q "Learnings cited" .claude/skills/social-strategy/SKILL.md

echo "# 9 manual posts can be registered and tracked"
expect 0 "manual registration creates record + owner line + publish line" node social/tools/publish.js manual --url https://www.instagram.com/p/MANUAL1/ --platform instagram --published 2026-10-18T19:30:00+03:00 --caption "Posted by hand. Test." --pillar community --audience member --format static
check "manual idea record exists" sh -c "grep -q '\"manual\":true' '$T/data/ideas.jsonl'"
check "manual owner line exists" sh -c "grep -q '\"manual\":true' '$T/data/approvals.jsonl'"
check "manual publish line is published with source manual" sh -c "grep MANUAL1 '$T/data/publishes.jsonl' | grep -q '\"source\":\"manual\"'"
expect 1 "same url cannot be registered twice" node social/tools/publish.js manual --url https://www.instagram.com/p/MANUAL1/ --platform instagram --published 2026-10-18T19:30:00+03:00 --caption "dup"
expect 1 "automation cannot register manual posts" env SOCIAL_ACTOR=automation node social/tools/publish.js manual --url https://www.instagram.com/p/MANUAL2/ --platform instagram --published 2026-10-18T19:30:00+03:00
MP=$(grep MANUAL1 "$T/data/publishes.jsonl" | head -1 | sed 's/.*"id":"\([^"]*\)".*/\1/')
expect 0 "manual post can be snapshotted" node social/tools/publish.js snapshot "$MP" --json '{"likes": 5}' --observed 2026-10-20T07:00:00+03:00
node social/tools/performance-report.js --write >/dev/null
check "manual post listed as manual" grep -q "| manual |" "$T/data/learnings.md"
check "manual posts excluded from comparisons (stated)" grep -q "excluded from the comparisons" "$T/data/learnings.md"
expect 0 "checker accepts manual records" node social/tools/check-records.js --data "$T/data" --content "$T/content" --phase 3
node social/tools/calendar.js --write >/dev/null; check "calendar lists the manual record" grep -q "M1-manual" "$T/cal/2026-10.md"

echo "# 8 checker still green on the copy"
expect 0 "check-records phase 3 on copy" node social/tools/check-records.js --data "$T/data" --content "$T/content" --phase 3

rm -rf "$T"; echo "passed=$pass failed=$failn"; [ "$failn" -eq 0 ]
