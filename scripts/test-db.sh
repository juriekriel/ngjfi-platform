#!/usr/bin/env bash
# Apply every migration to a throwaway Postgres, then run tests/db/*.sql, each
# in its own transaction that is rolled back. Used by CI (postgres service).
#   PGHOST/PGPORT/PGUSER/PGDATABASE come from the environment.
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL=(psql -X -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f supabase/tests/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do
  echo "migrate $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f supabase/tests/01_helpers.sql
fail=0
for t in tests/db/*.sql; do
  if { echo "begin;"; cat "$t"; echo; echo "rollback;"; } | "${PSQL[@]}" >/dev/null; then
    echo "pass $(basename "$t")"
  else
    echo "FAIL $(basename "$t")"; fail=1
  fi
done
exit $fail
