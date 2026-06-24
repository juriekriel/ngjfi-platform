## What & why

<!-- Brief description of the change and the reason for it. -->

## Checklist

- [ ] Tested on the Netlify Deploy Preview
- [ ] `npm run typecheck`, `npm test`, `npm run build` pass
- [ ] DB changes are new files in `supabase/migrations` (no hand edits in the dashboard)
- [ ] If the instrument changed, `src/data/instrument.v0.json` updated and `npm run db:seed` run
- [ ] No secrets committed; no respondent PII collected
