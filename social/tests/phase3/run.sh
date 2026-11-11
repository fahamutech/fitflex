#!/bin/sh
# Phase 3 acceptance tests. Runs publish.js against COPIES of social/data and social/ops in a temp dir.
# Usage: sh social/tests/phase3/run.sh        (exit 0 = all tests behaved as expected)
set -u
cd "$(dirname "$0")/../../.." || exit 1
T=$(mktemp -d); cp -R social/data "$T/data"; cp -R social/ops "$T/ops"; rm -rf "$T/ops/dryruns"
export SOCIAL_DATA_DIR="$T/data" SOCIAL_OPS_DIR="$T/ops"
# the live records hold real reservations and scheduled/published states; the copy starts from the pre-pilot state (publishes emptied, live states back to approved)
: > "$T/data/publishes.jsonl"; : > "$T/data/performance.jsonl"
node -e 'const fs=require("fs");const f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,"utf8").split("\n").filter(Boolean).map(l=>{const r=JSON.parse(l);if(["scheduled","published","measured"].includes(r.state)&&!r.manual)r.state=(r.id==="2026-10-W3-A-owners"?"approved":"brand_checked");return JSON.stringify(r)}).join("\n")+"\n")' "$T/data/ideas.jsonl"
REC=2026-10-W3-A-owners; HASH=$(node social/tools/publish.js hash $REC); WHEN=2026-11-02T08:00
pass=0; failn=0
expect() { # expect <0|1> <label> <command...>
  want=$1; label=$2; shift 2; out=$("$@" 2>&1); code=$?
  if [ "$code" -eq "$want" ]; then echo "PASS  $label"; pass=$((pass+1)); else echo "FAIL  $label (exit $code, wanted $want)"; echo "$out" | head -20; failn=$((failn+1)); fi
}
unpause() { printf '{"paused": false, "reason": "test", "changed_by": "test", "changed_at": "2026-10-16T00:00:00+03:00"}\n' > "$T/ops/pause.json"; }
pausei() { printf '{"paused": true, "reason": "test", "changed_by": "test", "changed_at": "2026-10-16T00:00:00+03:00"}\n' > "$T/ops/pause.json"; }
approve_exact() { # approve_exact <record> <platforms-json>
  printf '{"id":"apr_test","idea_id":"%s","from_state":"approved","to_state":"approved","actor":"owner","decision":"pass","content_hash":"%s","platforms":%s,"note":"test","at":"2026-10-16T00:00:00+03:00"}\n' "$1" "$HASH" "$2" >> "$T/data/approvals.jsonl"; }

echo "# 1 pause switch blocks (record approved, exact approval present)"
grep -v '"content_hash"' social/data/approvals.jsonl > "$T/data/approvals.jsonl"; approve_exact $REC '["instagram","facebook"]'; pausei
expect 1 "pause on -> reserve refused" node social/tools/publish.js reserve $REC instagram $WHEN

echo "# 2 draft content cannot be scheduled"
unpause
expect 1 "brand_checked record refused (W1-A)" node social/tools/publish.js dry-run 2026-10-W1-A-owners instagram $WHEN
expect 1 "idea record refused (W1-D reel)" node social/tools/publish.js dry-run 2026-10-W1-D-reel-members instagram $WHEN

echo "# 3 missing / invalid owner approval blocks"
grep -v '"content_hash"' social/data/approvals.jsonl > "$T/data/approvals.jsonl"   # real lines minus any exact-version approval (the live apr_0014 exists since the pilot)
expect 1 "approved record but no exact-version approval -> refused" node social/tools/publish.js dry-run $REC instagram $WHEN
printf '{"id":"apr_bad","idea_id":"%s","from_state":"brand_checked","to_state":"approved","actor":"brand_reviewer","decision":"pass","content_hash":"%s","platforms":["instagram"],"note":"reviewer tries","at":"2026-10-16T00:00:00+03:00"}\n' $REC "$HASH" >> "$T/data/approvals.jsonl"
expect 1 "reviewer-written approval does not count" node social/tools/publish.js dry-run $REC instagram $WHEN

echo "# 4 approval for one platform or version cannot authorise another"
grep -v '"content_hash"' social/data/approvals.jsonl > "$T/data/approvals.jsonl"; approve_exact $REC '["instagram"]'
expect 0 "instagram approved -> instagram dry run passes" node social/tools/publish.js dry-run $REC instagram $WHEN
expect 1 "instagram approved -> facebook refused" node social/tools/publish.js dry-run $REC facebook $WHEN
printf '{"id":"apr_old","idea_id":"%s","from_state":"approved","to_state":"approved","actor":"owner","decision":"pass","content_hash":"sha256:0000000000000000000000000000dead","platforms":["facebook"],"note":"old version","at":"2026-10-16T00:00:00+03:00"}\n' $REC >> "$T/data/approvals.jsonl"
expect 1 "approval for an older content version does not authorise facebook" node social/tools/publish.js dry-run $REC facebook $WHEN

echo "# 5 repeated requests do not create duplicate posts"
expect 0 "first reserve succeeds" node social/tools/publish.js reserve $REC instagram $WHEN
expect 1 "second reserve for same record/platform/version refused" node social/tools/publish.js reserve $REC instagram $WHEN
expect 1 "dry run also sees the pending duplicate" node social/tools/publish.js dry-run $REC instagram 2026-11-03T08:00

echo "# 6 connector errors are logged without leaking secrets"
expect 0 "failed result recorded" node social/tools/publish.js result pub_0001 --status failed --error "HTTP 401 from https://api.example/x?token=abc123SECRET bearer sk-live-ABCDEFGHIJKLMNOP"
if grep -q "abc123SECRET\|sk-live" "$T/data/publishes.jsonl"; then echo "FAIL  secret leaked into publishes.jsonl"; failn=$((failn+1)); else echo "PASS  error redacted in publishes.jsonl"; pass=$((pass+1)); fi
grep pub_0001 "$T/data/publishes.jsonl" | tail -1 | cut -c1-220

echo "# 7 after a failure the same slot can be reserved again (no stale pending)"
expect 0 "reserve after failed is allowed" node social/tools/publish.js reserve $REC instagram $WHEN

echo "# 8 checker on the test copy (phase 3 rules)"
expect 0 "check-records phase 3 on test copy" node social/tools/check-records.js --data "$T/data" --phase 3
echo "# 9 checker rejects a scheduled line without exact approval"
printf '{"id":"pub_rogue","idea_id":"%s","platform":"facebook","content_hash":"%s","status":"scheduled","at":"2026-10-16T00:00:00+03:00"}\n' $REC "$HASH" >> "$T/data/publishes.jsonl"
expect 1 "rogue scheduled line fails the checker" node social/tools/check-records.js --data "$T/data" --phase 3

rm -rf "$T"
echo "passed=$pass failed=$failn"; [ "$failn" -eq 0 ]
