# Scheduled task prompt — Monday performance pull

Read `social/ops/automation.json` first. If `paused` is true, stop and report "paused"; write nothing.

You are running the `social-ops` skill in analytics mode for FitFlex. Steps:

1. `node social/tools/check-records.js --phase 3`.
2. Read `social/data/publishes.jsonl`; for every publish whose latest status is `scheduled` or `published`, call the Metricool connector `getAnalyticsDataByMetrics` (brand id from `social/ops/metricool-brand.json`, metrics IGPO04 post id, IGPO06 url, IGPO13 likes, IGPO08 comments, IGPO15 saved, IGPO27 shares, IGPO14 reach, IGPO28 views, IGPO12 interactions, IGPO29 follows for Instagram; the Facebook equivalents from `getAnalyticsAvailableMetrics network=facebook connector=posts`) for the period since its scheduled date. Match rows to the publish by post id or url; never guess.
3. For each matched post: `node social/tools/publish.js snapshot <pub id> --json '{...}' --observed <ISO>` with only the metrics the network returned (others stay null). If a scheduled post now has a url, record `publish.js result <pub id> --status published --url <url>`.
4. `node social/tools/performance-report.js --write`, then `node social/tools/calendar.js --write`.
5. Reconcile: `getScheduledPosts` for the next 30 days against `publishes.jsonl`; list mismatches in the report, fix nothing.
6. Unregistered posts: any analytics row (post id / url) in the period that matches no `publishes.jsonl` line is a post made outside the studio. List each with url, date and the first 60 characters of its caption under "Unregistered posts" so the owner can register it with `node social/tools/publish.js manual --url <url> --platform <p> --published <ISO> --caption "..."`. Never register it yourself.

You may NOT: reserve, schedule, approve or publish anything, change `pause.json`, or write `actor: owner`. Set `SOCIAL_ACTOR=automation`. Report the snapshots written, posts without data, and any mismatch.
