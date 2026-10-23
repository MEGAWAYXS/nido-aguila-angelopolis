#!/usr/bin/env bash
# Prueba la migración y las políticas RLS en un PostgreSQL local temporal.
# Requiere PostgreSQL (p. ej. `brew install postgresql@17`). No usa datos reales.
set -euo pipefail
export LC_ALL=C LANG=C
PGBIN="${PGBIN:-$(brew --prefix postgresql@17 2>/dev/null)/bin}"
DIR="$(mktemp -d)"
PORT="${PORT:-54329}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
trap '"$PGBIN/pg_ctl" -D "$DIR" stop -m fast >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT

"$PGBIN/initdb" -D "$DIR" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR" -l "$DIR/log" start >/dev/null
PSQL=("$PGBIN/psql" -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -c "create database nido_test" postgres
"${PSQL[@]}" -f "$ROOT/supabase/tests/local_stubs.sql" nido_test
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f" nido_test; done
"${PSQL[@]}" -f "$ROOT/supabase/tests/rls_test.sql" nido_test
