# Test links and deleting responses

## Test links (for demos and trying it out)
When creating a link, tick **Test link**. The survey works exactly as it will
for real — screens, languages, offline queue, thank-you — but its answers are
written to separate tables (`test_sessions`, `test_responses`), never to
`sessions` / `responses`. Every score, count, map, benchmark and Collab figure
reads only the real tables, so test answers can never reach them. Test
answers are kept raw (never scored) and deleted automatically after
`test_retention_days` (7) — see migration 0038.

A link can be switched to or from test only while it's empty of the other
kind: real answers never silently become test ones, or the reverse.

## Deleting real responses (administrators only)
Admin console → The roll → **Manage** an organisation → **Delete responses**.
Choose a link, a time window, or both (never the whole organisation at once),
preview the exact count, give a reason, confirm. The database re-counts at the
moment of deletion and deletes nothing if the count changed since the
preview. Every deletion goes to `campaign_action_log` with the reason and the
administrator. There is no undo.

Organisations cannot delete responses themselves: if a ministry could remove
answers it didn't like, the Index would lose its credibility.

Deleting a **link** does not delete its responses — they stay in the
organisation's results. Deleting an **organisation** deletes everything under it.
